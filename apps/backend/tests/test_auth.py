"""Regression tests for account security: passwords, token verification, reset and deletion."""
import time

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec

from app.config import Settings, validate_auth_config
from app.main import app
from app.models import Profile, UserVocabulary
from app.security import _jwks_client
from app.services.auth_provider import AuthProviderError, SupabaseAuthProvider, get_auth_provider

from conftest import TEST_SUPABASE_URL, TestingSessionLocal, client, make_token

OLD_PUBLIC_DEFAULT_SECRET = "fluentup-dev-jwt-secret-change-in-production-32bytes"
PASSWORD = "CorrectHorse!Battery9"


def register(email="rafiq@example.com", password=PASSWORD, display_name="Rafiq"):
    return client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password, "display_name": display_name},
    )


def login(email="rafiq@example.com", password=PASSWORD):
    return client.post("/api/v1/auth/login", json={"email": email, "password": password})


def bearer(token):
    return {"Authorization": f"Bearer {token}"}


# --- Passwords ----------------------------------------------------------------


def test_login_rejects_wrong_password_and_returns_no_token():
    register()
    res = login(password="totally-wrong-password")
    assert res.status_code == 401
    assert "access_token" not in res.json()


def test_login_does_not_reveal_whether_an_email_is_registered():
    register()
    wrong_password = login(password="totally-wrong-password")
    unknown_email = login(email="nobody@example.com")
    assert wrong_password.status_code == unknown_email.status_code == 401
    assert wrong_password.json() == unknown_email.json()


def test_login_with_correct_password_returns_a_working_token():
    register()
    res = login()
    assert res.status_code == 200
    me = client.get("/api/v1/profile/me", headers=bearer(res.json()["access_token"]))
    assert me.status_code == 200
    assert me.json()["email"] == "rafiq@example.com"


def test_auth_endpoints_report_unavailable_when_supabase_is_not_configured(monkeypatch):
    from app.config import settings

    app.dependency_overrides.pop(get_auth_provider)
    monkeypatch.setattr(settings, "supabase_url", "")
    monkeypatch.setattr(settings, "supabase_anon_key", "")
    assert login().status_code == 503


def test_auth_provider_outage_is_reported_rather_than_treated_as_bad_password(auth_provider):
    register()
    auth_provider.unavailable = True
    assert login().status_code == 503


# --- Token verification ---------------------------------------------------------


@pytest.fixture
def existing_user():
    return register().json()


def test_token_forged_with_old_public_default_secret_is_rejected(existing_user):
    now = int(time.time())
    forged = jwt.encode(
        {
            "sub": existing_user["user_id"],
            "aud": "authenticated",
            "iss": f"{TEST_SUPABASE_URL}/auth/v1",
            "iat": now,
            "exp": now + 600,
        },
        OLD_PUBLIC_DEFAULT_SECRET,
        algorithm="HS256",
    )
    assert client.get("/api/v1/profile/me", headers=bearer(forged)).status_code == 401


def test_old_public_default_secret_is_never_used_even_if_configured(monkeypatch, existing_user):
    from app.config import settings

    monkeypatch.setattr(settings, "supabase_jwt_secret", OLD_PUBLIC_DEFAULT_SECRET)
    now = int(time.time())
    forged = jwt.encode(
        {
            "sub": existing_user["user_id"],
            "aud": "authenticated",
            "iss": f"{TEST_SUPABASE_URL}/auth/v1",
            "exp": now + 600,
        },
        OLD_PUBLIC_DEFAULT_SECRET,
        algorithm="HS256",
    )
    assert client.get("/api/v1/profile/me", headers=bearer(forged)).status_code == 401


@pytest.mark.parametrize(
    "overrides",
    [
        {"aud": "anon"},
        {"iss": "https://attacker.example.com/auth/v1"},
        {"exp": 1000},
    ],
    ids=["wrong-audience", "wrong-issuer", "expired"],
)
def test_tokens_with_invalid_claims_are_rejected(existing_user, overrides):
    token = make_token(existing_user["user_id"], **overrides)
    assert client.get("/api/v1/profile/me", headers=bearer(token)).status_code == 401


def test_validly_signed_token_with_non_uuid_subject_is_rejected():
    token = make_token("not-a-uuid")
    assert client.get("/api/v1/profile/me", headers=bearer(token)).status_code == 401


def test_unsigned_token_is_rejected(existing_user):
    token = jwt.encode(
        {
            "sub": existing_user["user_id"],
            "aud": "authenticated",
            "iss": f"{TEST_SUPABASE_URL}/auth/v1",
            "exp": int(time.time()) + 600,
        },
        None,
        algorithm="none",
    )
    assert client.get("/api/v1/profile/me", headers=bearer(token)).status_code == 401


def test_shared_secret_tokens_are_rejected_when_no_secret_is_configured(monkeypatch, existing_user):
    from app.config import settings

    token = make_token(existing_user["user_id"])
    monkeypatch.setattr(settings, "supabase_jwt_secret", "")
    assert client.get("/api/v1/profile/me", headers=bearer(token)).status_code == 401


def _es256_setup(monkeypatch):
    private_key = ec.generate_private_key(ec.SECP256R1())

    class SigningKey:
        key = private_key.public_key()

    class StubJwksClient:
        def get_signing_key_from_jwt(self, token):
            return SigningKey()

    monkeypatch.setattr("app.security._jwks_client", lambda url: StubJwksClient())
    return private_key


def test_asymmetric_token_from_project_signing_keys_is_accepted(monkeypatch, existing_user):
    from app.config import settings

    private_key = _es256_setup(monkeypatch)
    monkeypatch.setattr(settings, "supabase_jwt_secret", "")
    token = jwt.encode(
        {
            "sub": existing_user["user_id"],
            "aud": "authenticated",
            "iss": f"{TEST_SUPABASE_URL}/auth/v1",
            "exp": int(time.time()) + 600,
        },
        private_key,
        algorithm="ES256",
    )
    assert client.get("/api/v1/profile/me", headers=bearer(token)).status_code == 200


def test_asymmetric_token_signed_by_another_key_is_rejected(monkeypatch, existing_user):
    _es256_setup(monkeypatch)
    token = jwt.encode(
        {
            "sub": existing_user["user_id"],
            "aud": "authenticated",
            "iss": f"{TEST_SUPABASE_URL}/auth/v1",
            "exp": int(time.time()) + 600,
        },
        ec.generate_private_key(ec.SECP256R1()),
        algorithm="ES256",
    )
    assert client.get("/api/v1/profile/me", headers=bearer(token)).status_code == 401


def test_jwks_url_points_at_the_project():
    assert _jwks_client(f"{TEST_SUPABASE_URL}/auth/v1/.well-known/jwks.json").uri.startswith(TEST_SUPABASE_URL)


# --- Startup configuration ------------------------------------------------------


def complete_settings(**overrides):
    values = {
        "environment": "production",
        "supabase_url": "https://real.supabase.co",
        "supabase_anon_key": "real-anon-key",
        "supabase_service_role_key": "real-service-key",
        "supabase_jwt_secret": "",
    }
    values.update(overrides)
    return Settings(**values)


def test_production_starts_with_complete_config():
    validate_auth_config(complete_settings())


@pytest.mark.parametrize(
    "overrides,named",
    [
        ({"supabase_url": ""}, "SUPABASE_URL"),
        ({"supabase_anon_key": ""}, "SUPABASE_ANON_KEY"),
        ({"supabase_service_role_key": ""}, "SUPABASE_SERVICE_ROLE_KEY"),
        ({"supabase_url": "https://your-project-ref.supabase.co"}, "SUPABASE_URL"),
        ({"supabase_jwt_secret": OLD_PUBLIC_DEFAULT_SECRET}, "SUPABASE_JWT_SECRET"),
        ({"supabase_jwt_secret": "your-supabase-jwt-secret-placeholder"}, "SUPABASE_JWT_SECRET"),
        ({"supabase_jwt_secret": "too-short"}, "SUPABASE_JWT_SECRET"),
    ],
)
def test_production_refuses_to_start_with_unsafe_config(overrides, named):
    with pytest.raises(RuntimeError, match=named):
        validate_auth_config(complete_settings(**overrides))


def test_unrecognised_environment_is_treated_as_production():
    with pytest.raises(RuntimeError):
        validate_auth_config(complete_settings(environment="prod", supabase_url=""))


def test_development_can_start_without_supabase():
    validate_auth_config(Settings(environment="development", supabase_url="", supabase_jwt_secret=""))


# --- Sign-up and email confirmation --------------------------------------------


def test_signup_needing_email_confirmation_issues_no_token_and_no_profile(auth_provider):
    auth_provider.require_confirmation = True
    res = register()
    assert res.status_code == 202
    assert res.json()["status"] == "confirmation_required"
    assert "access_token" not in res.json()
    db = TestingSessionLocal()
    try:
        assert db.query(Profile).count() == 0
    finally:
        db.close()


def test_unconfirmed_user_cannot_log_in_until_confirmed(auth_provider):
    auth_provider.require_confirmation = True
    register()
    assert login().status_code == 403
    auth_provider.users["rafiq@example.com"]["confirmed"] = True
    res = login()
    assert res.status_code == 200
    assert res.json()["display_name"] == "Rafiq"


def test_signup_response_does_not_reveal_existing_account_when_confirmation_is_on(auth_provider):
    auth_provider.require_confirmation = True
    first = register()
    second = register()
    assert first.status_code == second.status_code == 202
    assert first.json() == second.json()


def test_profile_id_matches_the_supabase_user_id(auth_provider):
    user_id = register().json()["user_id"]
    assert user_id == auth_provider.users["rafiq@example.com"]["id"]


def test_login_does_not_attach_a_new_identity_to_someone_elses_profile(auth_provider):
    original_id = register().json()["user_id"]
    auth_provider.users["rafiq@example.com"]["id"] = "11111111-1111-1111-1111-111111111111"
    assert login().status_code == 409
    db = TestingSessionLocal()
    try:
        assert db.query(Profile).one().id == original_id
    finally:
        db.close()


# --- Password reset --------------------------------------------------------------


def request_reset(email="rafiq@example.com"):
    return client.post("/api/v1/auth/recover", json={"email": email})


def confirm_reset(code, new_password="BrandNewPassword!42", email="rafiq@example.com"):
    return client.post(
        "/api/v1/auth/recover/confirm",
        json={"email": email, "code": code, "new_password": new_password},
    )


def test_password_reset_actually_changes_the_password(auth_provider):
    register()
    assert request_reset().status_code == 200
    assert auth_provider.recovery_codes["rafiq@example.com"] == "123456"
    assert confirm_reset("123456").status_code == 200
    assert login().status_code == 401
    assert login(password="BrandNewPassword!42").status_code == 200


def test_password_reset_request_does_not_reveal_whether_email_exists():
    register()
    assert request_reset().json() == request_reset("nobody@example.com").json()


def test_password_reset_outage_is_not_reported_as_sent(auth_provider):
    auth_provider.unavailable = True
    assert request_reset().status_code == 503


def test_password_reset_with_wrong_code_keeps_old_password():
    register()
    request_reset()
    assert confirm_reset("000000").status_code == 400
    assert login().status_code == 200


def test_password_reset_guesses_are_rate_limited_per_email():
    register()
    request_reset()
    statuses = [confirm_reset("000000").status_code for _ in range(6)]
    assert statuses[-1] == 429


def test_failed_logins_do_not_block_a_password_reset():
    register()
    for _ in range(9):
        login(password="totally-wrong-password")
    assert request_reset().status_code == 200
    assert confirm_reset("123456").status_code == 200


# --- Sign-out and account deletion ---------------------------------------------


def test_logout_revokes_the_session_with_the_provider_too(auth_provider):
    token = register().json()["access_token"]
    assert client.post("/api/v1/auth/logout", headers=bearer(token)).status_code == 200
    assert auth_provider.signed_out_tokens == [token]
    assert client.get("/api/v1/profile/me", headers=bearer(token)).status_code == 401


def test_account_deletion_removes_the_supabase_user_so_login_fails(auth_provider):
    token = register().json()["access_token"]
    res = client.request("DELETE", "/api/v1/auth/account", headers=bearer(token), json={"reason": "test"})
    assert res.status_code == 200
    assert "rafiq@example.com" not in auth_provider.users
    assert login().status_code == 401


def test_account_deletion_keeps_data_when_supabase_user_cannot_be_deleted(auth_provider):
    token = register().json()["access_token"]
    client.post(
        "/api/v1/vocabulary",
        headers=bearer(token),
        json={"word_or_phrase": "ephemeral", "definition_en": "Lasting for a very short time."},
    )
    auth_provider.unavailable = True
    res = client.request("DELETE", "/api/v1/auth/account", headers=bearer(token), json={"reason": "test"})
    assert res.status_code == 503
    db = TestingSessionLocal()
    try:
        assert db.query(Profile).count() == 1
        assert db.query(UserVocabulary).count() == 1
    finally:
        db.close()


# --- Supabase HTTP client ---------------------------------------------------------


def provider_with(handler):
    return SupabaseAuthProvider(
        base_url=TEST_SUPABASE_URL,
        anon_key="anon-key",
        service_role_key="service-key",
        transport=httpx.MockTransport(handler),
    )


def token_body(**overrides):
    body = {
        "access_token": "supabase-access-token",
        "expires_in": 3600,
        "user": {"id": "user-1", "email": "a@example.com", "user_metadata": {"display_name": "Asha"}},
    }
    body.update(overrides)
    return body


def test_sign_in_sends_password_grant_with_anon_key():
    seen = {}

    def handler(request):
        seen.update(path=request.url.path, query=dict(request.url.params), apikey=request.headers["apikey"])
        return httpx.Response(200, json=token_body())

    session = provider_with(handler).sign_in("a@example.com", PASSWORD)
    assert seen == {"path": "/auth/v1/token", "query": {"grant_type": "password"}, "apikey": "anon-key"}
    assert (session.user_id, session.display_name, session.access_token) == ("user-1", "Asha", "supabase-access-token")


def test_sign_up_returns_none_when_supabase_returns_only_a_user():
    provider = provider_with(lambda r: httpx.Response(200, json={"id": "user-1", "email": "a@example.com"}))
    assert provider.sign_up("a@example.com", PASSWORD, "Asha") is None


@pytest.mark.parametrize(
    "status,body,kind",
    [
        (400, {"error_code": "invalid_credentials", "msg": "Invalid login credentials"}, "invalid_credentials"),
        (400, {"error": "invalid_grant", "error_description": "Invalid login credentials"}, "invalid_credentials"),
        (400, {"error_code": "email_not_confirmed", "msg": "Email not confirmed"}, "email_not_confirmed"),
        (422, {"error_code": "user_already_exists", "msg": "exists"}, "already_registered"),
        (422, {"error_code": "weak_password", "msg": "weak"}, "weak_password"),
        (429, {"error_code": "over_request_rate_limit", "msg": "slow"}, "rate_limited"),
        (403, {"error_code": "otp_expired", "msg": "expired"}, "invalid_recovery_code"),
        (500, {"msg": "boom"}, "unavailable"),
    ],
)
def test_supabase_errors_are_mapped_by_error_code(status, body, kind):
    provider = provider_with(lambda r: httpx.Response(status, json=body))
    with pytest.raises(AuthProviderError) as err:
        provider.sign_in("a@example.com", PASSWORD)
    assert err.value.kind == kind


def test_network_failure_is_reported_as_unavailable():
    def handler(request):
        raise httpx.ConnectError("no route")

    with pytest.raises(AuthProviderError) as err:
        provider_with(handler).sign_in("a@example.com", PASSWORD)
    assert err.value.kind == "unavailable"


def test_delete_user_uses_service_key_and_treats_missing_user_as_deleted():
    seen = {}

    def handler(request):
        seen.update(path=request.url.path, auth=request.headers["authorization"], method=request.method)
        return httpx.Response(404, json={"error_code": "user_not_found", "msg": "gone"})

    provider_with(handler).delete_user("user-1")
    assert seen == {"path": "/auth/v1/admin/users/user-1", "auth": "Bearer service-key", "method": "DELETE"}


def test_password_reset_verifies_code_then_sets_password_with_recovery_session():
    calls = []

    def handler(request):
        calls.append((request.method, request.url.path, request.headers.get("authorization")))
        if request.url.path.endswith("/verify"):
            return httpx.Response(200, json=token_body(access_token="recovery-token"))
        if request.url.path.endswith("/logout"):
            return httpx.Response(204)
        return httpx.Response(200, json={"id": "user-1"})

    provider_with(handler).confirm_password_reset("a@example.com", "123456", "BrandNewPassword!42")
    assert calls[0][:2] == ("POST", "/auth/v1/verify")
    assert calls[1] == ("PUT", "/auth/v1/user", "Bearer recovery-token")
    assert calls[2] == ("POST", "/auth/v1/logout", "Bearer recovery-token")
