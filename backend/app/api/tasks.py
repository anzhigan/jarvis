from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_
from typing import List, Optional
from datetime import datetime, date

from app.dependencies.db import get_db
from app.models.task import Task, PriorityEnum, StatusEnum
from app.schemas.task import (
    TaskCreate, TaskUpdate, TaskResponse,
    TaskListResponse, TaskStatsResponse
)

router = APIRouter(prefix="/tasks", tags=["Tasks"])


# ========== CRUD OPERATIONS ==========

@router.post("/", response_model=TaskResponse, status_code=201)
def create_task(
        task: TaskCreate,
        db: Session = Depends(get_db)
):
    """
    Создать новую задачу
    """
    # Валидация дат
    if task.start_date > task.end_date:
        raise HTTPException(
            status_code=400,
            detail="Start date cannot be later than end date"
        )

    new_task = Task(
        title=task.title,
        start_date=task.start_date,
        end_date=task.end_date,
        priority=task.priority,
        status=task.status or StatusEnum.TODO
    )
    db.add(new_task)
    db.commit()
    db.refresh(new_task)
    return new_task


@router.get("/", response_model=TaskListResponse)
def get_tasks(
        status: Optional[str] = Query(None, description="Filter by status: todo, in_progress, done"),
        priority: Optional[str] = Query(None, description="Filter by priority: high, medium, low"),
        search: Optional[str] = Query(None, description="Search in title"),
        start_date_from: Optional[date] = Query(None, description="Filter by start date from"),
        start_date_to: Optional[date] = Query(None, description="Filter by start date to"),
        end_date_from: Optional[date] = Query(None, description="Filter by end date from"),
        end_date_to: Optional[date] = Query(None, description="Filter by end date to"),
        skip: int = Query(0, ge=0),
        limit: int = Query(100, ge=1, le=100),
        db: Session = Depends(get_db)
):
    """
    Получить список задач с фильтрацией и пагинацией
    """
    query = db.query(Task)

    # Фильтрация по статусу
    if status:
        try:
            status_enum = StatusEnum(status)
            query = query.filter(Task.status == status_enum)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid status: {status}")

    # Фильтрация по приоритету
    if priority:
        try:
            priority_enum = PriorityEnum(priority)
            query = query.filter(Task.priority == priority_enum)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid priority: {priority}")

    # Поиск по заголовку
    if search:
        query = query.filter(Task.title.ilike(f"%{search}%"))

    # Фильтрация по дате начала
    if start_date_from:
        query = query.filter(Task.start_date >= start_date_from)
    if start_date_to:
        query = query.filter(Task.start_date <= start_date_to)

    # Фильтрация по дате окончания
    if end_date_from:
        query = query.filter(Task.end_date >= end_date_from)
    if end_date_to:
        query = query.filter(Task.end_date <= end_date_to)

    # Подсчет общего количества
    total = query.count()

    # Пагинация и сортировка
    tasks = query.order_by(Task.created_at.desc()).offset(skip).limit(limit).all()

    return TaskListResponse(
        total=total,
        skip=skip,
        limit=limit,
        tasks=tasks
    )


@router.get("/{task_id}", response_model=TaskResponse)
def get_task(
        task_id: str,
        db: Session = Depends(get_db)
):
    """
    Получить задачу по ID
    """
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.put("/{task_id}", response_model=TaskResponse)
def update_task(
        task_id: str,
        task_update: TaskUpdate,
        db: Session = Depends(get_db)
):
    """
    Полностью обновить задачу
    """
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # Обновляем поля
    update_data = task_update.dict(exclude_unset=True)

    # Валидация дат
    if "start_date" in update_data and "end_date" in update_data:
        if update_data["start_date"] > update_data["end_date"]:
            raise HTTPException(
                status_code=400,
                detail="Start date cannot be later than end date"
            )
    elif "start_date" in update_data:
        if update_data["start_date"] > task.end_date:
            raise HTTPException(
                status_code=400,
                detail="Start date cannot be later than end date"
            )
    elif "end_date" in update_data:
        if task.start_date > update_data["end_date"]:
            raise HTTPException(
                status_code=400,
                detail="Start date cannot be later than end date"
            )

    for field, value in update_data.items():
        setattr(task, field, value)

    # Если статус стал "done", устанавливаем completed_at
    if task.status == StatusEnum.DONE and not task.completed_at:
        task.completed_at = datetime.utcnow()
    elif task.status != StatusEnum.DONE:
        task.completed_at = None

    db.commit()
    db.refresh(task)
    return task


@router.patch("/{task_id}/status")
def update_task_status(
        task_id: str,
        status: str,
        db: Session = Depends(get_db)
):
    """
    Быстрое обновление статуса задачи
    """
    try:
        status_enum = StatusEnum(status)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid status: {status}")

    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    task.status = status_enum

    if status_enum == StatusEnum.DONE and not task.completed_at:
        task.completed_at = datetime.utcnow()
    elif status_enum != StatusEnum.DONE:
        task.completed_at = None

    db.commit()

    return {
        "message": f"Task status updated to {status}",
        "task_id": task_id,
        "status": status,
        "completed_at": task.completed_at
    }


@router.delete("/{task_id}")
def delete_task(
        task_id: str,
        db: Session = Depends(get_db)
):
    """
    Удалить задачу
    """
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    db.delete(task)
    db.commit()
    return {"message": "Task deleted successfully", "task_id": task_id}


# ========== BULK OPERATIONS ==========

@router.post("/bulk", response_model=List[TaskResponse])
def create_tasks_bulk(
        tasks: List[TaskCreate],
        db: Session = Depends(get_db)
):
    """
    Создать несколько задач одновременно
    """
    created_tasks = []
    for task_data in tasks:
        # Валидация дат для каждой задачи
        if task_data.start_date > task_data.end_date:
            raise HTTPException(
                status_code=400,
                detail=f"Task '{task_data.title}': start date cannot be later than end date"
            )

        new_task = Task(
            title=task_data.title,
            start_date=task_data.start_date,
            end_date=task_data.end_date,
            priority=task_data.priority,
            status=task_data.status or StatusEnum.TODO
        )
        db.add(new_task)
        created_tasks.append(new_task)

    db.commit()

    # Обновляем каждый объект
    for task in created_tasks:
        db.refresh(task)

    return created_tasks


@router.delete("/bulk")
def delete_tasks_bulk(
        task_ids: List[str],
        db: Session = Depends(get_db)
):
    """
    Удалить несколько задач одновременно
    """
    deleted_count = db.query(Task).filter(Task.id.in_(task_ids)).delete(synchronize_session=False)
    db.commit()

    return {
        "message": f"Deleted {deleted_count} tasks",
        "deleted_count": deleted_count,
        "task_ids": task_ids
    }


# ========== ANALYTICS & STATS ==========

@router.get("/stats/overview", response_model=TaskStatsResponse)
def get_task_stats(
        db: Session = Depends(get_db)
):
    """
    Получить общую статистику по задачам
    """
    total = db.query(func.count(Task.id)).scalar()
    todo = db.query(func.count(Task.id)).filter(Task.status == StatusEnum.TODO).scalar()
    in_progress = db.query(func.count(Task.id)).filter(Task.status == StatusEnum.IN_PROGRESS).scalar()
    done = db.query(func.count(Task.id)).filter(Task.status == StatusEnum.DONE).scalar()

    # Задачи по приоритетам
    high_priority = db.query(func.count(Task.id)).filter(Task.priority == PriorityEnum.HIGH).scalar()
    medium_priority = db.query(func.count(Task.id)).filter(Task.priority == PriorityEnum.MEDIUM).scalar()
    low_priority = db.query(func.count(Task.id)).filter(Task.priority == PriorityEnum.LOW).scalar()

    # Просроченные задачи
    today = date.today()
    overdue = db.query(func.count(Task.id)).filter(
        and_(
            Task.end_date < today,
            Task.status != StatusEnum.DONE
        )
    ).scalar()

    # Выполняемость
    completion_rate = round((done / total * 100) if total > 0 else 0, 1)

    return TaskStatsResponse(
        total=total,
        todo=todo,
        in_progress=in_progress,
        done=done,
        high_priority=high_priority,
        medium_priority=medium_priority,
        low_priority=low_priority,
        overdue=overdue,
        completion_rate=completion_rate
    )


@router.get("/stats/overdue")
def get_overdue_tasks(
        db: Session = Depends(get_db)
):
    """
    Получить список просроченных задач
    """
    today = date.today()
    overdue_tasks = db.query(Task).filter(
        and_(
            Task.end_date < today,
            Task.status != StatusEnum.DONE
        )
    ).order_by(Task.end_date).all()

    return {
        "count": len(overdue_tasks),
        "tasks": overdue_tasks
    }


@router.get("/stats/upcoming")
def get_upcoming_tasks(
        days: int = Query(7, ge=1, le=30),
        db: Session = Depends(get_db)
):
    """
    Получить задачи на ближайшие N дней
    """
    today = date.today()
    upcoming_date = today + timedelta(days=days)

    upcoming_tasks = db.query(Task).filter(
        and_(
            Task.start_date >= today,
            Task.start_date <= upcoming_date,
            Task.status != StatusEnum.DONE
        )
    ).order_by(Task.start_date).all()

    return {
        "days": days,
        "count": len(upcoming_tasks),
        "tasks": upcoming_tasks
    }


# ========== HELPER FUNCTIONS ==========

from datetime import timedelta


def get_date_range(period: str):
    """Helper для получения диапазона дат"""
    today = date.today()

    if period == "today":
        return today, today
    elif period == "week":
        start = today - timedelta(days=today.weekday())
        return start, start + timedelta(days=6)
    elif period == "month":
        start = today.replace(day=1)
        return start, today
    elif period == "all":
        return None, None
    else:
        return None, None