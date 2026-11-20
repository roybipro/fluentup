"""Revocation and rate limits must live in the database so every API instance sees them."""
import hashlib

import pytest
from fastapi import HTTPException

from app.config import settings
from tests.support import TestingSessionLocal, client
from tests.test_api import _register


def test_revoked_token_is_stored_hashed_in_the_database():
    from app.models import RevokedToken

    headers = _register("revoke@example.com")
    token = headers["Authorization"].split(" ", 1)[1]
    assert client.post("/api/v1/auth/logout", headers=headers).status_code == 200

    db = TestingSessionLocal()
    try:
        rows = db.query(RevokedToken).all()
        assert [r.token_hash for r in rows] == [hashlib.sha256(token.encode()).hexdigest()]
    finally:
        db.close()
    assert client.get("/api/v1/profile/me", headers=headers).status_code == 401


def test_rate_limit_counts_are_shared_across_sessions():
    from app.security import check_rate_limit

    sessions = [TestingSessionLocal() for _ in range(3)]
    try:
        for i in range(5):
            check_rate_limit(sessions[i % 3], "shared-key", max_per_minute=5)
        with pytest.raises(HTTPException) as exc:
            check_rate_limit(sessions[2], "shared-key", max_per_minute=5)
        assert exc.value.status_code == 429
    finally:
        for s in sessions:
            s.close()


def _login_with_xff(xff: str):
    return client.post(
        "/api/v1/auth/login",
        json={"email": "nobody@example.com", "password": "Password123!"},
        headers={"X-Forwarded-For": xff},
    )


def test_spoofed_forwarded_for_is_ignored_without_trusted_proxy(monkeypatch):
    monkeypatch.setattr(settings, "trusted_proxy_hops", 0)
    codes = [_login_with_xff(f"203.0.113.{i}").status_code for i in range(21)]
    assert codes[-1] == 429


def test_forwarded_for_is_used_behind_trusted_proxy(monkeypatch):
    monkeypatch.setattr(settings, "trusted_proxy_hops", 1)
    codes = [_login_with_xff(f"198.51.100.7, 203.0.113.{i}").status_code for i in range(21)]
    assert 429 not in codes
