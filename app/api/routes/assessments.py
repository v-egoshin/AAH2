from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from app.api.pagination import paginate
from app.audit import record
from app.repositories.store_provider import get_store
from app.schemas.assessment import AssessmentCreate, AssessmentRead, AssessmentUpdate

router = APIRouter(prefix="/api/assessments", tags=["assessments"])


@router.post("", response_model=AssessmentRead)
def create_assessment(payload: AssessmentCreate) -> AssessmentRead:
    rec = get_store().create_assessment(payload)
    record("assessment.created", {"assessment_id": str(rec.id)})
    return rec


@router.get("", response_model=list[AssessmentRead])
def list_assessments(limit: int = Query(100, ge=1, le=1000), offset: int = Query(0, ge=0)) -> list[AssessmentRead]:
    return paginate(list(get_store().list_assessments()), limit=limit, offset=offset)


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
