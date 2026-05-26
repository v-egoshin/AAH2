from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.enums import CandidateStatus, CandidateType, CheckStatus, Confidence, ImportStatus, MarkStatus, SourceType
from app.schemas.common import new_uuid, utcnow


class ImportSource(BaseModel):
    source_type: SourceType
    source_name: str
    tool_name: str | None = None
    tool_version: str | None = None


class CandidateCreate(BaseModel):
    candidate_type: CandidateType
    proposed_object_type: str = ""
    proposed_payload: dict = Field(default_factory=dict)
    confidence: Confidence = Confidence.UNKNOWN
    source: SourceType = SourceType.OTHER


class ImportCreate(BaseModel):
    source: ImportSource
    asset_id: UUID | None = None
    candidates: list[CandidateCreate] = Field(default_factory=list)


class ImportBatchRead(BaseModel):
    id: UUID = Field(default_factory=new_uuid)
    assessment_id: UUID
    asset_id: UUID | None = None
    source_type: SourceType
    source_name: str
    tool_name: str | None = None
    tool_version: str | None = None
    status: ImportStatus = ImportStatus.IMPORTED
    summary: dict = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class ImportBatchUpdate(BaseModel):
    asset_id: UUID | None = None
    status: ImportStatus | None = None
    summary: dict | None = None


class CandidateRead(BaseModel):
    id: UUID = Field(default_factory=new_uuid)
    assessment_id: UUID
    import_batch_id: UUID | None = None
    candidate_type: CandidateType
    proposed_object_type: str = ""
    proposed_payload: dict = Field(default_factory=dict)
    confidence: Confidence = Confidence.UNKNOWN
    status: CandidateStatus = CandidateStatus.NEW
    dedupe_key: str | None = None
    duplicate_of_id: UUID | None = None
    validation_errors: list[str] = Field(default_factory=list)
    source: SourceType = SourceType.OTHER
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class CandidateUpdate(BaseModel):
    status: CandidateStatus | None = None
    duplicate_of_id: UUID | None = None
    validation_errors: list[str] | None = None
    dedupe_key: str | None = None


class MarkRead(BaseModel):
    id: UUID = Field(default_factory=new_uuid)
    assessment_id: UUID
    object_id: UUID
    kind: str
    title: str
    note: str | None = None
    confidence: Confidence = Confidence.UNKNOWN
    status: MarkStatus = MarkStatus.ACTIVE
    source: SourceType = SourceType.OTHER
    is_dead_end: bool = False
    created_at: datetime = Field(default_factory=utcnow)


class CheckRead(BaseModel):
    id: UUID = Field(default_factory=new_uuid)
    assessment_id: UUID
    title: str
    parent_check_id: UUID | None = None
    sort_order: int = 0
    is_checked: bool = False
    status: CheckStatus = CheckStatus.NOT_STARTED
    reason: str | None = None
    source: SourceType = SourceType.OTHER
    created_at: datetime = Field(default_factory=utcnow)


class ObjectRead(BaseModel):
    id: UUID = Field(default_factory=new_uuid)
    assessment_id: UUID
    asset_id: UUID | None = None
    type: str
    kind: str
    name: str
    locator: str | None = None
    range: dict | None = None
    properties: dict = Field(default_factory=dict)
    source: SourceType = SourceType.OTHER
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class CandidateAcceptRequest(BaseModel):
    link_to_case_id: UUID | None = None
    link_to_check_id: UUID | None = None
    override_payload: dict | None = None
