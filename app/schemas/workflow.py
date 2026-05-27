import re
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

from app.models.enums import CheckStatus, Confidence, MarkStatus, SourceType
from app.schemas.common import new_uuid, utcnow


class ObjectCreate(BaseModel):
    asset_id: UUID | None = None
    type: str = "UNKNOWN"
    kind: str = "UNKNOWN"
    name: str
    locator: str | None = None
    range: dict | None = None
    properties: dict = Field(default_factory=dict)
    source: SourceType = SourceType.OTHER


class ObjectUpdate(BaseModel):
    asset_id: UUID | None = None
    type: str | None = None
    kind: str | None = None
    name: str | None = None
    locator: str | None = None
    range: dict | None = None
    properties: dict | None = None


_KIND_RE = re.compile(r"^[A-Z][A-Z0-9_]*$")


class MarkCreate(BaseModel):
    object_id: UUID | None = None
    object_payload: ObjectCreate | None = None
    kind: str
    title: str
    note: str | None = None
    confidence: Confidence = Confidence.UNKNOWN
    source: SourceType = SourceType.MANUAL_JSON
    link_to_candidate_id: UUID | None = None

    @field_validator("kind")
    @classmethod
    def normalize_mark_kind(cls, value: str) -> str:
        key = value.strip().upper()
        if len(key) > 64:
            raise ValueError("mark kind too long")
        if not _KIND_RE.match(key):
            raise ValueError("mark kind must match [A-Z][A-Z0-9_]*")
        return key

    @model_validator(mode="after")
    def validate_object_ref(self) -> "MarkCreate":
        if self.object_id is None and self.object_payload is None:
            raise ValueError("object_id or object_payload is required")
        return self


class MarkUpdate(BaseModel):
    title: str | None = None
    note: str | None = None
    status: MarkStatus | None = None
    is_dead_end: bool | None = None
    kind: str | None = None

    @field_validator("kind")
    @classmethod
    def normalize_mark_kind(cls, value: str) -> str:
        key = value.strip().upper()
        if len(key) > 64:
            raise ValueError("mark kind too long")
        if not _KIND_RE.match(key):
            raise ValueError("mark kind must match [A-Z][A-Z0-9_]*")
        return key


class CheckCreate(BaseModel):
    title: str
    description: str = ""
    category: str | None = None
    check_type: str | None = None
    parent_check_id: UUID | None = None
    sort_order: int = 0
    is_group: bool = False
    is_checked: bool = False
    priority: str = "MEDIUM"
    status: CheckStatus = CheckStatus.NOT_STARTED
    reason: str | None = None
    source: SourceType = SourceType.MANUAL_JSON


class CheckStatusUpdate(BaseModel):
    status: CheckStatus
    reason: str | None = None

    @model_validator(mode="after")
    def validate_reason(self) -> "CheckStatusUpdate":
        if self.status in {CheckStatus.NOT_APPLICABLE, CheckStatus.BLOCKED, CheckStatus.FAILED, CheckStatus.CHECKED_WEAK} and not self.reason:
            raise ValueError("reason is required for selected status")
        return self


class CheckUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    category: str | None = None
    check_type: str | None = None
    parent_check_id: UUID | None = None
    sort_order: int | None = None
    is_group: bool | None = None
    is_checked: bool | None = None
    priority: str | None = None
    status: CheckStatus | None = None
    reason: str | None = None


class CheckRecord(BaseModel):
    id: UUID = Field(default_factory=new_uuid)
    assessment_id: UUID
    title: str
    description: str = ""
    category: str | None = None
    check_type: str | None = None
    parent_check_id: UUID | None = None
    sort_order: int = 0
    is_group: bool = False
    is_checked: bool = False
    priority: str = "MEDIUM"
    status: CheckStatus = CheckStatus.NOT_STARTED
    reason: str | None = None
    source: SourceType = SourceType.OTHER
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
