from uuid import UUID

from fastapi import APIRouter, HTTPException

from app.repositories.store_provider import get_store
from app.schemas.domain import ImportBatchUpdate, ImportCreate

router = APIRouter(tags=["imports"])


@router.post("/api/assessments/{assessment_id}/imports")
def create_import(assessment_id: UUID, payload: ImportCreate) -> dict:
    store = get_store()
    if store.get_assessment(assessment_id) is None:
        raise HTTPException(status_code=404, detail="Assessment not found")
    batch, created = store.create_import(assessment_id, payload)
    return {"import_batch_id": batch.id, "asset_id": batch.asset_id, "summary": batch.summary, "candidates_created": len(created)}


@router.get("/api/assessments/{assessment_id}/imports")
def list_imports(assessment_id: UUID):
    return get_store().list_imports(assessment_id)


@router.get("/api/imports/{import_batch_id}")
def get_import(import_batch_id: UUID):
    record = get_store().get_import(import_batch_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Import batch not found")
    return record


@router.patch("/api/imports/{import_batch_id}")
def patch_import(import_batch_id: UUID, payload: ImportBatchUpdate):
    record = get_store().update_import(import_batch_id, payload)
    if record is None:
        raise HTTPException(status_code=404, detail="Import batch not found")
    return record
