from pydantic_settings import BaseSettings, SettingsConfigDict

# Known dev defaults — banned in production via _validate_production() below
DEV_SECRET_KEY = "change-me-in-production-must-be-at-least-32-characters"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:password@localhost:5432/jarvis"

    # Security
    SECRET_KEY: str = DEV_SECRET_KEY
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # S3
    S3_ENDPOINT_URL: str = "http://localhost:9000"
    S3_ACCESS_KEY: str = "minioadmin"
    S3_SECRET_KEY: str = "minioadmin"
    S3_BUCKET_NAME: str = "jarvis"
    S3_PUBLIC_URL: str = "http://localhost:9000/jarvis"

    # App
    APP_ENV: str = "development"
    APP_VERSION: str = "1.0.0"
    ALLOWED_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

    # LLM (local Ollama runtime). Empty OLLAMA_URL disables AI features entirely.
    OLLAMA_URL: str = "http://localhost:11434"
    LLM_MODEL: str = "qwen3:8b"
    EMBED_MODEL: str = "nomic-embed-text"
    LLM_REQUEST_TIMEOUT_S: int = 300
    EMBED_DIM: int = 768

    # Observability — Sentry is opt-in. Empty DSN = no-op.
    SENTRY_DSN: str = ""
    SENTRY_TRACES_SAMPLE_RATE: float = 0.1

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",")]

    def validate_production(self) -> None:
        """Fail fast at startup if running in production with insecure dev defaults."""
        if self.APP_ENV != "production":
            return
        if self.SECRET_KEY == DEV_SECRET_KEY or len(self.SECRET_KEY) < 32:
            raise RuntimeError(
                "SECRET_KEY must be set to a secure random value (>=32 chars) in production",
            )
        if "minioadmin" in (self.S3_ACCESS_KEY, self.S3_SECRET_KEY):
            raise RuntimeError("S3 credentials must not use MinIO defaults in production")
        if "password@" in self.DATABASE_URL:
            raise RuntimeError("DATABASE_URL must not use the default 'password' credentials in production")


settings = Settings()
settings.validate_production()
