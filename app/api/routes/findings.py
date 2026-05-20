from uuid import UUID

from fastapi import APIRouter, HTTPException

from app.schemas.case_finding import FindingCreate
from app.services.store import store

router = APIRouter(tags=["findings"])


@router.post("/api/assessments/{assessment_id}/findings")
def create_finding(assessment_id: UUID, payload: FindingCreate):
    if store.get_assessment(assessment_id) is None:
        raise HTTPException(status_code=404, detail="Assessment not found")
    return store.create_finding(assessment_id, payload)


@router.get("/api/assessments/{assessment_id}/findings")
def list_findings(assessment_id: UUID):
    return [f for f in store.findings.values() if f.assessment_id == assessment_id]


@router.post("/api/checks/{check_id}/convert-to-finding")
def convert_check_to_finding(check_id: UUID, payload: FindingCreate):
    finding = store.convert_check_to_finding(check_id, payload)
    if finding is None:
        raise HTTPException(status_code=400, detail="Check is not convertible to finding")
    return finding
