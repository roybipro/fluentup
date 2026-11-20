"""Client for Supabase Auth, which owns passwords, confirmation emails and password resets."""
from dataclasses import dataclass
from typing import Any, Dict, Optional

import httpx
from fastapi import HTTPException, status

from app.config import is_configured, settings

REQUEST_TIMEOUT_SECONDS = 10.0
DEFAULT_DISPLAY_NAME = "Learner"

_KIND_BY_ERROR_CODE = {
    "invalid_credentials": "invalid_credentials",
    "invalid_grant": "invalid_credentials",
    "email_not_confirmed": "email_not_confirmed",
    "user_already_exists": "already_registered",
    "email_exists": "already_registered",
    "weak_password": "weak_password",
    "otp_expired": "invalid_recovery_code",
    "otp_disabled": "invalid_recovery_code",
    "user_not_found": "user_not_found",
}


class AuthProviderError(Exception):
    def __init__(self, kind: str) -> None:
        super().__init__(kind)
        self.kind = kind


@dataclass
class AuthSessionData:
    user_id: str
    email: str
    display_name: str
    access_token: str
    expires_in: int


def _session_from(body: Dict[str, Any]) -> AuthSessionData:
    user = body["user"]
    metadata = user.get("user_metadata") or {}
    return AuthSessionData(
        user_id=user["id"],
        email=user["email"],
        display_name=metadata.get("display_name") or DEFAULT_DISPLAY_NAME,
        access_token=body["access_token"],
        expires_in=int(body.get("expires_in") or 3600),
    )


def _error_kind(response: httpx.Response) -> str:
    try:
        body = response.json()
    except ValueError:
        body = {}
    error_code = body.get("error_code") or body.get("error")
    if error_code in _KIND_BY_ERROR_CODE:
        return _KIND_BY_ERROR_CODE[error_code]
    if response.status_code == 429 or str(error_code).startswith("over_"):
        return "rate_limited"
    return "unavailable"


class SupabaseAuthProvider:
    def __init__(
        self,
        base_url: str,
        anon_key: str,
        service_role_key: str = "",
        transport: Optional[httpx.BaseTransport] = None,
    ) -> None:
        self._anon_key = anon_key
        self._service_role_key = service_role_key
        self._client = httpx.Client(
            base_url=f"{base_url.rstrip('/')}/auth/v1",
            timeout=REQUEST_TIMEOUT_SECONDS,
            transport=transport,
        )

    def _request(
        self,
        method: str,
        path: str,
        *,
        bearer: Optional[str] = None,
        api_key: Optional[str] = None,
        **kwargs: Any,
    ) -> httpx.Response:
        headers = {"apikey": api_key or self._anon_key}
        if bearer:
            headers["Authorization"] = f"Bearer {bearer}"
        try:
            response = self._client.request(method, path, headers=headers, **kwargs)
        except httpx.HTTPError as exc:
            raise AuthProviderError("unavailable") from exc
        if response.is_error:
            raise AuthProviderError(_error_kind(response))
        return response

    def sign_up(self, email: str, password: str, display_name: str) -> Optional[AuthSessionData]:
        """Returns a session, or None when the user must confirm their email first."""
        body = self._request(
            "POST",
            "/signup",
            json={"email": email, "password": password, "data": {"display_name": display_name}},
        ).json()
        return _session_from(body) if body.get("access_token") else None

    def sign_in(self, email: str, password: str) -> AuthSessionData:
        response = self._request(
            "POST",
            "/token",
            params={"grant_type": "password"},
            json={"email": email, "password": password},
        )
        return _session_from(response.json())

    def request_password_reset(self, email: str) -> None:
        self._request("POST", "/recover", json={"email": email})

    def confirm_password_reset(self, email: str, code: str, new_password: str) -> None:
        verified = self._request(
            "POST",
            "/verify",
            json={"type": "recovery", "email": email, "token": code},
        ).json()
        recovery_token = verified["access_token"]
        self._request("PUT", "/user", bearer=recovery_token, json={"password": new_password})
        # A reset may be a response to a compromised account, so end its other sessions.
        try:
            self.sign_out(recovery_token, scope="global")
        except AuthProviderError:
            pass

    def sign_out(self, access_token: str, scope: str = "local") -> None:
        self._request("POST", "/logout", bearer=access_token, params={"scope": scope})

    def delete_user(self, user_id: str) -> None:
        """Deletes the login. A user who is already gone counts as deleted, so retries are safe."""
        try:
            self._request(
                "DELETE",
                f"/admin/users/{user_id}",
                bearer=self._service_role_key,
                api_key=self._service_role_key,
            )
        except AuthProviderError as exc:
            if exc.kind != "user_not_found":
                raise


def get_auth_provider() -> SupabaseAuthProvider:
    if not is_configured(settings.supabase_url) or not is_configured(settings.supabase_anon_key):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Sign-in is not available right now. Please try again later.",
        )
    return SupabaseAuthProvider(
        base_url=settings.supabase_url,
        anon_key=settings.supabase_anon_key,
        service_role_key=settings.supabase_service_role_key,
    )
