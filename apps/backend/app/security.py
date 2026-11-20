import hashlib
import time
from datetime import datetime, timedelta, timezone
from typing import Optional
import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import delete
from sqlalchemy.orm import Session
from app.config import settings
from app.database import get_db
from app.models import Profile, RateLimitHit, RevokedToken

security_scheme = HTTPBearer(auto_error=False)


def client_ip(request: Request) -> str:
    """Caller IP. X-Forwarded-For is only trusted when TRUSTED_PROXY_HOPS says proxies append to it."""
    hops = settings.trusted_proxy_hops
    if hops > 0:
        forwarded = [p.strip() for p in request.headers.get("x-forwarded-for", "").split(",") if p.strip()]
        if len(forwarded) >= hops:
            return forwarded[-hops]
    return request.client.host if request.client else "unknown"


def _insert_for(db: Session):
    dialect = db.get_bind().dialect.name
    if dialect == "postgresql":
        from sqlalchemy.dialects.postgresql import insert
    elif dialect == "sqlite":
        from sqlalchemy.dialects.sqlite import insert
    else:  # pragma: no cover - only Postgres (prod) and SQLite (dev/test) are supported
        raise RuntimeError(f"Unsupported database dialect for rate limiting: {dialect}")
    return insert


def current_rate_limit_window() -> int:
    return int(time.time() // 60)


def check_rate_limit(db: Session, client_key: str, max_per_minute: Optional[int] = None) -> None:
    """Atomic fixed-window counter in the database, so the limit holds across API instances.

    Commits immediately: a hit must count even if the request later fails (e.g. a wrong password).
    """
    limit = max_per_minute if max_per_minute is not None else settings.rate_limit_per_minute
    window = current_rate_limit_window()
    insert = _insert_for(db)
    stmt = (
        insert(RateLimitHit)
        .values(bucket_key=client_key[:160], window_minute=window, hits=1)
        .on_conflict_do_update(
            index_elements=["bucket_key", "window_minute"],
            set_={"hits": RateLimitHit.hits + 1},
        )
        .returning(RateLimitHit.hits)
    )
    hits = db.execute(stmt).scalar_one()
    if hits == 1:
        # First hit in a new window for this key: prune counters older than an hour.
        db.execute(delete(RateLimitHit).where(RateLimitHit.window_minute < window - 60))
    db.commit()
    if hits > limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded. Please wait before sending more requests.",
        )


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_access_token(user_id: str, email: str, expires_seconds: int = 3600) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "email": email,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=expires_seconds)).timestamp()),
        "aud": "authenticated",
    }
    return jwt.encode(payload, settings.supabase_jwt_secret, algorithm="HS256")


def revoke_token(db: Session, token: str) -> None:
    """Record a token as revoked until it would have expired anyway."""
    try:
        exp = jwt.decode(token, options={"verify_signature": False}).get("exp")
        expires_at = datetime.fromtimestamp(int(exp), tz=timezone.utc)
    except (jwt.InvalidTokenError, TypeError, ValueError):
        expires_at = datetime.now(timezone.utc) + timedelta(days=1)
    now = datetime.now(timezone.utc)
    db.execute(delete(RevokedToken).where(RevokedToken.expires_at < now))
    if db.get(RevokedToken, _token_hash(token)) is None:
        db.add(RevokedToken(token_hash=_token_hash(token), expires_at=expires_at))
    db.commit()


def hash_email(email: str) -> str:
    return hashlib.sha256(email.strip().lower().encode("utf-8")).hexdigest()


def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> Profile:
    """
    Strictly derives user identity from a verified JWT token and ensures the profile still exists.
    Never trusts a client-supplied user_id parameter.
    """
    check_rate_limit(db, f"ip:{client_ip(request)}")

    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication token",
        )

    token = credentials.credentials
    if db.get(RevokedToken, _token_hash(token)) is not None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session token has been revoked",
        )

    try:
        payload = jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            options={"verify_aud": False},
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session token has expired",
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
        )

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing subject claim",
        )

    profile = db.query(Profile).filter(Profile.id == str(user_id)).first()
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User profile not found or account was deleted",
        )

    return profile
