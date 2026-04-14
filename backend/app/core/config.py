from pydantic_settings import BaseSettings
from typing import Optional, List
import os
from dotenv import load_dotenv

load_dotenv()


class Settings(BaseSettings):
    """
    Настройки приложения
    """

    # ========== APPLICATION ==========
    APP_NAME: str = "Jarvis API"
    APP_VERSION: str = "1.0.0"
    APP_ENV: str = os.getenv("APP_ENV", "development")
    DEBUG: bool = APP_ENV == "development"

    # ========== SERVER ==========
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))
    API_PREFIX: str = "/api/v1"

    # ========== DATABASE ==========
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql://dima_admin:root@localhost:5432/jarvis_db"
    )
    DATABASE_POOL_SIZE: int = int(os.getenv("DATABASE_POOL_SIZE", "10"))
    DATABASE_MAX_OVERFLOW: int = int(os.getenv("DATABASE_MAX_OVERFLOW", "20"))
    DATABASE_POOL_TIMEOUT: int = int(os.getenv("DATABASE_POOL_TIMEOUT", "30"))
    DATABASE_ECHO: bool = DEBUG

    # ========== SECURITY ==========
    SECRET_KEY: str = os.getenv("SECRET_KEY", "your-secret-key-change-in-production")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
    REFRESH_TOKEN_EXPIRE_DAYS: int = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))

    # ========== CORS ==========
    CORS_ORIGINS: List[str] = os.getenv(
        "CORS_ORIGINS",
        "http://localhost:3000,http://localhost:5173,http://localhost:8000"
    ).split(",")
    CORS_ALLOW_CREDENTIALS: bool = True
    CORS_ALLOW_METHODS: List[str] = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"]
    CORS_ALLOW_HEADERS: List[str] = ["*"]

    # ========== FILE UPLOAD ==========
    UPLOAD_DIR: str = os.getenv("UPLOAD_DIR", "uploads")
    MAX_FILE_SIZE: int = int(os.getenv("MAX_FILE_SIZE", "10485760"))  # 10MB
    ALLOWED_EXTENSIONS: set = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"}
    MAX_IMAGES_PER_NOTE: int = int(os.getenv("MAX_IMAGES_PER_NOTE", "20"))

    # ========== RATE LIMITING ==========
    RATE_LIMIT_ENABLED: bool = APP_ENV == "production"
    RATE_LIMIT_REQUESTS: int = int(os.getenv("RATE_LIMIT_REQUESTS", "100"))
    RATE_LIMIT_PERIOD: int = int(os.getenv("RATE_LIMIT_PERIOD", "60"))  # seconds

    # ========== LOGGING ==========
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
    LOG_FORMAT: str = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    LOG_FILE: Optional[str] = os.getenv("LOG_FILE", None)

    # ========== REDIS (опционально) ==========
    REDIS_URL: Optional[str] = os.getenv("REDIS_URL", None)
    REDIS_CACHE_TTL: int = int(os.getenv("REDIS_CACHE_TTL", "300"))  # 5 minutes

    # ========== EMAIL (для сброса пароля) ==========
    SMTP_HOST: Optional[str] = os.getenv("SMTP_HOST", None)
    SMTP_PORT: int = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USER: Optional[str] = os.getenv("SMTP_USER", None)
    SMTP_PASSWORD: Optional[str] = os.getenv("SMTP_PASSWORD", None)
    SMTP_FROM_EMAIL: Optional[str] = os.getenv("SMTP_FROM_EMAIL", None)
    SMTP_FROM_NAME: str = "Jarvis App"

    # ========== FRONTEND ==========
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:5173")
    FRONTEND_RESET_PASSWORD_URL: str = f"{FRONTEND_URL}/reset-password"

    class Config:
        env_file = ".env"
        case_sensitive = True


# Создаем глобальный экземпляр настроек
settings = Settings()


# Вспомогательные функции
def is_development() -> bool:
    """Проверка, что приложение запущено в режиме разработки"""
    return settings.APP_ENV == "development"


def is_production() -> bool:
    """Проверка, что приложение запущено в режиме продакшена"""
    return settings.APP_ENV == "production"


def is_testing() -> bool:
    """Проверка, что приложение запущено в режиме тестирования"""
    return settings.APP_ENV == "testing"


def get_database_url() -> str:
    """Получить URL базы данных (с учетом окружения)"""
    return settings.DATABASE_URL