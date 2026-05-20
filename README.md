# AppSec Assessment Workbench — Status

## Текущий статус
- **PARTIAL DONE** (Sprint 8 продолжается).

## DONE
- In-memory MVP backend + web/vscode scaffolds + docker compose.
- SQLAlchemy baseline (engine/session/base/init).
- SQL ORM for: Assessment, Asset, ImportBatch, Candidate.
- SQL store now supports:
  - Assessment CRUD,
  - Asset CRUD,
  - Import create,
  - Candidate list/get/accept status update.
- Route provider abstraction (`STORE_BACKEND=sql|memory`) used for assessments/assets/imports/candidates.

## PARTIAL DONE
- SQL path for candidate accept currently updates candidate status only (no full materialization graph yet).
- Remaining routes still rely mainly on in-memory store.

## NOT DONE
- Full SQL migration for objects/marks/checks/cases/findings/relations/evidence.
- Alembic migrations.
- Full parity review-context/coverage against SQL store.
- Dedupe/merge/batch semantics.
- Full web/extension UX parity.
- Automated tests/e2e.

## Run
```bash
docker compose up --build
```

## SQL backend mode
```bash
STORE_BACKEND=sql uvicorn app.main:app --reload
```
