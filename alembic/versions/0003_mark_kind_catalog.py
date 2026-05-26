"""mark kind catalog per assessment

Revision ID: 0003_mark_kind_catalog
Revises: 0002_add_audit_timestamps
Create Date: 2026-05-26
"""

from alembic import op
import sqlalchemy as sa


revision = "0003_mark_kind_catalog"
down_revision = "0002_add_audit_timestamps"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "mark_kind_catalog",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("assessment_id", sa.String(length=36), nullable=False),
        sa.Column("kind_key", sa.String(length=64), nullable=False),
        sa.Column("display_label", sa.String(length=255), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("color", sa.String(length=16), nullable=False),
        sa.Column("is_builtin", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["assessment_id"], ["assessments.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("assessment_id", "kind_key", name="uq_mark_kind_catalog_assessment_kind"),
    )
    op.create_index(op.f("ix_mark_kind_catalog_assessment_id"), "mark_kind_catalog", ["assessment_id"], unique=False)
    op.create_index(op.f("ix_mark_kind_catalog_kind_key"), "mark_kind_catalog", ["kind_key"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_mark_kind_catalog_kind_key"), table_name="mark_kind_catalog")
    op.drop_index(op.f("ix_mark_kind_catalog_assessment_id"), table_name="mark_kind_catalog")
    op.drop_table("mark_kind_catalog")
