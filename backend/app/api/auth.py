from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import Optional
import jwt

from app.dependencies.db import get_db
from app.models.user import User
from app.schemas.user import (
    UserCreate, UserLogin, UserResponse,
    TokenResponse, PasswordChange, UserUpdate
)
from app.core.config import settings
from app.core.security import (
    hash_password, verify_password,
    create_access_token, decode_token
)

router = APIRouter(prefix="/auth", tags=["Authentication"])
security = HTTPBearer()


# ========== REGISTRATION & LOGIN ==========

@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(
        user_data: UserCreate,
        db: Session = Depends(get_db)
):
    """
    Регистрация нового пользователя
    """
    # Проверяем, существует ли пользователь с таким email
    existing_user = db.query(User).filter(User.email == user_data.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User with this email already exists"
        )

    # Проверяем, существует ли пользователь с таким username
    existing_username = db.query(User).filter(User.username == user_data.username).first()
    if existing_username:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already taken"
        )

    # Создаем нового пользователя
    hashed_pw = hash_password(user_data.password)

    new_user = User(
        email=user_data.email,
        username=user_data.username,
        hashed_password=hashed_pw,
        full_name=user_data.full_name,
        is_active=True,
        created_at=datetime.utcnow()
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return new_user


@router.post("/login", response_model=TokenResponse)
def login(
        login_data: UserLogin,
        db: Session = Depends(get_db)
):
    """
    Вход в систему
    """
    # Ищем пользователя по email или username
    user = db.query(User).filter(
        (User.email == login_data.email_or_username) |
        (User.username == login_data.email_or_username)
    ).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Проверяем пароль
    if not verify_password(login_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Проверяем, активен ли пользователь
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is disabled"
        )

    # Создаем токены
    access_token = create_access_token(
        data={"sub": user.id, "email": user.email, "username": user.username}
    )

    refresh_token = create_access_token(
        data={"sub": user.id, "type": "refresh"},
        expires_delta=timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    )

    # Обновляем last_login
    user.last_login = datetime.utcnow()
    db.commit()

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    )


@router.post("/refresh", response_model=TokenResponse)
def refresh_token(
        refresh_token: str,
        db: Session = Depends(get_db)
):
    """
    Обновление access токена
    """
    # Декодируем refresh token
    payload = decode_token(refresh_token)

    if not payload or payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token"
        )

    user_id = payload.get("sub")
    user = db.query(User).filter(User.id == user_id).first()

    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive"
        )

    # Создаем новый access token
    access_token = create_access_token(
        data={"sub": user.id, "email": user.email, "username": user.username}
    )

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    )


# ========== CURRENT USER ==========

def get_current_user(
        credentials: HTTPAuthorizationCredentials = Depends(security),
        db: Session = Depends(get_db)
) -> User:
    """
    Получить текущего авторизованного пользователя
    """
    token = credentials.credentials
    payload = decode_token(token)

    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = payload.get("sub")
    user = db.query(User).filter(User.id == user_id).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is disabled"
        )

    return user


@router.get("/me", response_model=UserResponse)
def get_current_user_info(
        current_user: User = Depends(get_current_user)
):
    """
    Получить информацию о текущем пользователе
    """
    return current_user


@router.put("/me", response_model=UserResponse)
def update_current_user(
        user_update: UserUpdate,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db)
):
    """
    Обновить информацию о текущем пользователе
    """
    if user_update.full_name is not None:
        current_user.full_name = user_update.full_name

    if user_update.username is not None:
        # Проверяем, не занят ли username
        existing = db.query(User).filter(
            User.username == user_update.username,
            User.id != current_user.id
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username already taken"
            )
        current_user.username = user_update.username

    db.commit()
    db.refresh(current_user)

    return current_user


@router.post("/change-password")
def change_password(
        password_data: PasswordChange,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db)
):
    """
    Сменить пароль
    """
    # Проверяем старый пароль
    if not verify_password(password_data.old_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect old password"
        )

    # Устанавливаем новый пароль
    current_user.hashed_password = hash_password(password_data.new_password)
    db.commit()

    return {"message": "Password changed successfully"}


# ========== LOGOUT ==========

@router.post("/logout")
def logout(
        current_user: User = Depends(get_current_user)
):
    """
    Выход из системы (на клиенте нужно удалить токены)
    """
    # Здесь можно добавить токен в черный список
    # Для простоты просто возвращаем успешный ответ
    return {"message": "Successfully logged out"}


# ========== HEALTH CHECK ==========

@router.get("/health")
def health_check():
    """
    Проверка статуса сервиса аутентификации
    """
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat()
    }


# ========== OPTIONAL: PASSWORD RESET ==========

@router.post("/forgot-password")
def forgot_password(
        email: str,
        db: Session = Depends(get_db)
):
    """
    Запрос на сброс пароля
    """
    user = db.query(User).filter(User.email == email).first()

    # Для безопасности не сообщаем, существует ли пользователь
    if user:
        # Здесь нужно отправить email со ссылкой для сброса пароля
        # Генерируем токен сброса
        reset_token = create_access_token(
            data={"sub": user.id, "type": "password_reset"},
            expires_delta=timedelta(hours=24)
        )

        # В реальном приложении здесь отправляется email
        # Для разработки возвращаем токен
        return {
            "message": "If email exists, password reset link was sent",
            "debug_token": reset_token  # Только для разработки!
        }

    return {"message": "If email exists, password reset link was sent"}


@router.post("/reset-password")
def reset_password(
        token: str,
        new_password: str,
        db: Session = Depends(get_db)
):
    """
    Сброс пароля по токену
    """
    payload = decode_token(token)

    if not payload or payload.get("type") != "password_reset":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token"
        )

    user_id = payload.get("sub")
    user = db.query(User).filter(User.id == user_id).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    user.hashed_password = hash_password(new_password)
    db.commit()

    return {"message": "Password reset successfully"}