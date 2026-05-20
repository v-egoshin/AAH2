from uuid import UUID

from fastapi import APIRouter, HTTPException

from app.schemas.assessment import AssessmentCreate, AssessmentRead, AssessmentUpdate
from app.repositories.store_provider import get_store

router = APIRouter(prefix="/api/assessments", tags=["assessments"])


@router.post("", response_model=AssessmentRead)
def create_assessment(payload: AssessmentCreate) -> AssessmentRead:
    return get_store().create_assessment(payload)


@router.get("", response_model=list[AssessmentRead])
def list_assessments() -> list[AssessmentRead]:
    return list(get_store().list_assessments())


@router.get("/{assessment_id}", response_model=AssessmentRead)
def get_assessment(assessment_id: UUID) -> AssessmentRead:
    record = get_store().get_assessment(assessment_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Assessment not found")
    return record


@router.patch("/{assessment_id}", response_model=AssessmentRead)
def patch_assessment(assessment_id: UUID, payload: AssessmentUpdate) -> AssessmentRead:
    record = get_store().update_assessment(assessment_id, payload)
    if record is None:
        raise HTTPException(status_code=404, detail="Assessment not found")
    return record
