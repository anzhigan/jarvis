from pydantic import BaseModel, EmailStr, Field, validator
from typing import Optional
from datetime import datetime
import re


class UserBase(BaseModel):
    """Базовые поля пользователя"""
    email: EmailStr
    username: str = Field(..., min_length=3, max_length=100)
    full_name: Optional[str] = Field(None, max_length=255)

    @validator('username')
    def validate_username(cls, v):
        if not re.match(r'^[a-zA-Z0-9_]+$', v):
            raise ValueError('Username must contain only letters, numbers and underscore')
        return v.lower()


class UserCreate(UserBase):
    """Создание пользователя"""
    password: str = Field(..., min_length=6, max_length=100)

    @validator('password')
    def validate_password(cls, v):
        if len(v) < 6:
            raise ValueError('Password must be at least 6 characters')
        return v


class UserUpdate(BaseModel):
    """Обновление пользователя"""
    full_name: Optional[str] = Field(None, max_length=255)
    username: Optional[str] = Field(None, min_length=3, max_length=100)
    avatar_url: Optional[str] = Field(None, max_length=500)
    bio: Optional[str] = Field(None, max_length=1000)
    theme_preference: Optional[str] = Field(None, pattern="^(light|dark|system)$")
    notifications_enabled: Optional[bool] = None

    @validator('username')
    def validate_username(cls, v):
        if v and not re.match(r'^[a-zA-Z0-9_]+$', v):
            raise ValueError('Username must contain only letters, numbers and underscore')
        return v.lower() if v else v


class UserResponse(UserBase):
    """Ответ с данными пользователя"""
    id: str
    is_active: bool
    is_admin: bool
    is_verified: bool
    avatar_url: Optional[str]
    bio: Optional[str]
    theme_preference: str
    notifications_enabled: bool
    created_at: datetime
    last_login: Optional[datetime]

    class Config:
        from_attributes = True


class UserLogin(BaseModel):
    """Логин пользователя"""
    email_or_username: str = Field(..., description="Email or username")
    password: str = Field(..., min_length=1)


class TokenResponse(BaseModel):
    """Ответ с токенами"""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class PasswordChange(BaseModel):
    """Смена пароля"""
    old_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=6, max_length=100)

    @validator('new_password')
    def validate_new_password(cls, v):
        if len(v) < 6:
            raise ValueError('Password must be at least 6 characters')
        return v


class PasswordResetRequest(BaseModel):
    """Запрос на сброс пароля"""
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    """Подтверждение сброса пароля"""
    token: str
    new_password: str = Field(..., min_length=6, max_length=100)

    @validator('new_password')
    def validate_new_password(cls, v):
        if len(v) < 6:
            raise ValueError('Password must be at least 6 characters')
        return v