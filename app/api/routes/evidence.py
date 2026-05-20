from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from app.schemas.relation_evidence import EvidenceCreate
from app.repositories.store_provider import get_store
from app.api.pagination import paginate

router = APIRouter(tags=["evidence"])


@router.post("/api/assessments/{assessment_id}/evidence")
def create_evidence(assessment_id: UUID, payload: EvidenceCreate):
    if get_store().get_assessment(assessment_id) is None:
        raise HTTPException(status_code=404, detail="Assessment not found")
    result = get_store().create_evidence(assessment_id, payload)
    if isinstance(result, dict):
        return result
    evidence, links = result
    return {"evidence": evidence, "links_created": [x.id for x in links]}


@router.get("/api/assessments/{assessment_id}/evidence")
def list_evidence(assessment_id: UUID):
    store=get_store(); return store.list_evidence(assessment_id) if hasattr(store,"list_evidence") else [e for e in store.evidence.values() if e.assessment_id==assessment_id]
