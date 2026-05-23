from sqlalchemy import inspect, text

from app.db.base import Base
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


def _ensure_check_columns() -> None:
    inspector = inspect(engine)
    if "checks" not in inspector.get_table_names():
        return
    statements = [
        'ALTER TABLE checks ADD COLUMN IF NOT EXISTS parent_check_id VARCHAR(36)',
        'ALTER TABLE checks ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0 NOT NULL',
        'ALTER TABLE checks ADD COLUMN IF NOT EXISTS is_group BOOLEAN DEFAULT FALSE NOT NULL',
        'ALTER TABLE checks ADD COLUMN IF NOT EXISTS is_checked BOOLEAN DEFAULT FALSE NOT NULL',
    ]
    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
    _ensure_check_columns()
