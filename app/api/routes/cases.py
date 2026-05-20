from uuid import UUID

from fastapi import APIRouter, HTTPException

from app.schemas.case_finding import CaseCreate
from app.services.store import store

router = APIRouter(tags=["cases"])


@router.post("/api/assessments/{assessment_id}/cases")
def create_case(assessment_id: UUID, payload: CaseCreate):
    if store.get_assessment(assessment_id) is None:
        raise HTTPException(status_code=404, detail="Assessment not found")
    return store.create_case(assessment_id, payload)


@router.get("/api/assessments/{assessment_id}/cases")
def list_cases(assessment_id: UUID):
    return [c for c in store.cases.values() if c.assessment_id == assessment_id]
