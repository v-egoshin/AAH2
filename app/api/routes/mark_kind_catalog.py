from uuid import UUID

from fastapi import APIRouter, HTTPException

from app.repositories.store_provider import get_store
from app.schemas.mark_kind_catalog import MarkKindCatalogRead, MarkKindCatalogReplace

router = APIRouter(tags=["mark-kind-catalog"])


@router.get("/api/assessments/{assessment_id}/mark-kind-catalog", response_model=MarkKindCatalogRead)
def get_mark_kind_catalog(assessment_id: UUID) -> MarkKindCatalogRead:
    store = get_store()
    if store.get_assessment(assessment_id) is None:
        raise HTTPException(status_code=404, detail="Assessment not found")
    catalog = store.get_mark_kind_catalog(assessment_id)
    if catalog is None:
        raise HTTPException(status_code=404, detail="Assessment not found")
    return catalog


@router.patch("/api/assessments/{assessment_id}/mark-kind-catalog", response_model=MarkKindCatalogRead)
def patch_mark_kind_catalog(assessment_id: UUID, payload: MarkKindCatalogReplace) -> MarkKindCatalogRead:
    store = get_store()
    if store.get_assessment(assessment_id) is None:
        raise HTTPException(status_code=404, detail="Assessment not found")
    catalog = store.replace_mark_kind_catalog(assessment_id, payload)
    if catalog is None:
        raise HTTPException(status_code=404, detail="Assessment not found")
    return catalog
