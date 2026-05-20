from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.enums import AssetType
from app.schemas.common import new_uuid, utcnow


class AssetCreate(BaseModel):
    type: AssetType
    name: str
    locator: str | None = None
    version_ref: str | None = None
    metadata: dict = Field(default_factory=dict)


class AssetUpdate(BaseModel):
    name: str | None = None
    locator: str | None = None
    version_ref: str | None = None
    metadata: dict | None = None


class AssetRead(BaseModel):
    id: UUID = Field(default_factory=new_uuid)
    assessment_id: UUID
    type: AssetType
    name: str
    locator: str | None = None
    version_ref: str | None = None
    metadata: dict = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
