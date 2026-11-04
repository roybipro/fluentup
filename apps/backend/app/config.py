import os
from typing import List
from pydantic import BaseModel

# Environments allowed to start without Supabase. Anything else is treated as production.
LOCAL_ENVIRONMENTS = {"development", "test"}
MIN_JWT_SECRET_LENGTH = 32

# Published in this repository's history or templates, so they can never protect real accounts.
PUBLIC_JWT_SECRETS = {
    "fluentup-dev-jwt-secret-change-in-production-32bytes",
    "your-supabase-jwt-secret-placeholder",
}


def is_configured(value: str) -> bool:
    return bool(value) and "placeholder" not in value and "your-project-ref" not in value


class Settings(BaseModel):
    environment: str = os.getenv("ENVIRONMENT", "development")
    project_name: str = os.getenv("PROJECT_NAME", "FluentUp API")
    api_v1_str: str = os.getenv("API_V1_STR", "/api/v1")

    # Database: defaults to local SQLite for zero-config test/dev or PostgreSQL via Supabase in staging/prod
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./fluentup_dev.db")

    # Supabase Auth & JWT
    supabase_url: str = os.getenv("SUPABASE_URL", "")
    supabase_anon_key: str = os.getenv("SUPABASE_ANON_KEY", "")
    supabase_service_role_key: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    # Optional: only for projects still signing tokens with the legacy shared secret.
    # Projects using asymmetric signing keys are verified through their public JWKS endpoint.
    supabase_jwt_secret: str = os.getenv("SUPABASE_JWT_SECRET", "")

    # Server-Side LLM Provider Credentials (NEVER exposed to mobile client)
    gemini_api_key: str = os.getenv("GEMINI_API_KEY", "")
    gemini_model: str = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    ai_request_timeout_seconds: float = float(os.getenv("AI_REQUEST_TIMEOUT_SECONDS", "20"))
    ai_max_daily_requests_free: int = int(os.getenv("AI_MAX_DAILY_REQUESTS_FREE", "30"))
    ai_max_daily_requests_premium: int = int(os.getenv("AI_MAX_DAILY_REQUESTS_PREMIUM", "300"))

    # Security & Operational Safeguards
    rate_limit_per_minute: int = int(os.getenv("RATE_LIMIT_PER_MINUTE", "60"))
    max_request_body_bytes: int = int(os.getenv("MAX_REQUEST_BODY_BYTES", "262144"))

    @property
    def supabase_issuer(self) -> str:
        return f"{self.supabase_url.rstrip('/')}/auth/v1"

    @property
    def supabase_jwks_url(self) -> str:
        return f"{self.supabase_issuer}/.well-known/jwks.json"

    @property
    def usable_jwt_secret(self) -> str:
        """The shared secret, or empty if it is missing, public or too short to trust."""
        secret = self.supabase_jwt_secret
        if secret in PUBLIC_JWT_SECRETS or len(secret) < MIN_JWT_SECRET_LENGTH:
            return ""
        return secret

    @property
    def cors_origins(self) -> List[str]:
        raw = os.getenv(
            "CORS_ALLOWED_ORIGINS",
            "http://localhost:8081,http://localhost:19006,https://fluentup.example.com",
        )
        return [o.strip() for o in raw.split(",") if o.strip()]


def validate_auth_config(config: Settings) -> None:
    """Stops a deployed backend from starting with auth settings that would leave accounts exposed."""
    if config.environment in LOCAL_ENVIRONMENTS:
        return

    problems = [
        name
        for name, value in (
            ("SUPABASE_URL", config.supabase_url),
            ("SUPABASE_ANON_KEY", config.supabase_anon_key),
            ("SUPABASE_SERVICE_ROLE_KEY", config.supabase_service_role_key),
        )
        if not is_configured(value)
    ]
    if config.supabase_jwt_secret and not config.usable_jwt_secret:
        problems.append("SUPABASE_JWT_SECRET")
    if problems:
        raise RuntimeError(
            f"Refusing to start in '{config.environment}': missing or unsafe {', '.join(problems)}"
        )


settings = Settings()
