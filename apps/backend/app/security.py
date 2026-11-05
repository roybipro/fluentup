import hashlib
import time
import uuid
from collections import defaultdict
from functools import lru_cache
from typing import Dict, List, Optional
import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session
from app.config import settings
from app.database import get_db
from app.models import Profile

security_scheme = HTTPBearer(auto_error=False)

ASYMMETRIC_ALGORITHMS = {"ES256", "RS256"}
JWKS_CACHE_SECONDS = 600

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


@lru_cache(maxsize=1)
def _jwks_client(url: str) -> jwt.PyJWKClient:
    return jwt.PyJWKClient(url, cache_keys=True, lifespan=JWKS_CACHE_SECONDS, timeout=5)


def verify_access_token(token: str) -> dict:
    """
    Verifies a Supabase access token. The key comes from the algorithm's own trust source, so a
    token cannot choose how it is checked: asymmetric tokens use the project's public keys, and
    HS256 is accepted only when a real shared secret is configured.
    """
    algorithm = jwt.get_unverified_header(token).get("alg")
    if algorithm in ASYMMETRIC_ALGORITHMS and settings.supabase_url:
        key = _jwks_client(settings.supabase_jwks_url).get_signing_key_from_jwt(token).key
    elif algorithm == "HS256" and settings.usable_jwt_secret:
        key = settings.usable_jwt_secret
    else:
        raise jwt.InvalidTokenError("Unsupported token signature")

    return jwt.decode(
        token,
        key,
        algorithms=[algorithm],
        audience="authenticated",
        issuer=settings.supabase_issuer,
        options={"require": ["exp", "sub", "aud", "iss"]},
    )


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
        payload = verify_access_token(token)
    except jwt.PyJWKClientConnectionError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to verify your session right now. Please try again.",
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session token has expired",
        )
    except (jwt.InvalidTokenError, jwt.PyJWKClientError):
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

    try:
        uuid.UUID(str(user_id))
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
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
