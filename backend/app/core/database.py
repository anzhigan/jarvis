from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import QueuePool
from typing import Generator
import logging

from app.core.config import settings

# Настройка логгера
logger = logging.getLogger(__name__)


def create_database_engine():
    """
    Создание движка базы данных
    """
    try:
        engine = create_engine(
            settings.DATABASE_URL,
            poolclass=QueuePool,
            pool_size=settings.DATABASE_POOL_SIZE,
            max_overflow=settings.DATABASE_MAX_OVERFLOW,
            pool_timeout=settings.DATABASE_POOL_TIMEOUT,
            pool_pre_ping=True,  # Проверка соединения перед использованием
            echo=settings.DATABASE_ECHO,  # Логирование SQL запросов (только для разработки)
            connect_args={
                "connect_timeout": 10,
                "keepalives": 1,
                "keepalives_idle": 30,
                "keepalives_interval": 10,
                "keepalives_count": 5
            }
        )
        logger.info("Database engine created successfully")
        return engine
    except Exception as e:
        logger.error(f"Failed to create database engine: {e}")
        raise


def create_session_factory(engine):
    """
    Создание фабрики сессий
    """
    return sessionmaker(
        autocommit=False,
        autoflush=False,
        bind=engine
    )


# Создаем движок и фабрику сессий
engine = create_database_engine()
SessionLocal = create_session_factory(engine)


def get_db() -> Generator[Session, None, None]:
    """
    Dependency для получения сессии базы данных
    """
    db = SessionLocal()
    try:
        yield db
    except Exception as e:
        logger.error(f"Database session error: {e}")
        db.rollback()
        raise
    finally:
        db.close()


def init_database():
    """
    Инициализация базы данных (создание таблиц)
    """
    from app.models.base import Base

    try:
        Base.metadata.create_all(bind=engine)
        logger.info("Database tables created successfully")
    except Exception as e:
        logger.error(f"Failed to create database tables: {e}")
        raise


def dispose_database():
    """
    Закрытие соединений с базой данных
    """
    try:
        engine.dispose()
        logger.info("Database engine disposed successfully")
    except Exception as e:
        logger.error(f"Failed to dispose database engine: {e}")
        raise


def check_database_connection() -> bool:
    """
    Проверка подключения к базе данных
    """
    try:
        with engine.connect() as conn:
            conn.execute("SELECT 1")
        logger.info("Database connection successful")
        return True
    except Exception as e:
        logger.error(f"Database connection failed: {e}")
        return False