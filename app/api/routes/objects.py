from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from app.schemas.workflow import ObjectCreate
from app.repositories.store_provider import get_store
from app.api.pagination import paginate

router = APIRouter(tags=["objects"])


@router.post("/api/assessments/{assessment_id}/objects")
def create_object(assessment_id: UUID, payload: ObjectCreate):
    if get_store().get_assessment(assessment_id) is None:
        raise HTTPException(status_code=404, detail="Assessment not found")
    return get_store().create_object(assessment_id, payload)


@router.get("/api/assessments/{assessment_id}/objects")
def list_objects(assessment_id: UUID):
    store=get_store(); return store.list_objects(assessment_id) if hasattr(store,"list_objects") else [o for o in store.objects.values() if o.assessment_id==assessment_id]
