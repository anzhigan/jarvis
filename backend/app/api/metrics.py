from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, extract, and_
from datetime import datetime, date, timedelta
from typing import List, Dict, Any, Optional

from app.dependencies.db import get_db
from app.models.task import Task, StatusEnum, PriorityEnum

router = APIRouter(prefix="/metrics", tags=["Metrics"])


@router.get("/")
def get_metrics(
        period: Optional[str] = Query(None, description="today, week, month, all"),
        db: Session = Depends(get_db)
):
    """
    Получить основные метрики по задачам
    """
    # Определяем диапазон дат
    today = date.today()
    start_date = None
    end_date = today

    if period == "today":
        start_date = today
    elif period == "week":
        start_date = today - timedelta(days=today.weekday())
    elif period == "month":
        start_date = today.replace(day=1)
    elif period == "all":
        start_date = None
        end_date = None

    # Базовый запрос с фильтрацией по датам
    query = db.query(Task)
    if start_date:
        query = query.filter(Task.created_at >= start_date)
    if end_date:
        query = query.filter(Task.created_at <= end_date)

    # Статистика
    total_tasks = query.count()
    completed_tasks = query.filter(Task.status == StatusEnum.DONE).count()
    active_tasks = total_tasks - completed_tasks

    completion_rate = round((completed_tasks / total_tasks * 100) if total_tasks > 0 else 0, 1)

    # Задачи по приоритетам
    high_priority = query.filter(Task.priority == PriorityEnum.HIGH).count()
    medium_priority = query.filter(Task.priority == PriorityEnum.MEDIUM).count()
    low_priority = query.filter(Task.priority == PriorityEnum.LOW).count()

    # Просроченные задачи
    overdue_tasks = db.query(Task).filter(
        and_(
            Task.end_date < today,
            Task.status != StatusEnum.DONE
        )
    ).count()

    # Среднее время выполнения (для завершенных задач)
    avg_completion_time = None
    completed_with_dates = db.query(Task).filter(
        Task.status == StatusEnum.DONE,
        Task.completed_at.isnot(None)
    ).all()

    if completed_with_dates:
        total_seconds = sum(
            (task.completed_at - datetime.combine(task.start_date, datetime.min.time())).total_seconds()
            for task in completed_with_dates
        )
        avg_days = round(total_seconds / len(completed_with_dates) / 86400, 1)  # в днях
        avg_completion_time = avg_days

    return {
        "period": period or "all",
        "total_tasks": total_tasks,
        "completed_tasks": completed_tasks,
        "active_tasks": active_tasks,
        "completion_rate": completion_rate,
        "by_priority": {
            "high": high_priority,
            "medium": medium_priority,
            "low": low_priority
        },
        "overdue_tasks": overdue_tasks,
        "avg_completion_time_days": avg_completion_time
    }


@router.get("/weekly")
def get_weekly_progress(
        weeks: int = Query(4, ge=1, le=12, description="Number of weeks to show"),
        db: Session = Depends(get_db)
):
    """
    Получить еженедельный прогресс выполнения задач
    """
    weekly_data = []
    today = date.today()

    for i in range(weeks):
        # Вычисляем начало недели (понедельник)
        week_start = today - timedelta(days=today.weekday() + (7 * i))
        week_end = week_start + timedelta(days=6)

        # Задачи, созданные на этой неделе
        week_tasks = db.query(Task).filter(
            and_(
                Task.created_at >= week_start,
                Task.created_at <= week_end
            )
        ).all()

        total = len(week_tasks)
        completed = len([t for t in week_tasks if t.status == StatusEnum.DONE])

        weekly_data.insert(0, {
            "week": f"Week {weeks - i}",
            "week_number": week_start.isocalendar()[1],
            "week_start": week_start.isoformat(),
            "week_end": week_end.isoformat(),
            "total": total,
            "completed": completed,
            "active": total - completed,
            "completion_rate": round((completed / total * 100) if total > 0 else 0, 1)
        })

    return weekly_data


@router.get("/distribution")
def get_distribution(
        db: Session = Depends(get_db)
):
    """
    Получить распределение задач по статусам и приоритетам
    """
    # Распределение по статусам
    todo = db.query(func.count(Task.id)).filter(Task.status == StatusEnum.TODO).scalar()
    in_progress = db.query(func.count(Task.id)).filter(Task.status == StatusEnum.IN_PROGRESS).scalar()
    done = db.query(func.count(Task.id)).filter(Task.status == StatusEnum.DONE).scalar()

    # Распределение по приоритетам для каждого статуса
    priority_by_status = {}
    for status in [StatusEnum.TODO, StatusEnum.IN_PROGRESS, StatusEnum.DONE]:
        priority_by_status[status.value] = {
            "high": db.query(func.count(Task.id)).filter(
                and_(Task.status == status, Task.priority == PriorityEnum.HIGH)
            ).scalar(),
            "medium": db.query(func.count(Task.id)).filter(
                and_(Task.status == status, Task.priority == PriorityEnum.MEDIUM)
            ).scalar(),
            "low": db.query(func.count(Task.id)).filter(
                and_(Task.status == status, Task.priority == PriorityEnum.LOW)
            ).scalar()
        }

    return {
        "by_status": {
            "todo": todo,
            "in_progress": in_progress,
            "done": done
        },
        "by_priority": {
            "high": db.query(func.count(Task.id)).filter(Task.priority == PriorityEnum.HIGH).scalar(),
            "medium": db.query(func.count(Task.id)).filter(Task.priority == PriorityEnum.MEDIUM).scalar(),
            "low": db.query(func.count(Task.id)).filter(Task.priority == PriorityEnum.LOW).scalar()
        },
        "priority_by_status": priority_by_status,
        "total": todo + in_progress + done
    }


@router.get("/completion-timeline")
def get_completion_timeline(
        days: int = Query(30, ge=7, le=90, description="Number of days to show"),
        db: Session = Depends(get_db)
):
    """
    Получить график выполнения задач по дням
    """
    timeline = []
    today = datetime.now().date()

    for i in range(days):
        date_target = today - timedelta(days=i)
        date_start = datetime.combine(date_target, datetime.min.time())
        date_end = datetime.combine(date_target, datetime.max.time())

        # Задачи, завершенные в этот день
        completed_on_date = db.query(func.count(Task.id)).filter(
            and_(
                Task.completed_at >= date_start,
                Task.completed_at <= date_end
            )
        ).scalar()

        # Задачи, созданные в этот день
        created_on_date = db.query(func.count(Task.id)).filter(
            and_(
                Task.created_at >= date_start,
                Task.created_at <= date_end
            )
        ).scalar()

        timeline.insert(0, {
            "date": date_target.isoformat(),
            "day": date_target.strftime("%a"),
            "completed": completed_on_date,
            "created": created_on_date
        })

    return timeline


@router.get("/priority-trends")
def get_priority_trends(
        weeks: int = Query(4, ge=1, le=12),
        db: Session = Depends(get_db)
):
    """
    Получить тренды по приоритетам задач
    """
    trends = []
    today = date.today()

    for i in range(weeks):
        week_start = today - timedelta(days=today.weekday() + (7 * i))
        week_end = week_start + timedelta(days=6)

        week_data = {
            "week": f"Week {weeks - i}",
            "week_start": week_start.isoformat(),
            "week_end": week_end.isoformat(),
            "high": db.query(func.count(Task.id)).filter(
                and_(
                    Task.created_at >= week_start,
                    Task.created_at <= week_end,
                    Task.priority == PriorityEnum.HIGH
                )
            ).scalar(),
            "medium": db.query(func.count(Task.id)).filter(
                and_(
                    Task.created_at >= week_start,
                    Task.created_at <= week_end,
                    Task.priority == PriorityEnum.MEDIUM
                )
            ).scalar(),
            "low": db.query(func.count(Task.id)).filter(
                and_(
                    Task.created_at >= week_start,
                    Task.created_at <= week_end,
                    Task.priority == PriorityEnum.LOW
                )
            ).scalar()
        }

        trends.insert(0, week_data)

    return trends


@router.get("/productivity-score")
def get_productivity_score(
        db: Session = Depends(get_db)
):
    """
    Рассчитать продуктивность на основе выполненных задач
    """
    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    month_start = today.replace(day=1)

    # Статистика за сегодня
    today_completed = db.query(func.count(Task.id)).filter(
        and_(
            func.date(Task.completed_at) == today,
            Task.status == StatusEnum.DONE
        )
    ).scalar() or 0

    # Статистика за неделю
    week_completed = db.query(func.count(Task.id)).filter(
        and_(
            Task.completed_at >= week_start,
            Task.status == StatusEnum.DONE
        )
    ).scalar() or 0

    # Статистика за месяц
    month_completed = db.query(func.count(Task.id)).filter(
        and_(
            Task.completed_at >= month_start,
            Task.status == StatusEnum.DONE
        )
    ).scalar() or 0

    # Всего активных задач
    active_tasks = db.query(func.count(Task.id)).filter(
        Task.status != StatusEnum.DONE
    ).scalar() or 0

    # Оценка продуктивности (0-100)
    # Базовая формула: чем больше выполнено и чем меньше активных, тем выше
    total_tasks = db.query(func.count(Task.id)).scalar() or 1
    completed_tasks = db.query(func.count(Task.id)).filter(Task.status == StatusEnum.DONE).scalar() or 0

    base_score = (completed_tasks / total_tasks) * 100

    # Бонус за недавнюю активность
    recent_bonus = min(20, (week_completed / max(1, active_tasks)) * 20)

    productivity_score = min(100, base_score + recent_bonus)

    return {
        "score": round(productivity_score, 1),
        "today_completed": today_completed,
        "week_completed": week_completed,
        "month_completed": month_completed,
        "active_tasks": active_tasks,
        "total_tasks": total_tasks,
        "completion_rate": round((completed_tasks / total_tasks) * 100, 1)
    }


@router.get("/export")
def export_metrics(
        format: str = Query("json", regex="^(json|csv)$"),
        db: Session = Depends(get_db)
):
    """
    Экспорт метрик в JSON или CSV формате
    """
    metrics = get_metrics(db=db)
    weekly = get_weekly_progress(db=db)
    distribution = get_distribution(db=db)
    timeline = get_completion_timeline(db=db)

    export_data = {
        "exported_at": datetime.utcnow().isoformat(),
        "summary": metrics,
        "weekly_progress": weekly,
        "distribution": distribution,
        "completion_timeline": timeline
    }

    if format == "csv":
        # Для CSV преобразуем в плоскую структуру
        import csv
        from fastapi.responses import StreamingResponse
        import io

        output = io.StringIO()
        writer = csv.writer(output)

        # Заголовки
        writer.writerow(["Metric", "Value"])

        # Основные метрики
        writer.writerow(["total_tasks", metrics["total_tasks"]])
        writer.writerow(["completed_tasks", metrics["completed_tasks"]])
        writer.writerow(["active_tasks", metrics["active_tasks"]])
        writer.writerow(["completion_rate", metrics["completion_rate"]])
        writer.writerow(["overdue_tasks", metrics["overdue_tasks"]])

        # Еженедельные данные
        for week in weekly:
            writer.writerow([f"weekly_{week['week']}_total", week["total"]])
            writer.writerow([f"weekly_{week['week']}_completed", week["completed"]])

        output.seek(0)

        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=metrics_export.csv"}
        )

    return export_data