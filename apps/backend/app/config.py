import os
from typing import List
from pydantic import BaseModel


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
    supabase_jwt_secret: str = os.getenv(
        "SUPABASE_JWT_SECRET",
        "fluentup-dev-jwt-secret-change-in-production-32bytes",
    )

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
    def cors_origins(self) -> List[str]:
        raw = os.getenv(
            "CORS_ALLOWED_ORIGINS",
            "http://localhost:8081,http://localhost:19006,https://fluentup.example.com",
        )
        return [o.strip() for o in raw.split(",") if o.strip()]


settings = Settings()
