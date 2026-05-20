from alembic.config import Config
from alembic import command
from sqlalchemy import create_engine, inspect


def test_alembic_creates_tables(tmp_path):
    db = tmp_path / 't.db'
    cfg = Config('alembic.ini')
    cfg.set_main_option('sqlalchemy.url', f'sqlite:///{db}')
    command.upgrade(cfg, 'head')
    insp = inspect(create_engine(f'sqlite:///{db}'))
    tables = set(insp.get_table_names())
    assert {'assessments','assets','import_batches','objects','candidates','marks','checks','cases','findings','relations','evidence'}.issubset(tables)



def test_alembic_adds_audit_timestamps(tmp_path):
    db = tmp_path / "t_columns.db"
    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", f"sqlite:///{db}")
    command.upgrade(cfg, "head")
    insp = inspect(create_engine(f"sqlite:///{db}"))
    assessment_cols = {c["name"] for c in insp.get_columns("assessments")}
    candidate_cols = {c["name"] for c in insp.get_columns("candidates")}
    assert {"created_at", "updated_at"}.issubset(assessment_cols)
    assert {"created_at", "updated_at"}.issubset(candidate_cols)
