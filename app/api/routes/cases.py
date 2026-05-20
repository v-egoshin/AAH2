from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from app.schemas.case_finding import CaseCreate
from app.repositories.store_provider import get_store
from app.api.pagination import paginate

router = APIRouter(tags=["cases"])


@router.post("/api/assessments/{assessment_id}/cases")
def create_case(assessment_id: UUID, payload: CaseCreate):
    if get_store().get_assessment(assessment_id) is None:
        raise HTTPException(status_code=404, detail="Assessment not found")
    return get_store().create_case(assessment_id, payload)


@router.get("/api/assessments/{assessment_id}/cases")
def list_cases(assessment_id: UUID):
    store=get_store(); return store.list_cases(assessment_id) if hasattr(store,"list_cases") else [c for c in store.cases.values() if c.assessment_id==assessment_id]
