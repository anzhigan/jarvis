from app.core.config import settings
from app.core.database import engine, SessionLocal, get_db, init_database
from app.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
    generate_password_reset_token,
    verify_password_reset_token
)
from app.core.exceptions import (
    AppException,
    NotFoundException,
    ConflictException,
    ValidationException,
    UnauthorizedException,
    ForbiddenException,
    RateLimitException,
    FileUploadException,
    DatabaseException
)

# Опционально (если используете Redis)
try:
    from app.core.redis_client import redis_client, cache_result
    from app.core.rate_limiter import rate_limiter, rate_limit
except ImportError:
    redis_client = None
    cache_result = None
    rate_limiter = None
    rate_limit = None

__all__ = [
    "settings",
    "engine",
    "SessionLocal",
    "get_db",
    "init_database",
    "hash_password",
    "verify_password",
    "create_access_token",
    "create_refresh_token",
    "decode_token",
    "generate_password_reset_token",
    "verify_password_reset_token",
    "AppException",
    "NotFoundException",
    "ConflictException",
    "ValidationException",
    "UnauthorizedException",
    "ForbiddenException",
    "RateLimitException",
    "FileUploadException",
    "DatabaseException",
    "redis_client",
    "cache_result",
    "rate_limiter",
    "rate_limit"
]