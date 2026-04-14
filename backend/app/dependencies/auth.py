from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from typing import Optional
import logging

from app.dependencies.db import get_db
from app.models.user import User
from app.core.security import decode_token
from app.core.config import settings

logger = logging.getLogger(__name__)

# Настройка Bearer токена
security = HTTPBearer(auto_error=False)


async def get_current_user(
        credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
        db: Session = Depends(get_db)
) -> Optional[User]:
    """
    Получить текущего пользователя из JWT токена.

    Если токен не предоставлен или невалиден, возвращает None.
    Для защищенных эндпоинтов используйте get_current_active_user.
    """
    if not credentials:
        return None

    token = credentials.credentials

    # Декодируем токен
    payload = decode_token(token)

    if not payload:
        return None

    # Проверяем тип токена
    if payload.get("type") != "access":
        return None

    user_id = payload.get("sub")
    if not user_id:
        return None

    # Получаем пользователя из БД
    user = db.query(User).filter(User.id == user_id).first()

    return user


async def get_current_active_user(
        current_user: Optional[User] = Depends(get_current_user),
) -> User:
    """
    Получить текущего активного пользователя.

    Требует валидный JWT токен.
    Возвращает 401 если пользователь не авторизован.
    Возвращает 403 если пользователь неактивен.
    """
    if not current_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is disabled"
        )

    return current_user


async def get_current_admin_user(
        current_user: User = Depends(get_current_active_user),
) -> User:
    """
    Получить текущего пользователя с правами администратора.

    Требует валидный JWT токен и права администратора.
    """
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required"
        )

    return current_user


async def get_current_user_optional(
        credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
        db: Session = Depends(get_db)
) -> Optional[User]:
    """
    Получить текущего пользователя, если токен предоставлен.

    Не вызывает ошибку при отсутствии токена.
    """
    return await get_current_user(credentials, db)


# Альтернативные dependency для разных уровней доступа

def require_auth():
    """
    Декоратор для эндпоинтов, требующих авторизацию.

    Использование:
        @router.get("/protected")
        @require_auth()
        def protected_endpoint(user: User = Depends(get_current_active_user)):
            return {"user_id": user.id}
    """

    def decorator(func):
        async def wrapper(*args, **kwargs):
            # Проверяем, что user передан в kwargs
            if "user" not in kwargs:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Authentication required"
                )
            return await func(*args, **kwargs)

        return wrapper

    return decorator


# Вспомогательные функции для проверки прав

def check_owner_or_admin(resource_user_id: str, current_user: User) -> bool:
    """
    Проверить, является ли текущий пользователь владельцем ресурса или админом.
    """
    return current_user.is_admin or current_user.id == resource_user_id


def check_admin_only(current_user: User) -> bool:
    """
    Проверить, является ли текущий пользователь админом.
    """
    return current_user.is_admin


def check_active_only(current_user: User) -> bool:
    """
    Проверить, активен ли пользователь.
    """
    return current_user.is_active