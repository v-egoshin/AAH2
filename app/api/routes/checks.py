from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from app.schemas.workflow import CheckCreate, CheckStatusUpdate
from app.repositories.store_provider import get_store
from app.api.pagination import paginate

router = APIRouter(tags=["checks"])


@router.post("/api/assessments/{assessment_id}/checks")
def create_check(assessment_id: UUID, payload: CheckCreate):
    if get_store().get_assessment(assessment_id) is None:
        raise HTTPException(status_code=404, detail="Assessment not found")
    return get_store().create_check(assessment_id, payload)


@router.get("/api/assessments/{assessment_id}/checks")
def list_checks(assessment_id: UUID):
    store=get_store(); return store.list_checks(assessment_id) if hasattr(store,"list_checks") else [c for c in store.checks.values() if c.assessment_id==assessment_id]


@router.post("/api/checks/{check_id}/status")
def update_check_status(check_id: UUID, payload: CheckStatusUpdate):
    check = get_store().update_check_status(check_id, payload)
    if check is None:
        raise HTTPException(status_code=404, detail="Check not found")
    return check
