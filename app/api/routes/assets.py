from uuid import UUID

from fastapi import APIRouter, HTTPException

from app.schemas.asset import AssetCreate, AssetRead, AssetUpdate
from app.repositories.store_provider import get_store

router = APIRouter(tags=["assets"])


@router.post("/api/assessments/{assessment_id}/assets", response_model=AssetRead)
def create_asset(assessment_id: UUID, payload: AssetCreate) -> AssetRead:
    if get_store().get_assessment(assessment_id) is None:
        raise HTTPException(status_code=404, detail="Assessment not found")
    return get_store().create_asset(assessment_id, payload)


@router.get("/api/assessments/{assessment_id}/assets", response_model=list[AssetRead])
def list_assets(assessment_id: UUID) -> list[AssetRead]:
    return get_store().list_assets(assessment_id)


@router.get("/api/assets/{asset_id}", response_model=AssetRead)
def get_asset(asset_id: UUID) -> AssetRead:
    asset = get_store().get_asset(asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="Asset not found")
    return asset


@router.patch("/api/assets/{asset_id}", response_model=AssetRead)
def patch_asset(asset_id: UUID, payload: AssetUpdate) -> AssetRead:
    asset = get_store().update_asset(asset_id, payload)
    if asset is None:
        raise HTTPException(status_code=404, detail="Asset not found")
    return asset


@router.delete("/api/assets/{asset_id}")
def delete_asset(asset_id: UUID):
    if not get_store().delete_asset(asset_id):
        raise HTTPException(status_code=404, detail="Asset not found")
    return {"ok": True}
