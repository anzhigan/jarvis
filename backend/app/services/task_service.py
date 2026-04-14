from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_
from typing import List, Optional, Dict, Any
from datetime import datetime, date, timedelta
from fastapi import HTTPException, status

from app.models.task import Task, StatusEnum, PriorityEnum
from app.models.task_log import TaskLog
from app.schemas.task import TaskCreate, TaskUpdate, TaskFilter


class TaskService:
    """
    Сервис для работы с задачами
    """

    def __init__(self, db: Session):
        self.db = db

    # ========== CRUD OPERATIONS ==========

    def get_tasks(
            self,
            filters: Optional[TaskFilter] = None,
            skip: int = 0,
            limit: int = 100
    ) -> tuple[List[Task], int]:
        """Получить список задач с фильтрацией"""
        query = self.db.query(Task)

        if filters:
            if filters.status:
                query = query.filter(Task.status == filters.status)

            if filters.priority:
                query = query.filter(Task.priority == filters.priority)

            if filters.search:
                query = query.filter(Task.title.ilike(f"%{filters.search}%"))

            if filters.start_date_from:
                query = query.filter(Task.start_date >= filters.start_date_from)

            if filters.start_date_to:
                query = query.filter(Task.start_date <= filters.start_date_to)

            if filters.end_date_from:
                query = query.filter(Task.end_date >= filters.end_date_from)

            if filters.end_date_to:
                query = query.filter(Task.end_date <= filters.end_date_to)

            if filters.is_overdue is not None:
                today = date.today()
                if filters.is_overdue:
                    query = query.filter(
                        and_(
                            Task.end_date < today,
                            Task.status != StatusEnum.DONE
                        )
                    )
                else:
                    query = query.filter(
                        or_(
                            Task.end_date >= today,
                            Task.status == StatusEnum.DONE
                        )
                    )

        total = query.count()
        tasks = query.order_by(Task.created_at.desc()).offset(skip).limit(limit).all()

        return tasks, total

    def get_task(self, task_id: str) -> Task:
        """Получить задачу по ID"""
        task = self.db.query(Task).filter(Task.id == task_id).first()
        if not task:
            raise HTTPException(status_code=404, detail=f"Task {task_id} not found")
        return task

    def create_task(self, task_data: TaskCreate) -> Task:
        """Создать задачу"""
        # Валидация дат
        if task_data.start_date > task_data.end_date:
            raise HTTPException(
                status_code=400,
                detail="Start date cannot be later than end date"
            )

        task = Task(
            title=task_data.title,
            start_date=task_data.start_date,
            end_date=task_data.end_date,
            priority=task_data.priority
        )
        self.db.add(task)
        self.db.commit()
        self.db.refresh(task)
        return task

    def update_task(self, task_id: str, task_data: TaskUpdate) -> Task:
        """Обновить задачу"""
        task = self.get_task(task_id)

        if task_data.title is not None:
            task.title = task_data.title

        if task_data.start_date is not None:
            task.start_date = task_data.start_date

        if task_data.end_date is not None:
            task.end_date = task_data.end_date

        if task_data.priority is not None:
            task.priority = task_data.priority

        if task_data.status is not None:
            old_status = task.status
            task.status = task_data.status

            # Если статус стал "done", устанавливаем completed_at
            if task.status == StatusEnum.DONE and not task.completed_at:
                task.completed_at = datetime.utcnow()
            elif task.status != StatusEnum.DONE:
                task.completed_at = None

        # Валидация дат
        if task.start_date > task.end_date:
            raise HTTPException(
                status_code=400,
                detail="Start date cannot be later than end date"
            )

        self.db.commit()
        self.db.refresh(task)
        return task

    def delete_task(self, task_id: str) -> Dict[str, Any]:
        """Удалить задачу"""
        task = self.get_task(task_id)

        # Удаляем связанные логи
        self.db.query(TaskLog).filter(TaskLog.task_id == task_id).delete()

        self.db.delete(task)
        self.db.commit()
        return {"message": "Task deleted", "task_id": task_id}

    def update_task_status(self, task_id: str, status: StatusEnum) -> Task:
        """Быстрое обновление статуса задачи"""
        task = self.get_task(task_id)

        task.status = status

        if status == StatusEnum.DONE and not task.completed_at:
            task.completed_at = datetime.utcnow()
        elif status != StatusEnum.DONE:
            task.completed_at = None

        self.db.commit()
        self.db.refresh(task)
        return task

    # ========== BULK OPERATIONS ==========

    def create_tasks_bulk(self, tasks_data: List[TaskCreate]) -> List[Task]:
        """Массовое создание задач"""
        created_tasks = []

        for task_data in tasks_data:
            # Валидация дат
            if task_data.start_date > task_data.end_date:
                raise HTTPException(
                    status_code=400,
                    detail=f"Task '{task_data.title}': start date cannot be later than end date"
                )

            task = Task(
                title=task_data.title,
                start_date=task_data.start_date,
                end_date=task_data.end_date,
                priority=task_data.priority
            )
            self.db.add(task)
            created_tasks.append(task)

        self.db.commit()

        for task in created_tasks:
            self.db.refresh(task)

        return created_tasks

    def delete_tasks_bulk(self, task_ids: List[str]) -> Dict[str, Any]:
        """Массовое удаление задач"""
        # Удаляем связанные логи
        self.db.query(TaskLog).filter(TaskLog.task_id.in_(task_ids)).delete(synchronize_session=False)

        deleted_count = self.db.query(Task).filter(Task.id.in_(task_ids)).delete(synchronize_session=False)
        self.db.commit()

        return {
            "message": f"Deleted {deleted_count} tasks",
            "deleted_count": deleted_count,
            "task_ids": task_ids
        }

    # ========== STATISTICS ==========

    def get_statistics(self) -> Dict[str, Any]:
        """Получить статистику по задачам"""
        total = self.db.query(func.count(Task.id)).scalar()
        todo = self.db.query(func.count(Task.id)).filter(Task.status == StatusEnum.TODO).scalar()
        in_progress = self.db.query(func.count(Task.id)).filter(Task.status == StatusEnum.IN_PROGRESS).scalar()
        done = self.db.query(func.count(Task.id)).filter(Task.status == StatusEnum.DONE).scalar()

        # Задачи по приоритетам
        high = self.db.query(func.count(Task.id)).filter(Task.priority == PriorityEnum.HIGH).scalar()
        medium = self.db.query(func.count(Task.id)).filter(Task.priority == PriorityEnum.MEDIUM).scalar()
        low = self.db.query(func.count(Task.id)).filter(Task.priority == PriorityEnum.LOW).scalar()

        # Просроченные задачи
        today = date.today()
        overdue = self.db.query(func.count(Task.id)).filter(
            and_(
                Task.end_date < today,
                Task.status != StatusEnum.DONE
            )
        ).scalar()

        # Выполняемость
        completion_rate = round((done / total * 100) if total > 0 else 0, 1)

        # Среднее время выполнения (в днях)
        completed_tasks = self.db.query(Task).filter(Task.status == StatusEnum.DONE).all()
        avg_completion_days = 0
        if completed_tasks:
            total_days = sum(
                (task.completed_at.date() - task.start_date).days
                for task in completed_tasks
                if task.completed_at
            )
            avg_completion_days = round(total_days / len(completed_tasks), 1)

        return {
            "total": total,
            "todo": todo,
            "in_progress": in_progress,
            "done": done,
            "high_priority": high,
            "medium_priority": medium,
            "low_priority": low,
            "overdue": overdue,
            "completion_rate": completion_rate,
            "avg_completion_days": avg_completion_days
        }

    def get_upcoming_tasks(self, days: int = 7) -> List[Task]:
        """Получить задачи на ближайшие N дней"""
        today = date.today()
        end_date = today + timedelta(days=days)

        return self.db.query(Task).filter(
            and_(
                Task.start_date >= today,
                Task.start_date <= end_date,
                Task.status != StatusEnum.DONE
            )
        ).order_by(Task.start_date).all()

    def get_overdue_tasks(self) -> List[Task]:
        """Получить просроченные задачи"""
        today = date.today()

        return self.db.query(Task).filter(
            and_(
                Task.end_date < today,
                Task.status != StatusEnum.DONE
            )
        ).order_by(Task.end_date).all()