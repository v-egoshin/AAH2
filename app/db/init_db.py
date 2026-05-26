from sqlalchemy import inspect, text

from app.db.base import Base
from app.db.mark_kind_catalog_model import MarkKindCatalogORM  # noqa: F401
from app.db.models import (  # noqa: F401
    AssessmentORM,
    AssetORM,
    CandidateORM,
    CaseORM,
    CheckORM,
    EvidenceORM,
    FindingORM,
    ImportBatchORM,
    MarkORM,
    ObjectORM,
    RelationORM,
)
from app.db.session import engine


def _table_column_names(table: str) -> set[str]:
    inspector = inspect(engine)
    if table not in inspector.get_table_names():
        return set()
    return {col["name"] for col in inspector.get_columns(table)}


def _ensure_check_columns() -> None:
    if "checks" not in inspect(engine).get_table_names():
        return
    cols = _table_column_names("checks")
    statements: list[str] = []
    if "parent_check_id" not in cols:
        statements.append("ALTER TABLE checks ADD COLUMN parent_check_id VARCHAR(36)")
    if "sort_order" not in cols:
        statements.append("ALTER TABLE checks ADD COLUMN sort_order INTEGER DEFAULT 0 NOT NULL")
    if "is_group" not in cols:
        statements.append("ALTER TABLE checks ADD COLUMN is_group BOOLEAN DEFAULT FALSE NOT NULL")
    if "is_checked" not in cols:
        statements.append("ALTER TABLE checks ADD COLUMN is_checked BOOLEAN DEFAULT FALSE NOT NULL")
    if not statements:
        return
    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))


def _ensure_mark_columns() -> None:
    if "marks" not in inspect(engine).get_table_names():
        return
    cols = _table_column_names("marks")
    if "is_dead_end" in cols:
        return
    with engine.begin() as connection:
        connection.execute(text("ALTER TABLE marks ADD COLUMN is_dead_end BOOLEAN DEFAULT FALSE NOT NULL"))


def _ensure_case_columns() -> None:
    if "cases" not in inspect(engine).get_table_names():
        return
    cols = _table_column_names("cases")
    statements: list[str] = []
    if "asset_id" not in cols:
        statements.append("ALTER TABLE cases ADD COLUMN asset_id VARCHAR(36)")
    index_sql = "CREATE INDEX IF NOT EXISTS ix_cases_asset_id ON cases (asset_id)"
    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))
        connection.execute(text(index_sql))


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
    _ensure_check_columns()
    _ensure_mark_columns()
    _ensure_case_columns()
