from uuid import UUID

from fastapi import APIRouter, HTTPException

from app.repositories.store_provider import get_store
from app.schemas.case_finding import FindingCreate, FindingUpdate

router = APIRouter(tags=["findings"])


@router.post("/api/assessments/{assessment_id}/findings")
def create_finding(assessment_id: UUID, payload: FindingCreate):
    store = get_store()
    if store.get_assessment(assessment_id) is None:
        raise HTTPException(status_code=404, detail="Assessment not found")
    return store.create_finding(assessment_id, payload)


@router.get("/api/assessments/{assessment_id}/findings")
def list_findings(assessment_id: UUID):
    return get_store().list_findings(assessment_id)


@router.get("/api/findings/{finding_id}")
def get_finding(finding_id: UUID):
    record = get_store().get_finding(finding_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Finding not found")
    return record


@router.patch("/api/findings/{finding_id}")
def patch_finding(finding_id: UUID, payload: FindingUpdate):
    record = get_store().update_finding(finding_id, payload)
    if record is None:
        raise HTTPException(status_code=404, detail="Finding not found")
    return record
