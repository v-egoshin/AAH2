from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from app.schemas.domain import ImportCreate
from app.repositories.store_provider import get_store
from app.audit import record
from app.api.pagination import paginate

router = APIRouter(tags=["imports"])


@router.post("/api/assessments/{assessment_id}/imports")
def create_import(assessment_id: UUID, payload: ImportCreate) -> dict:
    if get_store().get_assessment(assessment_id) is None:
        raise HTTPException(status_code=404, detail="Assessment not found")
    batch, _ = get_store().create_import(assessment_id, payload)
    record("import.created", {"import_batch_id": str(batch.id), "assessment_id": str(assessment_id)})
    return {"import_batch_id": batch.id, "asset_id": batch.asset_id, "summary": batch.summary}


@router.get("/api/assessments/{assessment_id}/imports")
def list_imports(assessment_id: UUID) -> list:
    store = get_store()
    if hasattr(store, "imports"):
        return [x for x in store.imports.values() if x.assessment_id == assessment_id]
    from app.db.models import ImportBatchORM
    from app.db.session import get_session
    with get_session() as db:
        rows = db.query(ImportBatchORM).filter(ImportBatchORM.assessment_id == str(assessment_id)).all()
        return [
            {"id": r.id, "assessment_id": r.assessment_id, "asset_id": r.asset_id, "source_type": r.source_type, "source_name": r.source_name, "tool_name": r.tool_name, "tool_version": r.tool_version, "status": r.status, "summary": r.summary}
            for r in rows
        ]


@router.get("/api/imports/{import_batch_id}")
def get_import(import_batch_id: UUID):
    store = get_store()
    item = store.imports.get(import_batch_id) if hasattr(store, "imports") else None
    if item is None:
        raise HTTPException(status_code=404, detail="Import batch not found")
    return item
