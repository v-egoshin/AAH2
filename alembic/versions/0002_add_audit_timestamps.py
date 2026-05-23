"""add created_at/updated_at audit columns

Revision ID: 0002_add_audit_timestamps
Revises: 0001_initial
Create Date: 2026-05-20
"""

from alembic import op
import sqlalchemy as sa


revision = "0002_add_audit_timestamps"
down_revision = "0001_initial"
branch_labels = None
depends_on = None

TABLES = [
    "assessments",
    "assets",
    "import_batches",
    "candidates",
    "objects",
    "marks",
    "checks",
    "cases",
    "findings",
    "relations",
    "evidence",
]


def upgrade() -> None:
    for table in TABLES:
        op.add_column(table, sa.Column("created_at", sa.DateTime(timezone=True), nullable=True, server_default=sa.func.now()))
        op.add_column(table, sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True, server_default=sa.func.now()))


def downgrade() -> None:
    for table in reversed(TABLES):
        op.drop_column(table, "updated_at")
        op.drop_column(table, "created_at")
