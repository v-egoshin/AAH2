from uuid import UUID

from fastapi import APIRouter, HTTPException

from app.schemas.workflow import ObjectCreate
from app.services.store import store

router = APIRouter(tags=["objects"])


@router.post("/api/assessments/{assessment_id}/objects")
def create_object(assessment_id: UUID, payload: ObjectCreate):
    if store.get_assessment(assessment_id) is None:
        raise HTTPException(status_code=404, detail="Assessment not found")
    return store.create_object(assessment_id, payload)


@router.get("/api/assessments/{assessment_id}/objects")
def list_objects(assessment_id: UUID):
    return [o for o in store.objects.values() if o.assessment_id == assessment_id]
