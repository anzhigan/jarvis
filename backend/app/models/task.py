import uuid
import enum
from sqlalchemy import Column, String, Date, DateTime, Enum, Integer
from datetime import datetime, date

from app.models.base import Base


class PriorityEnum(str, enum.Enum):
    """
    Приоритет задачи
    """
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"

    def __str__(self):
        return self.value


class StatusEnum(str, enum.Enum):
    """
    Статус задачи
    """
    TODO = "todo"
    IN_PROGRESS = "in_progress"
    DONE = "done"

    def __str__(self):
        return self.value


class Task(Base):
    """
    Модель задачи
    """
    __tablename__ = "tasks"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    title = Column(String(500), nullable=False)

    # Даты
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)

    # Статус и приоритет
    priority = Column(Enum(PriorityEnum), default=PriorityEnum.MEDIUM, nullable=False)
    status = Column(Enum(StatusEnum), default=StatusEnum.TODO, nullable=False)

    # Временные метки
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    completed_at = Column(DateTime, nullable=True)

    # Опционально: связь с пользователем
    # user_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    # user = relationship("User", back_populates="tasks")

    def __repr__(self):
        return f"<Task {self.title} ({self.status.value})>"

    @property
    def is_overdue(self) -> bool:
        """Проверка, просрочена ли задача"""
        if self.status == StatusEnum.DONE:
            return False
        return date.today() > self.end_date

    @property
    def days_remaining(self) -> int:
        """Количество дней до дедлайна"""
        if self.status == StatusEnum.DONE:
            return 0
        delta = self.end_date - date.today()
        return max(0, delta.days)

    @property
    def total_days(self) -> int:
        """Общее количество дней на задачу"""
        delta = self.end_date - self.start_date
        return delta.days + 1

    @property
    def progress_percentage(self) -> float:
        """Процент выполнения (на основе времени)"""
        if self.status == StatusEnum.DONE:
            return 100.0
        if self.status == StatusEnum.TODO:
            return 0.0

        today = date.today()
        if today < self.start_date:
            return 0.0
        if today > self.end_date:
            return 100.0

        total = self.total_days
        elapsed = (today - self.start_date).days + 1
        return min(100, max(0, (elapsed / total) * 100))

    def to_dict(self) -> dict:
        """Преобразование в словарь"""
        return {
            "id": self.id,
            "title": self.title,
            "start_date": self.start_date.isoformat(),
            "end_date": self.end_date.isoformat(),
            "priority": self.priority.value,
            "status": self.status.value,
            "created_at": self.created_at.isoformat(),
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "is_overdue": self.is_overdue,
            "days_remaining": self.days_remaining,
            "progress_percentage": self.progress_percentage,
        }