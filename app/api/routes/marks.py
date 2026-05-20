from uuid import UUID

from fastapi import APIRouter, HTTPException

from app.schemas.workflow import MarkCreate, MarkUpdate
from app.services.store import store

router = APIRouter(tags=["marks"])


@router.post("/api/assessments/{assessment_id}/marks")
def create_mark(assessment_id: UUID, payload: MarkCreate):
    if store.get_assessment(assessment_id) is None:
        raise HTTPException(status_code=404, detail="Assessment not found")
    if payload.object_id and payload.object_id not in store.objects:
        raise HTTPException(status_code=404, detail="Object not found")
    return store.create_mark(assessment_id, payload)


@router.get("/api/assessments/{assessment_id}/marks")
def list_marks(assessment_id: UUID):
    return [m for m in store.marks.values() if m.assessment_id == assessment_id]


@router.patch("/api/marks/{mark_id}")
def patch_mark(mark_id: UUID, payload: MarkUpdate):
    mark = store.update_mark(mark_id, payload)
    if mark is None:
        raise HTTPException(status_code=404, detail="Mark not found")
    return mark
