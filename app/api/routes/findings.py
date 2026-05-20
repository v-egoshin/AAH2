from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from app.schemas.case_finding import FindingCreate
from app.repositories.store_provider import get_store
from app.api.pagination import paginate

router = APIRouter(tags=["findings"])


@router.post("/api/assessments/{assessment_id}/findings")
def create_finding(assessment_id: UUID, payload: FindingCreate):
    if get_store().get_assessment(assessment_id) is None:
        raise HTTPException(status_code=404, detail="Assessment not found")
    return get_store().create_finding(assessment_id, payload)


@router.get("/api/assessments/{assessment_id}/findings")
def list_findings(assessment_id: UUID):
    store=get_store(); return store.list_findings(assessment_id) if hasattr(store,"list_findings") else [f for f in store.findings.values() if f.assessment_id==assessment_id]


@router.post("/api/checks/{check_id}/convert-to-finding")
def convert_check_to_finding(check_id: UUID, payload: FindingCreate):
    finding = get_store().convert_check_to_finding(check_id, payload)
    if finding is None:
        raise HTTPException(status_code=400, detail="Check is not convertible to finding")
    return finding
