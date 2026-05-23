"""initial full schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-05-20
"""
from alembic import op
import sqlalchemy as sa

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table("assessments", sa.Column("id", sa.String(36), primary_key=True), sa.Column("title", sa.String(255), nullable=False), sa.Column("description", sa.Text(), nullable=False), sa.Column("status", sa.String(32), nullable=False), sa.Column("metadata", sa.JSON(), nullable=False))
    op.create_table("assets", sa.Column("id", sa.String(36), primary_key=True), sa.Column("assessment_id", sa.String(36), nullable=False), sa.Column("type", sa.String(64), nullable=False), sa.Column("name", sa.String(255), nullable=False), sa.Column("locator", sa.Text()), sa.Column("version_ref", sa.String(255)), sa.Column("metadata", sa.JSON(), nullable=False))
    op.create_index("ix_assets_assessment_id", "assets", ["assessment_id"])

    op.create_table("import_batches", sa.Column("id", sa.String(36), primary_key=True), sa.Column("assessment_id", sa.String(36), nullable=False), sa.Column("asset_id", sa.String(36)), sa.Column("source_type", sa.String(64)), sa.Column("source_name", sa.String(255)), sa.Column("tool_name", sa.String(255)), sa.Column("tool_version", sa.String(255)), sa.Column("status", sa.String(32)), sa.Column("summary", sa.JSON(), nullable=False))
    op.create_index("ix_import_batches_assessment_id", "import_batches", ["assessment_id"])
    op.create_index("ix_import_batches_asset_id", "import_batches", ["asset_id"])

    op.create_table("objects", sa.Column("id", sa.String(36), primary_key=True), sa.Column("assessment_id", sa.String(36), nullable=False), sa.Column("asset_id", sa.String(36)), sa.Column("type", sa.String(64)), sa.Column("kind", sa.String(128)), sa.Column("name", sa.String(255)), sa.Column("locator", sa.Text()), sa.Column("range", sa.JSON()), sa.Column("properties", sa.JSON(), nullable=False), sa.Column("source", sa.String(64)))
    op.create_index("ix_objects_assessment_id", "objects", ["assessment_id"])
    op.create_index("ix_objects_asset_id", "objects", ["asset_id"])

    op.create_table("candidates", sa.Column("id", sa.String(36), primary_key=True), sa.Column("assessment_id", sa.String(36), nullable=False), sa.Column("import_batch_id", sa.String(36)), sa.Column("candidate_type", sa.String(32)), sa.Column("proposed_object_type", sa.String(255)), sa.Column("proposed_payload", sa.JSON(), nullable=False), sa.Column("confidence", sa.String(32)), sa.Column("status", sa.String(32)), sa.Column("dedupe_key", sa.String(255)), sa.Column("duplicate_of_id", sa.String(36)), sa.Column("validation_errors", sa.JSON(), nullable=False), sa.Column("source", sa.String(64)))
    op.create_index("ix_candidates_assessment_id", "candidates", ["assessment_id"])
    op.create_index("ix_candidates_import_batch_id", "candidates", ["import_batch_id"])
    op.create_index("ix_candidates_status", "candidates", ["status"])
    op.create_index("ix_candidates_candidate_type", "candidates", ["candidate_type"])
    op.create_index("ix_candidates_source", "candidates", ["source"])
    op.create_index("ix_candidates_confidence", "candidates", ["confidence"])
    op.create_index("ix_candidates_dedupe_key", "candidates", ["dedupe_key"])

    op.create_table("marks", sa.Column("id", sa.String(36), primary_key=True), sa.Column("assessment_id", sa.String(36), nullable=False), sa.Column("object_id", sa.String(36), nullable=False), sa.Column("kind", sa.String(64)), sa.Column("title", sa.String(255)), sa.Column("note", sa.Text()), sa.Column("confidence", sa.String(32)), sa.Column("status", sa.String(32)), sa.Column("source", sa.String(64)))
    op.create_index("ix_marks_assessment_id", "marks", ["assessment_id"])
    op.create_index("ix_marks_object_id", "marks", ["object_id"])

    op.create_table("checks", sa.Column("id", sa.String(36), primary_key=True), sa.Column("assessment_id", sa.String(36), nullable=False), sa.Column("title", sa.String(255)), sa.Column("description", sa.Text()), sa.Column("category", sa.String(128)), sa.Column("check_type", sa.String(128)), sa.Column("priority", sa.String(32)), sa.Column("status", sa.String(32)), sa.Column("reason", sa.Text()), sa.Column("source", sa.String(64)))
    op.create_index("ix_checks_assessment_id", "checks", ["assessment_id"])

    op.create_table("cases", sa.Column("id", sa.String(36), primary_key=True), sa.Column("assessment_id", sa.String(36), nullable=False), sa.Column("title", sa.String(255)), sa.Column("description", sa.Text()), sa.Column("status", sa.String(32)), sa.Column("severity_hint", sa.String(32)), sa.Column("confidence", sa.String(32)))
    op.create_index("ix_cases_assessment_id", "cases", ["assessment_id"])

    op.create_table("findings", sa.Column("id", sa.String(36), primary_key=True), sa.Column("assessment_id", sa.String(36), nullable=False), sa.Column("title", sa.String(255)), sa.Column("severity", sa.String(32)), sa.Column("status", sa.String(32)), sa.Column("finding_type", sa.String(64)), sa.Column("description", sa.Text()), sa.Column("impact", sa.Text()), sa.Column("recommendation", sa.Text()))
    op.create_index("ix_findings_assessment_id", "findings", ["assessment_id"])

    op.create_table("relations", sa.Column("id", sa.String(36), primary_key=True), sa.Column("assessment_id", sa.String(36), nullable=False), sa.Column("subject_type", sa.String(32)), sa.Column("subject_id", sa.String(36)), sa.Column("predicate", sa.String(64)), sa.Column("object_type", sa.String(32)), sa.Column("object_id", sa.String(36)), sa.Column("confidence", sa.String(32)), sa.Column("status", sa.String(32)), sa.Column("source", sa.String(64)), sa.Column("evidence_summary", sa.Text()), sa.Column("properties", sa.JSON(), nullable=False))
    op.create_index("ix_relations_assessment_id", "relations", ["assessment_id"])
    op.create_index("ix_relations_subject", "relations", ["subject_type", "subject_id"])
    op.create_index("ix_relations_object", "relations", ["object_type", "object_id"])

    op.create_table("evidence", sa.Column("id", sa.String(36), primary_key=True), sa.Column("assessment_id", sa.String(36), nullable=False), sa.Column("title", sa.String(255)), sa.Column("evidence_type", sa.String(64)), sa.Column("summary", sa.Text()), sa.Column("content", sa.Text()), sa.Column("confidence", sa.String(32)), sa.Column("source", sa.String(64)), sa.Column("properties", sa.JSON(), nullable=False))
    op.create_index("ix_evidence_assessment_id", "evidence", ["assessment_id"])


def downgrade() -> None:
    for t in ["evidence", "relations", "findings", "cases", "checks", "marks", "candidates", "objects", "import_batches", "assets", "assessments"]:
        op.drop_table(t)
