from uuid import UUID

from fastapi import APIRouter, HTTPException

from app.schemas.relation_evidence import EvidenceCreate
from app.services.store import store

router = APIRouter(tags=["evidence"])


@router.post("/api/assessments/{assessment_id}/evidence")
def create_evidence(assessment_id: UUID, payload: EvidenceCreate):
    if store.get_assessment(assessment_id) is None:
        raise HTTPException(status_code=404, detail="Assessment not found")
    evidence, links = store.create_evidence(assessment_id, payload)
    return {"evidence": evidence, "links_created": [x.id for x in links]}


@router.get("/api/assessments/{assessment_id}/evidence")
def list_evidence(assessment_id: UUID):
    return [e for e in store.evidence.values() if e.assessment_id == assessment_id]
