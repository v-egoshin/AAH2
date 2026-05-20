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
    meta: Mapped[dict] = mapped_column("metadata", JSON, default=dict)
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
    meta: Mapped[dict] = mapped_column("metadata", JSON, default=dict)
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

class ObjectORM(Base):
    __tablename__ = "objects"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    assessment_id: Mapped[str] = mapped_column(String(36), ForeignKey("assessments.id"), index=True)
    asset_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    type: Mapped[str] = mapped_column(String(64), default="UNKNOWN")
    kind: Mapped[str] = mapped_column(String(128), default="UNKNOWN")
    name: Mapped[str] = mapped_column(String(255))
    locator: Mapped[str | None] = mapped_column(Text, nullable=True)
    range: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    properties: Mapped[dict] = mapped_column(JSON, default=dict)
    source: Mapped[str] = mapped_column(String(64), default="OTHER")


class MarkORM(Base):
    __tablename__ = "marks"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    assessment_id: Mapped[str] = mapped_column(String(36), ForeignKey("assessments.id"), index=True)
    object_id: Mapped[str] = mapped_column(String(36), ForeignKey("objects.id"), index=True)
    kind: Mapped[str] = mapped_column(String(64))
    title: Mapped[str] = mapped_column(String(255))
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    confidence: Mapped[str] = mapped_column(String(32), default="UNKNOWN")
    status: Mapped[str] = mapped_column(String(32), default="ACTIVE")
    source: Mapped[str] = mapped_column(String(64), default="OTHER")


class CheckORM(Base):
    __tablename__ = "checks"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    assessment_id: Mapped[str] = mapped_column(String(36), ForeignKey("assessments.id"), index=True)
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text, default="")
    category: Mapped[str | None] = mapped_column(String(128), nullable=True)
    check_type: Mapped[str | None] = mapped_column(String(128), nullable=True)
    priority: Mapped[str] = mapped_column(String(32), default="MEDIUM")
    status: Mapped[str] = mapped_column(String(32), default="NOT_STARTED")
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[str] = mapped_column(String(64), default="OTHER")

class CaseORM(Base):
    __tablename__ = "cases"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    assessment_id: Mapped[str] = mapped_column(String(36), ForeignKey("assessments.id"), index=True)
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(32), default="OPEN")
    severity_hint: Mapped[str | None] = mapped_column(String(32), nullable=True)
    confidence: Mapped[str] = mapped_column(String(32), default="MEDIUM")


class FindingORM(Base):
    __tablename__ = "findings"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    assessment_id: Mapped[str] = mapped_column(String(36), ForeignKey("assessments.id"), index=True)
    title: Mapped[str] = mapped_column(String(255))
    severity: Mapped[str] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(32), default="OPEN")
    finding_type: Mapped[str] = mapped_column(String(64))
    description: Mapped[str] = mapped_column(Text)
    impact: Mapped[str] = mapped_column(Text)
    recommendation: Mapped[str] = mapped_column(Text)


class RelationORM(Base):
    __tablename__ = "relations"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    assessment_id: Mapped[str] = mapped_column(String(36), ForeignKey("assessments.id"), index=True)
    subject_type: Mapped[str] = mapped_column(String(32))
    subject_id: Mapped[str] = mapped_column(String(36), index=True)
    predicate: Mapped[str] = mapped_column(String(64), index=True)
    object_type: Mapped[str] = mapped_column(String(32))
    object_id: Mapped[str] = mapped_column(String(36), index=True)
    confidence: Mapped[str] = mapped_column(String(32), default="MEDIUM")
    status: Mapped[str] = mapped_column(String(32), default="ACCEPTED")
    source: Mapped[str] = mapped_column(String(64), default="MANUAL_JSON")
    evidence_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    properties: Mapped[dict] = mapped_column(JSON, default=dict)


class EvidenceORM(Base):
    __tablename__ = "evidence"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    assessment_id: Mapped[str] = mapped_column(String(36), ForeignKey("assessments.id"), index=True)
    title: Mapped[str] = mapped_column(String(255))
    evidence_type: Mapped[str] = mapped_column(String(64))
    summary: Mapped[str] = mapped_column(Text)
    content: Mapped[str] = mapped_column(Text)
    confidence: Mapped[str] = mapped_column(String(32), default="MEDIUM")
    source: Mapped[str] = mapped_column(String(64), default="MANUAL_JSON")
    properties: Mapped[dict] = mapped_column(JSON, default=dict)
