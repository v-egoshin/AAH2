from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from app.schemas.workflow import MarkCreate, MarkUpdate
from app.repositories.store_provider import get_store
from app.api.pagination import paginate

router = APIRouter(tags=["marks"])


@router.post("/api/assessments/{assessment_id}/marks")
def create_mark(assessment_id: UUID, payload: MarkCreate):
    if get_store().get_assessment(assessment_id) is None:
        raise HTTPException(status_code=404, detail="Assessment not found")
    if payload.object_id and payload.object_id not in get_store().objects:
        raise HTTPException(status_code=404, detail="Object not found")
    return get_store().create_mark(assessment_id, payload)


@router.get("/api/assessments/{assessment_id}/marks")
def list_marks(assessment_id: UUID):
    store=get_store(); return store.list_marks(assessment_id) if hasattr(store,"list_marks") else [m for m in store.marks.values() if m.assessment_id==assessment_id]


@router.patch("/api/marks/{mark_id}")
def patch_mark(mark_id: UUID, payload: MarkUpdate):
    mark = get_store().update_mark(mark_id, payload)
    if mark is None:
        raise HTTPException(status_code=404, detail="Mark not found")
    return mark
