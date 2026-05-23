from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import new_uuid, utcnow


class CaseCreate(BaseModel):
    title: str
    description: str = ""
    severity_hint: str | None = None
    confidence: str = "MEDIUM"


class CaseRead(BaseModel):
    id: UUID = Field(default_factory=new_uuid)
    assessment_id: UUID
    title: str
    description: str = ""
    status: str = "OPEN"
    severity_hint: str | None = None
    confidence: str = "MEDIUM"
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class CaseUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    status: str | None = None
    severity_hint: str | None = None
    confidence: str | None = None


class FindingCreate(BaseModel):
    title: str
    severity: str
    finding_type: str
    description: str
    impact: str
    recommendation: str


class FindingRead(BaseModel):
    id: UUID = Field(default_factory=new_uuid)
    assessment_id: UUID
    title: str
    severity: str
    status: str = "OPEN"
    finding_type: str
    description: str
    impact: str
    recommendation: str
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class FindingUpdate(BaseModel):
    title: str | None = None
    severity: str | None = None
    status: str | None = None
    finding_type: str | None = None
    description: str | None = None
    impact: str | None = None
    recommendation: str | None = None
