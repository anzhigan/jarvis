from app.models.base import Base
from app.models.user import User
from app.models.note import NoteArea, NoteFolder, NoteFile, NoteImage
from app.models.task import Task, PriorityEnum, StatusEnum
from app.models.task_log import TaskLog

# Для удобной миграции Alembic
target_metadata = Base.metadata

__all__ = [
    "Base",
    "User",
    "NoteArea",
    "NoteFolder",
    "NoteFile",
    "NoteImage",
    "Task",
    "PriorityEnum",
    "StatusEnum",
    "TaskLog",
    "target_metadata",
]