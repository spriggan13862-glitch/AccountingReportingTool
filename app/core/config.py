"""
Application settings loaded from environment variables / .env file.

All values have safe defaults for development. Production deployments must
supply SECRET_KEY, DATABASE_URL, and ALLOWED_ORIGINS at minimum.
"""

from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Identity
    ENVIRONMENT: str = "development"          # development | staging | production

    # Security
    SECRET_KEY: str = "dev-secret-key-change-in-production-must-be-32-chars-min"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60     # 1 hour
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Database
    DATABASE_URL: str = "sqlite:///./accounting.db"

    # CORS — comma-separated origins (covers Vite dev ports and 127.0.0.1 variants)
    ALLOWED_ORIGINS: str = (
        "http://localhost:5173,"
        "http://localhost:5174,"
        "http://127.0.0.1:5173,"
        "http://127.0.0.1:5174,"
        "http://localhost:3000,"
        "http://127.0.0.1:3000"
    )

    # Logging
    LOG_LEVEL: str = "INFO"
    LOG_JSON: bool = False                    # true in production for structured logs

    # Auth hardening
    MAX_LOGIN_ATTEMPTS: int = 5              # lock account after N consecutive failures
    ACCOUNT_LOCKOUT_MINUTES: int = 15

    # Upload limits
    MAX_IMPORT_SIZE_BYTES: int = 5 * 1024 * 1024  # 5 MB default max import file size

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"


settings = Settings()
