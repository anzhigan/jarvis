from pydantic import BaseModel, Field, validator
from typing import Optional
from datetime import datetime


class TaskLogBase(BaseModel):
    """Базовые поля лога задачи"""
    notes: Optional[str] = Field(None, max_length=500)


class TaskLogCreate(TaskLogBase):
    """Создание лога задачи"""
    task_id: str
    started_at: Optional[datetime] = None


class TaskLogUpdate(BaseModel):
    """Обновление лога задачи"""
    finished_at: Optional[datetime] = None
    duration: Optional[int] = Field(None, ge=0)
    completed: Optional[bool] = None
    notes: Optional[str] = Field(None, max_length=500)


class TaskLogResponse(BaseModel):
    """Ответ с данными лога задачи"""
    id: str
    task_id: str
    started_at: datetime
    finished_at: Optional[datetime]
    duration: Optional[int]
    completed: bool
    notes: Optional[str]

    # Вычисляемые поля
    duration_formatted: str
    is_active: bool

    class Config:
        from_attributes = True


class TaskLogStartResponse(BaseModel):
    """Ответ при старте задачи"""
    id: str
    task_id: str
    started_at: datetime
    message: str = "Task started"

    class Config:
        from_attributes = True


class TaskLogFinishResponse(BaseModel):
    """Ответ при завершении задачи"""
    id: str
    task_id: str
    started_at: datetime
    finished_at: datetime
    duration: int
    duration_formatted: str
    completed: bool
    message: str = "Task finished"

    class Config:
        from_attributes = True


# ========== Log Stats ==========

class TaskLogStats(BaseModel):
    """Статистика по логам задачи"""
    total_logs: int
    total_time_spent: int  # seconds
    total_time_formatted: str
    average_session_duration: Optional[float]  # seconds
    last_activity: Optional[datetime]
    current_active_session: Optional[TaskLogResponse]

    class Config:
        from_attributes = True