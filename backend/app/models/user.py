import uuid
from sqlalchemy import Column, String, Boolean, DateTime, Text
from datetime import datetime
from sqlalchemy.orm import relationship

from app.models.base import Base


class User(Base):
    """
    Модель пользователя
    """
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))

    # Основная информация
    email = Column(String(255), unique=True, nullable=False, index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    full_name = Column(String(255), nullable=True)

    # Безопасность
    hashed_password = Column(String(255), nullable=False)

    # Статусы
    is_active = Column(Boolean, default=True)
    is_admin = Column(Boolean, default=False)
    is_verified = Column(Boolean, default=False)

    # Временные метки
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_login = Column(DateTime, nullable=True)

    # Дополнительная информация
    avatar_url = Column(String(500), nullable=True)
    bio = Column(Text, nullable=True)

    # Настройки
    theme_preference = Column(String(20), default="light")
    notifications_enabled = Column(Boolean, default=True)

    # Отношения (если нужны)
    # tasks = relationship("Task", back_populates="user", cascade="all, delete-orphan")
    # notes = relationship("NoteFile", back_populates="user")

    def __repr__(self):
        return f"<User {self.username} ({self.email})>"

    def to_dict(self) -> dict:
        """Преобразование в словарь"""
        return {
            "id": self.id,
            "email": self.email,
            "username": self.username,
            "full_name": self.full_name,
            "is_active": self.is_active,
            "is_admin": self.is_admin,
            "is_verified": self.is_verified,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "last_login": self.last_login.isoformat() if self.last_login else None,
            "avatar_url": self.avatar_url,
            "bio": self.bio,
            "theme_preference": self.theme_preference,
            "notifications_enabled": self.notifications_enabled,
        }