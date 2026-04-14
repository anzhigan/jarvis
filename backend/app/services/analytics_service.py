from sqlalchemy.orm import Session
from sqlalchemy import func, and_, extract
from typing import List, Dict, Any
from datetime import datetime, date, timedelta

from app.models.task import Task, StatusEnum, PriorityEnum
from app.models.task_log import TaskLog


class AnalyticsService:
    """
    Сервис для аналитики и метрик
    """

    def __init__(self, db: Session):
        self.db = db

    def get_overview_metrics(
            self,
            period: str = "all",
            start_date: Optional[date] = None,
            end_date: Optional[date] = None
    ) -> Dict[str, Any]:
        """Получить общие метрики"""

        # Определяем диапазон дат
        if period == "today":
            start_date = date.today()
            end_date = date.today()
        elif period == "week":
            today = date.today()
            start_date = today - timedelta(days=today.weekday())
            end_date = start_date + timedelta(days=6)
        elif period == "month":
            today = date.today()
            start_date = today.replace(day=1)
            end_date = today
        elif period == "year":
            today = date.today()
            start_date = today.replace(month=1, day=1)
            end_date = today

        # Базовый запрос
        query = self.db.query(Task)
        if start_date:
            query = query.filter(Task.created_at >= start_date)
        if end_date:
            query = query.filter(Task.created_at <= end_date)

        total = query.count()
        completed = query.filter(Task.status == StatusEnum.DONE).count()
        active = total - completed

        completion_rate = round((completed / total * 100) if total > 0 else 0, 1)

        # Задачи по приоритетам
        high = query.filter(Task.priority == PriorityEnum.HIGH).count()
        medium = query.filter(Task.priority == PriorityEnum.MEDIUM).count()
        low = query.filter(Task.priority == PriorityEnum.LOW).count()

        # Просроченные задачи
        today = date.today()
        overdue = self.db.query(Task).filter(
            and_(
                Task.end_date < today,
                Task.status != StatusEnum.DONE
            )
        ).count()

        # Общее время по логам
        total_time = self.db.query(func.sum(TaskLog.duration)).scalar() or 0
        total_time_hours = round(total_time / 3600, 1)

        return {
            "period": period,
            "start_date": start_date.isoformat() if start_date else None,
            "end_date": end_date.isoformat() if end_date else None,
            "total_tasks": total,
            "completed_tasks": completed,
            "active_tasks": active,
            "completion_rate": completion_rate,
            "by_priority": {
                "high": high,
                "medium": medium,
                "low": low
            },
            "overdue_tasks": overdue,
            "total_time_spent_seconds": total_time,
            "total_time_spent_hours": total_time_hours
        }

    def get_weekly_progress(self, weeks: int = 4) -> List[Dict[str, Any]]:
        """Получить еженедельный прогресс"""
        weekly_data = []
        today = date.today()

        for i in range(weeks):
            week_start = today - timedelta(days=today.weekday() + (7 * i))
            week_end = week_start + timedelta(days=6)

            week_tasks = self.db.query(Task).filter(
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

    def get_distribution(self) -> Dict[str, Any]:
        """Получить распределение задач"""
        # По статусам
        todo = self.db.query(func.count(Task.id)).filter(Task.status == StatusEnum.TODO).scalar()
        in_progress = self.db.query(func.count(Task.id)).filter(Task.status == StatusEnum.IN_PROGRESS).scalar()
        done = self.db.query(func.count(Task.id)).filter(Task.status == StatusEnum.DONE).scalar()

        # По приоритетам
        high = self.db.query(func.count(Task.id)).filter(Task.priority == PriorityEnum.HIGH).scalar()
        medium = self.db.query(func.count(Task.id)).filter(Task.priority == PriorityEnum.MEDIUM).scalar()
        low = self.db.query(func.count(Task.id)).filter(Task.priority == PriorityEnum.LOW).scalar()

        # Распределение приоритетов по статусам
        priority_by_status = {}
        for status in [StatusEnum.TODO, StatusEnum.IN_PROGRESS, StatusEnum.DONE]:
            priority_by_status[status.value] = {
                "high": self.db.query(func.count(Task.id)).filter(
                    and_(Task.status == status, Task.priority == PriorityEnum.HIGH)
                ).scalar(),
                "medium": self.db.query(func.count(Task.id)).filter(
                    and_(Task.status == status, Task.priority == PriorityEnum.MEDIUM)
                ).scalar(),
                "low": self.db.query(func.count(Task.id)).filter(
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
                "high": high,
                "medium": medium,
                "low": low
            },
            "priority_by_status": priority_by_status,
            "total": todo + in_progress + done
        }

    def get_completion_timeline(self, days: int = 30) -> List[Dict[str, Any]]:
        """Получить график выполнения задач по дням"""
        timeline = []
        today = datetime.now().date()

        for i in range(days):
            date_target = today - timedelta(days=i)
            date_start = datetime.combine(date_target, datetime.min.time())
            date_end = datetime.combine(date_target, datetime.max.time())

            completed = self.db.query(func.count(Task.id)).filter(
                and_(
                    Task.completed_at >= date_start,
                    Task.completed_at <= date_end
                )
            ).scalar()

            created = self.db.query(func.count(Task.id)).filter(
                and_(
                    Task.created_at >= date_start,
                    Task.created_at <= date_end
                )
            ).scalar()

            timeline.insert(0, {
                "date": date_target.isoformat(),
                "day": date_target.strftime("%a"),
                "completed": completed,
                "created": created
            })

        return timeline

    def get_priority_trends(self, weeks: int = 4) -> List[Dict[str, Any]]:
        """Получить тренды по приоритетам"""
        trends = []
        today = date.today()

        for i in range(weeks):
            week_start = today - timedelta(days=today.weekday() + (7 * i))
            week_end = week_start + timedelta(days=6)

            week_data = {
                "week": f"Week {weeks - i}",
                "week_start": week_start.isoformat(),
                "week_end": week_end.isoformat(),
                "high": self.db.query(func.count(Task.id)).filter(
                    and_(
                        Task.created_at >= week_start,
                        Task.created_at <= week_end,
                        Task.priority == PriorityEnum.HIGH
                    )
                ).scalar(),
                "medium": self.db.query(func.count(Task.id)).filter(
                    and_(
                        Task.created_at >= week_start,
                        Task.created_at <= week_end,
                        Task.priority == PriorityEnum.MEDIUM
                    )
                ).scalar(),
                "low": self.db.query(func.count(Task.id)).filter(
                    and_(
                        Task.created_at >= week_start,
                        Task.created_at <= week_end,
                        Task.priority == PriorityEnum.LOW
                    )
                ).scalar()
            }

            trends.insert(0, week_data)

        return trends

    def get_productivity_score(self) -> Dict[str, Any]:
        """Рассчитать продуктивность"""
        today = date.today()
        week_start = today - timedelta(days=today.weekday())
        month_start = today.replace(day=1)

        # Статистика за сегодня
        today_completed = self.db.query(func.count(Task.id)).filter(
            and_(
                func.date(Task.completed_at) == today,
                Task.status == StatusEnum.DONE
            )
        ).scalar() or 0

        # Статистика за неделю
        week_completed = self.db.query(func.count(Task.id)).filter(
            and_(
                Task.completed_at >= week_start,
                Task.status == StatusEnum.DONE
            )
        ).scalar() or 0

        # Статистика за месяц
        month_completed = self.db.query(func.count(Task.id)).filter(
            and_(
                Task.completed_at >= month_start,
                Task.status == StatusEnum.DONE
            )
        ).scalar() or 0

        # Всего активных задач
        active_tasks = self.db.query(func.count(Task.id)).filter(
            Task.status != StatusEnum.DONE
        ).scalar() or 0

        total_tasks = self.db.query(func.count(Task.id)).scalar() or 1
        completed_tasks = self.db.query(func.count(Task.id)).filter(Task.status == StatusEnum.DONE).scalar() or 0

        # Базовая оценка
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

    def get_task_logs_stats(self, task_id: Optional[str] = None) -> Dict[str, Any]:
        """Получить статистику по логам задач"""
        query = self.db.query(TaskLog)
        if task_id:
            query = query.filter(TaskLog.task_id == task_id)

        total_logs = query.count()
        total_time = query.filter(TaskLog.completed == True).with_entities(func.sum(TaskLog.duration)).scalar() or 0

        # Средняя длительность сессии
        completed_logs = query.filter(TaskLog.completed == True, TaskLog.duration.isnot(None)).all()
        avg_duration = sum(log.duration for log in completed_logs) / len(completed_logs) if completed_logs else 0

        # Последняя активность
        last_log = query.order_by(TaskLog.started_at.desc()).first()

        # Текущая активная сессия
        active_session = query.filter(TaskLog.finished_at.is_(None)).first()

        return {
            "total_logs": total_logs,
            "total_time_spent_seconds": total_time,
            "total_time_spent_hours": round(total_time / 3600, 1),
            "total_time_formatted": self._format_duration(total_time),
            "average_session_duration_seconds": round(avg_duration, 1) if avg_duration else 0,
            "average_session_formatted": self._format_duration(int(avg_duration)) if avg_duration else "00:00",
            "last_activity": last_log.started_at.isoformat() if last_log else None,
            "has_active_session": active_session is not None
        }

    def _format_duration(self, seconds: int) -> str:
        """Форматирование длительности"""
        if not seconds:
            return "00:00"
        hours = seconds // 3600
        minutes = (seconds % 3600) // 60
        secs = seconds % 60
        if hours > 0:
            return f"{hours}h {minutes}m"
        return f"{minutes:02d}:{secs:02d}"