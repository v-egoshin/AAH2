from uuid import UUID

from fastapi import APIRouter, HTTPException

from app.schemas.relation_evidence import RelationCreate
from app.services.store import store

router = APIRouter(tags=["relations"])


@router.post("/api/assessments/{assessment_id}/relations")
def create_relation(assessment_id: UUID, payload: RelationCreate):
    if store.get_assessment(assessment_id) is None:
        raise HTTPException(status_code=404, detail="Assessment not found")
    return store.create_relation(assessment_id, payload)


@router.get("/api/assessments/{assessment_id}/relations")
def list_relations(assessment_id: UUID):
    return [r for r in store.relations.values() if r.assessment_id == assessment_id]
