"""add case context line defaults

Revision ID: 0004_case_context_lines
Revises: 0003_mark_kind_catalog
Create Date: 2026-05-28
"""

from alembic import op
import sqlalchemy as sa

revision = "0004_case_context_lines"
down_revision = "0003_mark_kind_catalog"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "cases",
        sa.Column("context_before_lines", sa.Integer(), nullable=False, server_default="10"),
    )
    op.add_column(
        "cases",
        sa.Column("context_after_lines", sa.Integer(), nullable=False, server_default="10"),
    )


def downgrade() -> None:
    op.drop_column("cases", "context_after_lines")
    op.drop_column("cases", "context_before_lines")

