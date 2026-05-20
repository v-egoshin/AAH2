# Execution Status Ledger

## DONE
- Sprint 8 expanded: SQLAlchemy ORM + SQL store now covers assessments/assets/imports/candidates.
- Provider-based store switching applied to key routes.

## PARTIAL DONE
- Candidate accept SQL flow sets status but does not yet create full graph entities.
- Most advanced domain routes still in-memory-first.

## NOT DONE
- Full SQL migration across entire domain model.
- Alembic and schema versioning.
- Full tests/e2e.
