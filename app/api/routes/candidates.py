from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.models.enums import CandidateStatus
from app.audit import record
from app.repositories.store_provider import get_store
from app.schemas.domain import CandidateAcceptRequest
from app.api.pagination import paginate

router = APIRouter(tags=["candidates"])


class BatchIds(BaseModel):
    candidate_ids: list[UUID]


@router.get("/api/assessments/{assessment_id}/candidates")
def list_candidates(assessment_id: UUID, limit: int = Query(100, ge=1, le=1000), offset: int = Query(0, ge=0), q: str | None = None):
    rows = get_store().list_candidates(assessment_id)
    if q:
        rows = [r for r in rows if q.lower() in str(r).lower()]
    return paginate(rows, limit=limit, offset=offset)


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
    record("candidate.accepted", {"candidate_id": str(candidate.id)})
    return {"candidate_id": candidate.id, "status": CandidateStatus.ACCEPTED, "created": created}


@router.post("/api/candidates/{candidate_id}/reject")
def reject_candidate(candidate_id: UUID):
    store = get_store()
    candidate = store.get_candidate(candidate_id)
    if candidate is None:
        raise HTTPException(status_code=404, detail="Candidate not found")
    store.reject_candidate(candidate_id)
    record("candidate.rejected", {"candidate_id": str(candidate.id)})
    return {"candidate_id": candidate.id, "status": CandidateStatus.REJECTED}


@router.post("/api/candidates/{candidate_id}/merge")
def merge_candidate(candidate_id: UUID, target_candidate_id: UUID):
    store = get_store()
    if not hasattr(store, "merge_candidate"):
        raise HTTPException(status_code=501, detail="Merge not available")
    result = store.merge_candidate(candidate_id, target_candidate_id)
    if not result:
        raise HTTPException(status_code=404, detail="Candidate not found")
    if isinstance(result, dict) and result.get("error") == "CROSS_ASSESSMENT_MERGE":
        raise HTTPException(status_code=400, detail=result)
    record("candidate.merged", {"candidate_id": str(candidate_id), "target_candidate_id": str(target_candidate_id)})
    return result


@router.post("/api/candidates/batch-accept")
def batch_accept(payload: BatchIds):
    results = []
    for cid in payload.candidate_ids:
        try:
            created = get_store().accept_candidate(cid, CandidateAcceptRequest())
            results.append({"candidate_id": str(cid), "status": "ACCEPTED", "created": created})
        except Exception as exc:  # noqa: BLE001
            results.append({"candidate_id": str(cid), "status": "ERROR", "error": str(exc)})
    return {"results": results}


@router.post("/api/candidates/batch-reject")
def batch_reject(payload: BatchIds):
    results = []
    for cid in payload.candidate_ids:
        candidate = get_store().get_candidate(cid)
        if not candidate:
            results.append({"candidate_id": str(cid), "status": "ERROR", "error": "not found"})
            continue
        store = get_store()
        store.reject_candidate(cid)
        results.append({"candidate_id": str(cid), "status": "REJECTED"})
    return {"results": results}
