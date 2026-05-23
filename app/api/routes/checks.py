from uuid import UUID

from fastapi import APIRouter, HTTPException

from app.repositories.store_provider import get_store
from app.schemas.case_finding import FindingCreate
from app.schemas.workflow import CheckCreate, CheckStatusUpdate, CheckUpdate

router = APIRouter(tags=["checks"])


@router.post("/api/assessments/{assessment_id}/checks")
def create_check(assessment_id: UUID, payload: CheckCreate):
    store = get_store()
    if store.get_assessment(assessment_id) is None:
        raise HTTPException(status_code=404, detail="Assessment not found")
    return store.create_check(assessment_id, payload)


@router.get("/api/assessments/{assessment_id}/checks")
def list_checks(assessment_id: UUID):
    return get_store().list_checks(assessment_id)


@router.get("/api/checks/{check_id}")
def get_check(check_id: UUID):
    record = get_store().get_check(check_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Check not found")
    return record


@router.post("/api/checks/{check_id}/status")
def update_check_status(check_id: UUID, payload: CheckStatusUpdate):
    record = get_store().update_check_status(check_id, payload)
    if record is None:
        raise HTTPException(status_code=404, detail="Check not found")
    return record


@router.patch("/api/checks/{check_id}")
def patch_check(check_id: UUID, payload: CheckUpdate):
    record = get_store().update_check(check_id, payload)
    if record is None:
        raise HTTPException(status_code=404, detail="Check not found")
    return record


@router.delete("/api/checks/{check_id}")
def delete_check(check_id: UUID):
    deleted = get_store().delete_check(check_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Check not found")
    return {"deleted": True, "check_id": str(check_id)}


@router.post("/api/checks/{check_id}/convert-to-finding")
def convert_check_to_finding(check_id: UUID, payload: FindingCreate):
    record = get_store().convert_check_to_finding(check_id, payload)
    if record is None:
        raise HTTPException(status_code=400, detail="Check is not convertible to finding")
    return record
