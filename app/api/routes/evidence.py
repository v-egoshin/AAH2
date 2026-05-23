from uuid import UUID

from fastapi import APIRouter, HTTPException

from app.repositories.store_provider import get_store
from app.schemas.relation_evidence import EvidenceCreate, EvidenceUpdate

router = APIRouter(tags=["evidence"])


@router.post("/api/assessments/{assessment_id}/evidence")
def create_evidence(assessment_id: UUID, payload: EvidenceCreate):
    store = get_store()
    if store.get_assessment(assessment_id) is None:
        raise HTTPException(status_code=404, detail="Assessment not found")
    evidence, links = store.create_evidence(assessment_id, payload)
    return {"evidence": evidence, "links_created": [link.id for link in links]}


@router.get("/api/assessments/{assessment_id}/evidence")
def list_evidence(assessment_id: UUID):
    return get_store().list_evidence(assessment_id)


@router.get("/api/evidence/{evidence_id}")
def get_evidence(evidence_id: UUID):
    record = get_store().get_evidence(evidence_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Evidence not found")
    return record


@router.patch("/api/evidence/{evidence_id}")
def patch_evidence(evidence_id: UUID, payload: EvidenceUpdate):
    record = get_store().update_evidence(evidence_id, payload)
    if record is None:
        raise HTTPException(status_code=404, detail="Evidence not found")
    return record
