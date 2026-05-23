from uuid import UUID

from fastapi import APIRouter, HTTPException

from app.repositories.store_provider import get_store
from app.schemas.relation_evidence import RelationCreate, RelationUpdate

router = APIRouter(tags=["relations"])


@router.post("/api/assessments/{assessment_id}/relations")
def create_relation(assessment_id: UUID, payload: RelationCreate):
    store = get_store()
    if store.get_assessment(assessment_id) is None:
        raise HTTPException(status_code=404, detail="Assessment not found")
    return store.create_relation(assessment_id, payload)


@router.get("/api/assessments/{assessment_id}/relations")
def list_relations(assessment_id: UUID):
    return get_store().list_relations(assessment_id)


@router.get("/api/relations/{relation_id}")
def get_relation(relation_id: UUID):
    record = get_store().get_relation(relation_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Relation not found")
    return record


@router.patch("/api/relations/{relation_id}")
def patch_relation(relation_id: UUID, payload: RelationUpdate):
    record = get_store().update_relation(relation_id, payload)
    if record is None:
        raise HTTPException(status_code=404, detail="Relation not found")
    return record


@router.delete("/api/relations/{relation_id}")
def delete_relation(relation_id: UUID):
    deleted = get_store().delete_relation(relation_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Relation not found")
    return {"ok": True}
