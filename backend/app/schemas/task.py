from pydantic import BaseModel, Field, validator
from typing import Optional, List
from datetime import date, datetime
from enum import Enum


class PriorityEnum(str, Enum):
    """Приоритет задачи"""
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class StatusEnum(str, Enum):
    """Статус задачи"""
    TODO = "todo"
    IN_PROGRESS = "in_progress"
    DONE = "done"


class TaskBase(BaseModel):
    """Базовые поля задачи"""
    title: str = Field(..., min_length=1, max_length=500)
    start_date: date
    end_date: date
    priority: PriorityEnum = PriorityEnum.MEDIUM
    status: StatusEnum = StatusEnum.TODO


class TaskCreate(BaseModel):
    """Создание задачи"""
    title: str = Field(..., min_length=1, max_length=500)
    start_date: date
    end_date: date
    priority: PriorityEnum = PriorityEnum.MEDIUM

    @validator('end_date')
    def validate_dates(cls, end_date, values):
        if 'start_date' in values and end_date < values['start_date']:
            raise ValueError('end_date must be greater than or equal to start_date')
        return end_date


class TaskUpdate(BaseModel):
    """Обновление задачи"""
    title: Optional[str] = Field(None, min_length=1, max_length=500)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    priority: Optional[PriorityEnum] = None
    status: Optional[StatusEnum] = None

    @validator('end_date')
    def validate_dates(cls, end_date, values):
        start_date = values.get('start_date')
        if start_date and end_date and end_date < start_date:
            raise ValueError('end_date must be greater than or equal to start_date')
        return end_date


class TaskResponse(BaseModel):
    """Ответ с данными задачи"""
    id: str
    title: str
    start_date: date
    end_date: date
    priority: PriorityEnum
    status: StatusEnum
    created_at: datetime
    completed_at: Optional[datetime]

    # Вычисляемые поля
    is_overdue: bool
    days_remaining: int
    progress_percentage: float

    class Config:
        from_attributes = True


class TaskListResponse(BaseModel):
    """Ответ со списком задач (пагинация)"""
    total: int
    skip: int
    limit: int
    tasks: List[TaskResponse]


class TaskStatsResponse(BaseModel):
    """Статистика по задачам"""
    total: int
    todo: int
    in_progress: int
    done: int
    high_priority: int
    medium_priority: int
    low_priority: int
    overdue: int
    completion_rate: float


class TaskBulkCreate(BaseModel):
    """Массовое создание задач"""
    tasks: List[TaskCreate]

    @validator('tasks')
    def validate_tasks(cls, v):
        if len(v) > 100:
            raise ValueError('Maximum 100 tasks per bulk create')
        return v


class TaskBulkDelete(BaseModel):
    """Массовое удаление задач"""
    task_ids: List[str] = Field(..., min_items=1, max_items=100)

    @validator('task_ids')
    def validate_task_ids(cls, v):
        if len(v) > 100:
            raise ValueError('Maximum 100 tasks per bulk delete')
        return v


# ========== Filter Schemas ==========

class TaskFilter(BaseModel):
    """Фильтры для задач"""
    status: Optional[StatusEnum] = None
    priority: Optional[PriorityEnum] = None
    search: Optional[str] = Field(None, max_length=100)
    start_date_from: Optional[date] = None
    start_date_to: Optional[date] = None
    end_date_from: Optional[date] = None
    end_date_to: Optional[date] = None
    is_overdue: Optional[bool] = None


# ========== Analytics Schemas ==========

class WeeklyProgress(BaseModel):
    """Еженедельный прогресс"""
    week: str
    week_number: int
    week_start: date
    week_end: date
    total: int
    completed: int
    active: int
    completion_rate: float


class PriorityTrend(BaseModel):
    """Тренд по приоритетам"""
    week: str
    week_start: date
    week_end: date
    high: int
    medium: int
    low: int


class ProductivityScore(BaseModel):
    """Оценка продуктивности"""
    score: float
    today_completed: int
    week_completed: int
    month_completed: int
    active_tasks: int
    total_tasks: int
    completion_rate: float