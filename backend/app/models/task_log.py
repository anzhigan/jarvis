import uuid
from sqlalchemy import Column, String, DateTime, Integer, Boolean, ForeignKey
from datetime import datetime

from app.models.base import Base


class TaskLog(Base):
    """
    Лог трекинга времени выполнения задачи
    """
    __tablename__ = "task_logs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    task_id = Column(String(36), ForeignKey("tasks.id", ondelete="CASCADE"))

    started_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    finished_at = Column(DateTime, nullable=True)

    duration = Column(Integer, nullable=True)  # длительность в секундах
    completed = Column(Boolean, default=False)

    # Опционально: заметки к логу
    notes = Column(String(500), nullable=True)

    def __repr__(self):
        return f"<TaskLog {self.task_id} ({self.duration}s)>"

    @property
    def duration_formatted(self) -> str:
        """Форматированная длительность (MM:SS)"""
        if not self.duration:
            return "00:00"
        minutes = self.duration // 60
        seconds = self.duration % 60
        return f"{minutes:02d}:{seconds:02d}"

    @property
    def is_active(self) -> bool:
        """Активен ли лог (не завершен)"""
        return self.finished_at is None

    def finish(self):
        """Завершить лог"""
        self.finished_at = datetime.utcnow()
        if self.started_at:
            delta = self.finished_at - self.started_at
            self.duration = int(delta.total_seconds())
        self.completed = True