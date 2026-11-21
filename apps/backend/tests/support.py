"""Shared test wiring: one in-memory SQLite engine, a TestClient bound to it, and a fake Supabase Auth."""
import time
import uuid
from typing import Dict, Optional

import jwt
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import get_db
from app.main import app
from app.services.auth_provider import AuthProviderError, AuthSessionData

TEST_SUPABASE_URL = "https://test-project.supabase.co"
TEST_JWT_SECRET = "unit-test-only-signing-secret-at-least-32-bytes"

# In-memory SQLite with StaticPool and foreign_keys=ON for fast, isolated integration tests
TEST_ENGINE = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)


@event.listens_for(TEST_ENGINE, "connect")
def _enable_sqlite_fk(dbapi_connection, connection_record):  # type: ignore
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=TEST_ENGINE)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


def make_token(user_id: str, email: str = "user@example.com", **overrides) -> str:
    """Signs a token the way a Supabase project using a shared secret would."""
    now = int(time.time())
    claims = {
        "sub": user_id,
        "email": email,
        "aud": "authenticated",
        "iss": f"{TEST_SUPABASE_URL}/auth/v1",
        "iat": now,
        "exp": now + 3600,
    }
    claims.update(overrides)
    return jwt.encode(claims, TEST_JWT_SECRET, algorithm="HS256")


class FakeSupabaseAuth:
    """In-memory stand-in for Supabase Auth, implementing the provider's interface."""

    def __init__(self) -> None:
        self.users: Dict[str, dict] = {}
        self.require_confirmation = False
        self.unavailable = False
        self.recovery_codes: Dict[str, str] = {}
        self.signed_out_tokens: list[str] = []

    def _check_available(self) -> None:
        if self.unavailable:
            raise AuthProviderError("unavailable")

    def _session(self, user: dict) -> AuthSessionData:
        return AuthSessionData(
            user_id=user["id"],
            email=user["email"],
            display_name=user["display_name"],
            access_token=make_token(user["id"], user["email"]),
            expires_in=3600,
        )

    def sign_up(self, email: str, password: str, display_name: str) -> Optional[AuthSessionData]:
        self._check_available()
        if email in self.users:
            if self.require_confirmation:
                return None  # Supabase hides whether the address is already registered
            raise AuthProviderError("already_registered")
        user = {
            "id": str(uuid.uuid4()),
            "email": email,
            "password": password,
            "display_name": display_name,
            "confirmed": not self.require_confirmation,
        }
        self.users[email] = user
        return self._session(user) if user["confirmed"] else None

    def sign_in(self, email: str, password: str) -> AuthSessionData:
        self._check_available()
        user = self.users.get(email)
        if not user or user["password"] != password:
            raise AuthProviderError("invalid_credentials")
        if not user["confirmed"]:
            raise AuthProviderError("email_not_confirmed")
        return self._session(user)

    def request_password_reset(self, email: str) -> None:
        self._check_available()
        if email in self.users:
            self.recovery_codes[email] = "123456"

    def confirm_password_reset(self, email: str, code: str, new_password: str) -> None:
        self._check_available()
        if self.recovery_codes.get(email) != code:
            raise AuthProviderError("invalid_recovery_code")
        self.users[email]["password"] = new_password
        del self.recovery_codes[email]

    def sign_out(self, access_token: str) -> None:
        self._check_available()
        self.signed_out_tokens.append(access_token)

    def delete_user(self, user_id: str) -> None:
        self._check_available()
        for email, user in list(self.users.items()):
            if user["id"] == user_id:
                del self.users[email]


app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)
