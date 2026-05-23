from uuid import UUID

from fastapi import APIRouter, HTTPException

from app.repositories.store_provider import get_store
from app.schemas.workflow import ObjectCreate, ObjectUpdate

router = APIRouter(tags=["objects"])


@router.post("/api/assessments/{assessment_id}/objects")
def create_object(assessment_id: UUID, payload: ObjectCreate):
    store = get_store()
    if store.get_assessment(assessment_id) is None:
        raise HTTPException(status_code=404, detail="Assessment not found")
    return store.create_object(assessment_id, payload)


@router.get("/api/assessments/{assessment_id}/objects")
def list_objects(assessment_id: UUID):
    return get_store().list_objects(assessment_id)


@router.get("/api/objects/{object_id}")
def get_object(object_id: UUID):
    record = get_store().get_object(object_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Object not found")
    return record


@router.patch("/api/objects/{object_id}")
def patch_object(object_id: UUID, payload: ObjectUpdate):
    record = get_store().update_object(object_id, payload)
    if record is None:
        raise HTTPException(status_code=404, detail="Object not found")
    return record
