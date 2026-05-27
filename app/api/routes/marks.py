from uuid import UUID

from fastapi import APIRouter, HTTPException

from app.repositories.store_provider import get_store
from app.schemas.workflow import MarkCreate, MarkUpdate

router = APIRouter(tags=["marks"])


@router.post("/api/assessments/{assessment_id}/marks")
def create_mark(assessment_id: UUID, payload: MarkCreate):
    store = get_store()
    if store.get_assessment(assessment_id) is None:
        raise HTTPException(status_code=404, detail="Assessment not found")
    if payload.object_id and store.get_object(payload.object_id) is None:
        raise HTTPException(status_code=404, detail="Object not found")
    try:
        return store.create_mark(assessment_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/api/assessments/{assessment_id}/marks")
def list_marks(assessment_id: UUID):
    return get_store().list_marks(assessment_id)


@router.get("/api/marks/{mark_id}")
def get_mark(mark_id: UUID):
    record = get_store().get_mark(mark_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Mark not found")
    return record


@router.patch("/api/marks/{mark_id}")
def patch_mark(mark_id: UUID, payload: MarkUpdate):
    try:
        record = get_store().update_mark(mark_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if record is None:
        raise HTTPException(status_code=404, detail="Mark not found")
    return record


@router.delete("/api/marks/{mark_id}")
def delete_mark(mark_id: UUID):
    deleted = get_store().delete_mark(mark_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Mark not found")
    return {"deleted": True, "mark_id": str(mark_id)}
