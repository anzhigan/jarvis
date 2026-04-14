from typing import Generator
from sqlalchemy.orm import Session

from app.core.database import SessionLocal


def get_db() -> Generator[Session, None, None]:
    """
    Dependency для получения сессии базы данных.

    Использование:
        @router.get("/items")
        def get_items(db: Session = Depends(get_db)):
            return db.query(Item).all()

    Сессия автоматически закрывается после завершения запроса.
    """
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def get_read_only_db() -> Generator[Session, None, None]:
    """
    Dependency для получения read-only сессии базы данных.

    Полезно для запросов, которые только читают данные.
    Любые попытки записи будут игнорироваться.
    """
    db = SessionLocal()
    try:
        # Отключаем autoflush для read-only операций
        db.autoflush = False
        yield db
    finally:
        db.close()