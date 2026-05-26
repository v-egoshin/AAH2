"""ORM for per-assessment mark kind catalog (kept separate to simplify init_db imports)."""

from sqlalchemy import Boolean, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class MarkKindCatalogORM(Base):
    __tablename__ = "mark_kind_catalog"
    __table_args__ = (UniqueConstraint("assessment_id", "kind_key", name="uq_mark_kind_catalog_assessment_kind"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    assessment_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("assessments.id"),
        nullable=False,
        index=True,
    )
    kind_key: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    display_label: Mapped[str] = mapped_column(String(255), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    color: Mapped[str] = mapped_column(String(16), nullable=False)
    is_builtin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
