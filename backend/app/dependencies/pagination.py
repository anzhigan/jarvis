from fastapi import Query
from typing import Optional, Tuple
from pydantic import BaseModel
from sqlalchemy.orm import Query as SQLAlchemyQuery
from sqlalchemy import func


class PaginationParams(BaseModel):
    """
    Параметры пагинации
    """
    skip: int = Query(0, ge=0, description="Number of items to skip")
    limit: int = Query(100, ge=1, le=1000, description="Maximum number of items to return")
    page: Optional[int] = Query(None, ge=1, description="Page number (alternative to skip/limit)")
    page_size: Optional[int] = Query(None, ge=1, le=100, description="Items per page")

    def get_skip_limit(self) -> Tuple[int, int]:
        """
        Получить значения skip и limit.
        Если указан page/page_size, используем их.
        """
        if self.page is not None and self.page_size is not None:
            skip = (self.page - 1) * self.page_size
            limit = self.page_size
            return skip, limit

        return self.skip, self.limit

    def get_page_info(self, total: int) -> dict:
        """
        Получить информацию о пагинации.
        """
        skip, limit = self.get_skip_limit()

        if self.page is not None and self.page_size is not None:
            current_page = self.page
            page_size = self.page_size
            total_pages = (total + page_size - 1) // page_size
            has_next = current_page < total_pages
            has_prev = current_page > 1
        else:
            current_page = (skip // limit) + 1 if limit > 0 else 1
            page_size = limit
            total_pages = (total + page_size - 1) // page_size if page_size > 0 else 0
            has_next = (skip + limit) < total
            has_prev = skip > 0

        return {
            "current_page": current_page,
            "page_size": page_size,
            "total_pages": total_pages,
            "total_items": total,
            "has_next": has_next,
            "has_prev": has_prev,
            "skip": skip,
            "limit": limit
        }


def get_pagination(
        skip: int = Query(0, ge=0, description="Number of items to skip"),
        limit: int = Query(100, ge=1, le=1000, description="Maximum number of items to return"),
        page: Optional[int] = Query(None, ge=1, description="Page number"),
        page_size: Optional[int] = Query(None, ge=1, le=100, description="Items per page"),
) -> PaginationParams:
    """
    Dependency для получения параметров пагинации.

    Использование:
        @router.get("/items")
        def get_items(pagination: PaginationParams = Depends(get_pagination)):
            skip, limit = pagination.get_skip_limit()
            items = db.query(Item).offset(skip).limit(limit).all()
            return items
    """
    return PaginationParams(skip=skip, limit=limit, page=page, page_size=page_size)


class PaginatedResponse(BaseModel):
    """
    Базовый класс для пагинированных ответов
    """
    items: list
    pagination: dict


def paginate_query(
        query: SQLAlchemyQuery,
        pagination: PaginationParams,
        db=None
) -> Tuple[list, dict]:
    """
    Применить пагинацию к SQLAlchemy запросу.

    Args:
        query: SQLAlchemy запрос
        pagination: Параметры пагинации
        db: Сессия БД (опционально, для подсчета total)

    Returns:
        Tuple of (items, pagination_info)
    """
    skip, limit = pagination.get_skip_limit()

    # Получаем общее количество
    if db:
        total = query.with_entities(func.count()).scalar()
    else:
        total = query.count()

    # Применяем пагинацию
    items = query.offset(skip).limit(limit).all()

    # Получаем информацию о пагинации
    pagination_info = pagination.get_page_info(total)

    return items, pagination_info


class SortDirection:
    """Направления сортировки"""
    ASC = "asc"
    DESC = "desc"


def apply_sorting(
        query: SQLAlchemyQuery,
        sort_by: Optional[str] = None,
        sort_direction: str = SortDirection.ASC,
        allowed_fields: Optional[list] = None
) -> SQLAlchemyQuery:
    """
    Применить сортировку к SQLAlchemy запросу.

    Args:
        query: SQLAlchemy запрос
        sort_by: Поле для сортировки
        sort_direction: Направление сортировки (asc/desc)
        allowed_fields: Список разрешенных полей для сортировки

    Returns:
        SQLAlchemy запрос с сортировкой
    """
    if not sort_by:
        return query

    # Проверяем, разрешено ли поле для сортировки
    if allowed_fields and sort_by not in allowed_fields:
        return query

    # Получаем атрибут модели
    if hasattr(query.column_descriptions[0]['type'], sort_by):
        column = getattr(query.column_descriptions[0]['type'], sort_by)

        if sort_direction == SortDirection.DESC:
            query = query.order_by(column.desc())
        else:
            query = query.order_by(column.asc())

    return query