from app.models.enums import CandidateStatus
from uuid import UUID

from fastapi import APIRouter, HTTPException

from app.schemas.domain import CandidateAcceptRequest
from app.repositories.store_provider import get_store

router = APIRouter(tags=["candidates"])


@router.get("/api/assessments/{assessment_id}/candidates")
def list_candidates(assessment_id: UUID):
    return get_store().list_candidates(assessment_id)


@router.get("/api/candidates/{candidate_id}")
def get_candidate(candidate_id: UUID):
    candidate = get_store().get_candidate(candidate_id)
    if candidate is None:
        raise HTTPException(status_code=404, detail="Candidate not found")
    return candidate


@router.post("/api/candidates/{candidate_id}/accept")
def accept_candidate(candidate_id: UUID, payload: CandidateAcceptRequest):
    candidate = get_store().get_candidate(candidate_id)
    if candidate is None:
        raise HTTPException(status_code=404, detail="Candidate not found")
    created = get_store().accept_candidate(candidate_id, payload)
    return {"candidate_id": candidate.id, "status": candidate.status, "created": created}


@router.post("/api/candidates/{candidate_id}/reject")
def reject_candidate(candidate_id: UUID):
    candidate = get_store().get_candidate(candidate_id)
    if candidate is None:
        raise HTTPException(status_code=404, detail="Candidate not found")
    candidate.status = CandidateStatus.REJECTED
    return {"candidate_id": candidate.id, "status": candidate.status}
