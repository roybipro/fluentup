import hashlib
import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional
import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session
from app.config import settings
from app.database import get_db
from app.models import Profile

security_scheme = HTTPBearer(auto_error=False)

# Revoked tokens set (in-memory for immediate logout/deletion revocation + DB profile check)
REVOKED_TOKENS: set[str] = set()

# Sliding-window rate limiter store: key -> list of request timestamps
RATE_LIMIT_STORE: Dict[str, List[float]] = defaultdict(list)


def clear_rate_limits() -> None:
    RATE_LIMIT_STORE.clear()


def check_rate_limit(client_key: str, max_per_minute: Optional[int] = None) -> None:
    limit = max_per_minute if max_per_minute is not None else settings.rate_limit_per_minute
    now = time.time()
    window_start = now - 60.0
    history = [ts for ts in RATE_LIMIT_STORE[client_key] if ts > window_start]
    if len(history) >= limit:
        RATE_LIMIT_STORE[client_key] = history
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded. Please wait before sending more requests.",
        )
    history.append(now)
    RATE_LIMIT_STORE[client_key] = history


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


def revoke_token(token: str) -> None:
    REVOKED_TOKENS.add(token)


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
    client_ip = request.client.host if request.client else "unknown"
    check_rate_limit(f"ip:{client_ip}")

    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication token",
        )

    token = credentials.credentials
    if token in REVOKED_TOKENS:
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


def get_optional_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> Optional[Profile]:
    client_ip = request.client.host if request.client else "unknown"
    check_rate_limit(f"ip:{client_ip}")
    if credentials is None or not credentials.credentials:
        return None
    try:
        return get_current_user(request=request, credentials=credentials, db=db)
    except HTTPException:
        return None
