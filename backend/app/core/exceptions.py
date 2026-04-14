from fastapi import HTTPException, status
from typing import Any, Dict, Optional


class AppException(HTTPException):
    """
    Базовое исключение приложения
    """

    def __init__(
            self,
            status_code: int,
            message: str,
            details: Optional[Dict[str, Any]] = None
    ):
        super().__init__(status_code=status_code, detail=message)
        self.details = details or {}


class NotFoundException(AppException):
    """Исключение для ненайденных ресурсов"""

    def __init__(self, resource: str, identifier: str):
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            message=f"{resource} with identifier '{identifier}' not found",
            details={"resource": resource, "identifier": identifier}
        )


class ConflictException(AppException):
    """Исключение для конфликтов (дубликаты и т.д.)"""

    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(
            status_code=status.HTTP_409_CONFLICT,
            message=message,
            details=details
        )


class ValidationException(AppException):
    """Исключение для ошибок валидации"""

    def __init__(self, message: str, errors: Dict[str, Any]):
        super().__init__(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            message=message,
            details={"errors": errors}
        )


class UnauthorizedException(AppException):
    """Исключение для неавторизованного доступа"""

    def __init__(self, message: str = "Unauthorized access"):
        super().__init__(
            status_code=status.HTTP_401_UNAUTHORIZED,
            message=message,
            details={"auth": "required"}
        )


class ForbiddenException(AppException):
    """Исключение для запрещенного доступа"""

    def __init__(self, message: str = "Access forbidden"):
        super().__init__(
            status_code=status.HTTP_403_FORBIDDEN,
            message=message
        )


class RateLimitException(AppException):
    """Исключение для превышения лимита запросов"""

    def __init__(self, retry_after: int):
        super().__init__(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            message=f"Too many requests. Please try again in {retry_after} seconds.",
            details={"retry_after": retry_after}
        )


class FileUploadException(AppException):
    """Исключение для ошибок загрузки файлов"""

    def __init__(self, message: str):
        super().__init__(
            status_code=status.HTTP_400_BAD_REQUEST,
            message=message
        )


class DatabaseException(AppException):
    """Исключение для ошибок базы данных"""

    def __init__(self, message: str = "Database error occurred"):
        super().__init__(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            message=message
        )