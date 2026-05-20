from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


def _uuid() -> str:
    return str(uuid4())


class AssessmentORM(Base):
    __tablename__ = "assessments"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(32), default="DRAFT")
    metadata: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class AssetORM(Base):
    __tablename__ = "assets"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    assessment_id: Mapped[str] = mapped_column(String(36), ForeignKey("assessments.id"), nullable=False, index=True)
    type: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    locator: Mapped[str | None] = mapped_column(Text, nullable=True)
    version_ref: Mapped[str | None] = mapped_column(String(255), nullable=True)
    metadata: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ImportBatchORM(Base):
    __tablename__ = "import_batches"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    assessment_id: Mapped[str] = mapped_column(String(36), ForeignKey("assessments.id"), index=True)
    asset_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("assets.id"), nullable=True, index=True)
    source_type: Mapped[str] = mapped_column(String(64))
    source_name: Mapped[str] = mapped_column(String(255))
    tool_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    tool_version: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="IMPORTED")
    summary: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class CandidateORM(Base):
    __tablename__ = "candidates"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    assessment_id: Mapped[str] = mapped_column(String(36), ForeignKey("assessments.id"), index=True)
    import_batch_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("import_batches.id"), nullable=True, index=True)
    candidate_type: Mapped[str] = mapped_column(String(32), index=True)
    proposed_object_type: Mapped[str] = mapped_column(String(255), default="")
    proposed_payload: Mapped[dict] = mapped_column(JSON, default=dict)
    confidence: Mapped[str] = mapped_column(String(32), default="UNKNOWN", index=True)
    status: Mapped[str] = mapped_column(String(32), default="NEW", index=True)
    dedupe_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    duplicate_of_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    validation_errors: Mapped[list] = mapped_column(JSON, default=list)
    source: Mapped[str] = mapped_column(String(64), default="OTHER", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
