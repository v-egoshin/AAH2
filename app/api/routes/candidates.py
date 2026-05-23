from uuid import UUID

from fastapi import APIRouter, HTTPException

from app.models.enums import CandidateStatus
from app.repositories.store_provider import get_store
from app.schemas.domain import CandidateAcceptRequest, CandidateUpdate

router = APIRouter(tags=["candidates"])


@router.get("/api/assessments/{assessment_id}/candidates")
def list_candidates(assessment_id: UUID):
    return get_store().list_candidates(assessment_id)


@router.get("/api/candidates/{candidate_id}")
def get_candidate(candidate_id: UUID):
    record = get_store().get_candidate(candidate_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Candidate not found")
    return record


@router.post("/api/candidates/{candidate_id}/accept")
def accept_candidate(candidate_id: UUID, payload: CandidateAcceptRequest):
    store = get_store()
    candidate = store.get_candidate(candidate_id)
    if candidate is None:
        raise HTTPException(status_code=404, detail="Candidate not found")
    created = store.accept_candidate(candidate_id, payload)
    refreshed = store.get_candidate(candidate_id)
    return {"candidate_id": candidate.id, "status": refreshed.status if refreshed else candidate.status, "created": created}


@router.post("/api/candidates/{candidate_id}/reject")
def reject_candidate(candidate_id: UUID):
    candidate = get_store().reject_candidate(candidate_id)
    if candidate is None:
        raise HTTPException(status_code=404, detail="Candidate not found")
    return {"candidate_id": candidate.id, "status": candidate.status}


@router.patch("/api/candidates/{candidate_id}")
def patch_candidate(candidate_id: UUID, payload: CandidateUpdate):
    store = get_store()
    if payload.status == CandidateStatus.REJECTED:
        record = store.reject_candidate(candidate_id)
    else:
        record = store.update_candidate(candidate_id, payload)
    if record is None:
        raise HTTPException(status_code=404, detail="Candidate not found")
    return record
