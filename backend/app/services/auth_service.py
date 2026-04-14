from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional, Dict, Any
from datetime import datetime, timedelta
from fastapi import HTTPException, status

from app.models.user import User
from app.schemas.user import UserCreate, UserUpdate
from app.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
    generate_password_reset_token,
    verify_password_reset_token
)
from app.core.config import settings


class AuthService:
    """
    Сервис для аутентификации и управления пользователями
    """

    def __init__(self, db: Session):
        self.db = db

    # ========== USER MANAGEMENT ==========

    def get_user(self, user_id: str) -> User:
        """Получить пользователя по ID"""
        user = self.db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail=f"User {user_id} not found")
        return user

    def get_user_by_email(self, email: str) -> Optional[User]:
        """Получить пользователя по email"""
        return self.db.query(User).filter(User.email == email).first()

    def get_user_by_username(self, username: str) -> Optional[User]:
        """Получить пользователя по username"""
        return self.db.query(User).filter(User.username == username).first()

    def get_users(
            self,
            skip: int = 0,
            limit: int = 100,
            active_only: bool = False
    ) -> tuple[list[User], int]:
        """Получить список пользователей"""
        query = self.db.query(User)
        if active_only:
            query = query.filter(User.is_active == True)

        total = query.count()
        users = query.offset(skip).limit(limit).all()

        return users, total

    def create_user(self, user_data: UserCreate) -> User:
        """Создать нового пользователя"""
        # Проверяем email
        existing_email = self.get_user_by_email(user_data.email)
        if existing_email:
            raise HTTPException(
                status_code=400,
                detail="User with this email already exists"
            )

        # Проверяем username
        existing_username = self.get_user_by_username(user_data.username)
        if existing_username:
            raise HTTPException(
                status_code=400,
                detail="Username already taken"
            )

        # Создаем пользователя
        hashed_pw = hash_password(user_data.password)

        user = User(
            email=user_data.email,
            username=user_data.username,
            full_name=user_data.full_name,
            hashed_password=hashed_pw,
            is_active=True,
            is_admin=False,
            is_verified=False,
            created_at=datetime.utcnow()
        )

        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)

        return user

    def update_user(self, user_id: str, user_data: UserUpdate) -> User:
        """Обновить пользователя"""
        user = self.get_user(user_id)

        if user_data.full_name is not None:
            user.full_name = user_data.full_name

        if user_data.username is not None:
            # Проверяем уникальность username
            existing = self.get_user_by_username(user_data.username)
            if existing and existing.id != user_id:
                raise HTTPException(
                    status_code=400,
                    detail="Username already taken"
                )
            user.username = user_data.username

        if user_data.avatar_url is not None:
            user.avatar_url = user_data.avatar_url

        if user_data.bio is not None:
            user.bio = user_data.bio

        if user_data.theme_preference is not None:
            user.theme_preference = user_data.theme_preference

        if user_data.notifications_enabled is not None:
            user.notifications_enabled = user_data.notifications_enabled

        user.updated_at = datetime.utcnow()

        self.db.commit()
        self.db.refresh(user)

        return user

    def delete_user(self, user_id: str) -> Dict[str, Any]:
        """Удалить пользователя"""
        user = self.get_user(user_id)

        self.db.delete(user)
        self.db.commit()

        return {"message": "User deleted", "user_id": user_id}

    # ========== AUTHENTICATION ==========

    def authenticate_user(self, email_or_username: str, password: str) -> Optional[User]:
        """Аутентификация пользователя"""
        # Ищем по email или username
        user = self.db.query(User).filter(
            (User.email == email_or_username) | (User.username == email_or_username)
        ).first()

        if not user:
            return None

        if not verify_password(password, user.hashed_password):
            return None

        if not user.is_active:
            return None

        return user

    def create_user_tokens(self, user: User) -> Dict[str, Any]:
        """Создать токены для пользователя"""
        access_token = create_access_token(
            data={"sub": user.id, "email": user.email, "username": user.username}
        )

        refresh_token = create_refresh_token(
            data={"sub": user.id}
        )

        # Обновляем last_login
        user.last_login = datetime.utcnow()
        self.db.commit()

        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
        }

    def refresh_access_token(self, refresh_token: str) -> Dict[str, Any]:
        """Обновить access токен"""
        payload = decode_token(refresh_token)

        if not payload or payload.get("type") != "refresh":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid refresh token"
            )

        user_id = payload.get("sub")
        user = self.get_user(user_id)

        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User account is disabled"
            )

        access_token = create_access_token(
            data={"sub": user.id, "email": user.email, "username": user.username}
        )

        return {
            "access_token": access_token,
            "token_type": "bearer",
            "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
        }

    # ========== PASSWORD MANAGEMENT ==========

    def change_password(self, user_id: str, old_password: str, new_password: str) -> Dict[str, Any]:
        """Сменить пароль"""
        user = self.get_user(user_id)

        if not verify_password(old_password, user.hashed_password):
            raise HTTPException(
                status_code=400,
                detail="Incorrect old password"
            )

        user.hashed_password = hash_password(new_password)
        user.updated_at = datetime.utcnow()

        self.db.commit()

        return {"message": "Password changed successfully"}

    def request_password_reset(self, email: str) -> Dict[str, Any]:
        """Запрос на сброс пароля"""
        user = self.get_user_by_email(email)

        # Для безопасности не сообщаем, существует ли пользователь
        if user:
            token = generate_password_reset_token(user.id)
            # Здесь нужно отправить email
            # В разработке возвращаем токен
            return {
                "message": "If email exists, password reset link was sent",
                "debug_token": token  # Только для разработки!
            }

        return {"message": "If email exists, password reset link was sent"}

    def reset_password(self, token: str, new_password: str) -> Dict[str, Any]:
        """Сброс пароля по токену"""
        user_id = verify_password_reset_token(token)

        if not user_id:
            raise HTTPException(
                status_code=400,
                detail="Invalid or expired reset token"
            )

        user = self.get_user(user_id)
        user.hashed_password = hash_password(new_password)
        user.updated_at = datetime.utcnow()

        self.db.commit()

        return {"message": "Password reset successfully"}

    # ========== ADMIN OPERATIONS ==========

    def set_admin_status(self, user_id: str, is_admin: bool) -> User:
        """Установить статус администратора"""
        user = self.get_user(user_id)
        user.is_admin = is_admin
        user.updated_at = datetime.utcnow()

        self.db.commit()
        self.db.refresh(user)

        return user

    def set_user_active_status(self, user_id: str, is_active: bool) -> User:
        """Установить статус активности пользователя"""
        user = self.get_user(user_id)
        user.is_active = is_active
        user.updated_at = datetime.utcnow()

        self.db.commit()
        self.db.refresh(user)

        return user

    def verify_user_email(self, user_id: str) -> User:
        """Подтвердить email пользователя"""
        user = self.get_user(user_id)
        user.is_verified = True
        user.updated_at = datetime.utcnow()

        self.db.commit()
        self.db.refresh(user)

        return user

    # ========== STATISTICS ==========

    def get_statistics(self) -> Dict[str, Any]:
        """Получить статистику по пользователям"""
        total = self.db.query(func.count(User.id)).scalar()
        active = self.db.query(func.count(User.id)).filter(User.is_active == True).scalar()
        admin = self.db.query(func.count(User.id)).filter(User.is_admin == True).scalar()
        verified = self.db.query(func.count(User.id)).filter(User.is_verified == True).scalar()

        # Новые пользователи за последние 30 дней
        month_ago = datetime.utcnow() - timedelta(days=30)
        new_users = self.db.query(func.count(User.id)).filter(User.created_at >= month_ago).scalar()

        return {
            "total": total,
            "active": active,
            "admin": admin,
            "verified": verified,
            "new_users_last_30_days": new_users
        }