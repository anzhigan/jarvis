import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field


class MetricCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = ""
    unit: str = ""
    target_value: float | None = None
    color: str = "#3B82F6"


class MetricUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    unit: str | None = None
    target_value: float | None = None
    color: str | None = None


class MetricEntryCreate(BaseModel):
    value: float
    date: date
    note: str = ""


class MetricEntryOut(BaseModel):
    id: uuid.UUID
    metric_id: uuid.UUID
    value: float
    date: date
    note: str
    created_at: datetime

    model_config = {"from_attributes": True}


class MetricOut(BaseModel):
    id: uuid.UUID
    name: str
    description: str
    unit: str
    target_value: float | None
    color: str
    entries: list[MetricEntryOut] = []
    created_at: datetime

    model_config = {"from_attributes": True}
