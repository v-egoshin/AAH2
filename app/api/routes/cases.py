from uuid import UUID

from fastapi import APIRouter, HTTPException

from app.repositories.errors import DuplicateNameError
from app.repositories.store_provider import get_store
from app.schemas.case_finding import CaseCreate, CaseUpdate

router = APIRouter(tags=["cases"])


@router.post("/api/assessments/{assessment_id}/cases")
def create_case(assessment_id: UUID, payload: CaseCreate):
    store = get_store()
    if store.get_assessment(assessment_id) is None:
        raise HTTPException(status_code=404, detail="Assessment not found")
    asset = store.get_asset(payload.asset_id)
    if asset is None or asset.assessment_id != assessment_id:
        raise HTTPException(status_code=404, detail="Asset not found")
    try:
        return store.create_case(assessment_id, payload)
    except DuplicateNameError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("/api/assessments/{assessment_id}/cases")
def list_cases(assessment_id: UUID):
    return get_store().list_cases(assessment_id)


@router.get("/api/cases/{case_id}")
def get_case(case_id: UUID):
    record = get_store().get_case(case_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Case not found")
    return record


@router.patch("/api/cases/{case_id}")
def patch_case(case_id: UUID, payload: CaseUpdate):
    if payload.asset_id is not None:
        asset = get_store().get_asset(payload.asset_id)
        if asset is None:
            raise HTTPException(status_code=404, detail="Asset not found")
    try:
        record = get_store().update_case(case_id, payload)
    except DuplicateNameError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if record is None:
        raise HTTPException(status_code=404, detail="Case not found")
    return record


@router.delete("/api/cases/{case_id}")
def delete_case(case_id: UUID):
    if not get_store().delete_case(case_id):
        raise HTTPException(status_code=404, detail="Case not found")
    return {"ok": True}
