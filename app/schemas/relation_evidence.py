from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from app.schemas.common import new_uuid, utcnow


class RelationCreate(BaseModel):
    subject_type: str
    subject_id: UUID
    predicate: str
    object_type: str
    object_id: UUID
    confidence: str = "MEDIUM"
    status: str = "ACCEPTED"
    source: str = "MANUAL_JSON"
    evidence_summary: str | None = None
    properties: dict = Field(default_factory=dict)


class RelationRead(BaseModel):
    id: UUID = Field(default_factory=new_uuid)
    assessment_id: UUID
    subject_type: str
    subject_id: UUID
    predicate: str
    object_type: str
    object_id: UUID
    confidence: str = "MEDIUM"
    status: str = "ACCEPTED"
    source: str = "MANUAL_JSON"
    evidence_summary: str | None = None
    properties: dict = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class RelationUpdate(BaseModel):
    subject_type: str | None = None
    subject_id: UUID | None = None
    predicate: str | None = None
    object_type: str | None = None
    object_id: UUID | None = None
    confidence: str | None = None
    status: str | None = None
    evidence_summary: str | None = None
    properties: dict | None = None


class EvidenceLink(BaseModel):
    object_type: str
    object_id: UUID
    predicate: str = "SUPPORTS"


class EvidenceCreate(BaseModel):
    title: str
    evidence_type: str
    summary: str
    content: str
    confidence: str = "MEDIUM"
    source: str = "MANUAL_JSON"
    properties: dict = Field(default_factory=dict)
    link_to: list[EvidenceLink] = Field(default_factory=list)


class EvidenceRead(BaseModel):
    id: UUID = Field(default_factory=new_uuid)
    assessment_id: UUID
    title: str
    evidence_type: str
    summary: str
    content: str
    confidence: str = "MEDIUM"
    source: str = "MANUAL_JSON"
    properties: dict = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class EvidenceUpdate(BaseModel):
    title: str | None = None
    evidence_type: str | None = None
    summary: str | None = None
    content: str | None = None
    confidence: str | None = None
    properties: dict | None = None


class CheckConvertToFindingRequest(BaseModel):
    title: str
    severity: str
    finding_type: str
    description: str
    impact: str
    recommendation: str


class RelationQuery(BaseModel):
    file: str | None = None
    mark_id: UUID | None = None

    @model_validator(mode="after")
    def one_filter(self) -> "RelationQuery":
        return self
