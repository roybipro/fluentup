import pytest

from app.database import Base
from tests.support import TEST_ENGINE


@pytest.fixture(autouse=True)
def freeze_rate_limit_window(monkeypatch):
    # Fixed one-minute windows would reset mid-test if a test straddles a minute boundary.
    monkeypatch.setattr("app.security.current_rate_limit_window", lambda: 29_000_000)


@pytest.fixture(autouse=True)
def reset_db():
    # Fresh schema per test; revocations and rate-limit counters live in these tables too.
    Base.metadata.drop_all(bind=TEST_ENGINE)
    Base.metadata.create_all(bind=TEST_ENGINE)
    yield
