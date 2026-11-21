import pytest

from app.config import settings
from app.database import Base
from app.main import app
from app.services.auth_provider import get_auth_provider
from tests.support import (  # noqa: F401 - re-exported for tests that import from conftest
    TEST_ENGINE,
    TEST_JWT_SECRET,
    TEST_SUPABASE_URL,
    FakeSupabaseAuth,
    TestingSessionLocal,
    client,
    make_token,
)


@pytest.fixture(autouse=True)
def freeze_rate_limit_window(monkeypatch):
    # Fixed one-minute windows would reset mid-test if a test straddles a minute boundary.
    monkeypatch.setattr("app.security.current_rate_limit_window", lambda: 29_000_000)


@pytest.fixture
def auth_provider() -> FakeSupabaseAuth:
    return FakeSupabaseAuth()


@pytest.fixture(autouse=True)
def isolated_app_state(monkeypatch, auth_provider):
    # Fresh schema per test; revocations and rate-limit counters live in these tables too.
    Base.metadata.drop_all(bind=TEST_ENGINE)
    Base.metadata.create_all(bind=TEST_ENGINE)
    monkeypatch.setattr(settings, "supabase_url", TEST_SUPABASE_URL)
    monkeypatch.setattr(settings, "supabase_jwt_secret", TEST_JWT_SECRET)
    app.dependency_overrides[get_auth_provider] = lambda: auth_provider
    yield
    app.dependency_overrides.pop(get_auth_provider, None)
