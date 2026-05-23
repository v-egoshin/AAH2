# Execution Status Ledger

## WORKFLOW NOTES
- After changes that require a restart or rebuild of runtime tooling, update/restart the OKD agent or `docker-compose` environment so the running system matches the code.
- For local docker development, rebuild and restart backend/web with `./scripts/rebuild_app_stack.sh` when backend or frontend changes need a fresh image.

## UI CONVENTIONS
- Modal dialogs should use one shared shell and a consistent compact layout.
- Modal spacing should stay tight; avoid oversized padding and empty space.
- Use an icon close control instead of a text `Close` button.
- `Escape` should request modal close. If the form is dirty, show an in-app discard warning before closing.
- Prefer small action buttons with icons/pictograms where they improve scanability.
- Keep modal colors aligned with the calm neutral palette already used by the workbench.

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
