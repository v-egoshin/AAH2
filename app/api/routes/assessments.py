from uuid import UUID

from fastapi import APIRouter, HTTPException

from app.repositories.errors import DuplicateNameError
from app.schemas.assessment import AssessmentCreate, AssessmentRead, AssessmentUpdate
from app.repositories.store_provider import get_store

router = APIRouter(prefix="/api/assessments", tags=["assessments"])


@router.post("", response_model=AssessmentRead)
def create_assessment(payload: AssessmentCreate) -> AssessmentRead:
    try:
        return get_store().create_assessment(payload)
    except DuplicateNameError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


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
    try:
        record = get_store().update_assessment(assessment_id, payload)
    except DuplicateNameError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if record is None:
        raise HTTPException(status_code=404, detail="Assessment not found")
    return record


@router.delete("/{assessment_id}")
def delete_assessment(assessment_id: UUID):
    if not get_store().delete_assessment(assessment_id):
        raise HTTPException(status_code=404, detail="Assessment not found")
    return {"ok": True}
