from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.enums import AssessmentStatus
from app.schemas.common import new_uuid, utcnow


class AssessmentCreate(BaseModel):
    title: str
    description: str = ""


class AssessmentUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    status: AssessmentStatus | None = None


class AssessmentRead(BaseModel):
    id: UUID = Field(default_factory=new_uuid)
    title: str
    description: str
    status: AssessmentStatus = AssessmentStatus.DRAFT
    metadata: dict = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
