from uuid import UUID

from fastapi import APIRouter
from pydantic import BaseModel

from app.services.store import store

router = APIRouter(tags=["review-context"])


class ReviewContextRequest(BaseModel):
    asset_id: UUID | None = None
    file: str | None = None
    start_line: int | None = None
    end_line: int | None = None
    symbol: str | None = None
    locator: str | None = None
    include_nearby: bool = True


@router.post("/api/assessments/{assessment_id}/review-context")
def review_context(assessment_id: UUID, payload: ReviewContextRequest) -> dict:
    marks = [m for m in store.marks.values() if m.assessment_id == assessment_id]
    objects = [o for o in store.objects.values() if o.assessment_id == assessment_id]
    candidates = [c for c in store.candidates.values() if c.assessment_id == assessment_id and c.status in {"NEW", "NEEDS_REVIEW", "DUPLICATE"}]

    if payload.file:
        objects = [o for o in objects if (o.range or {}).get("file") == payload.file]
        mark_obj_ids = {o.id for o in objects}
        marks = [m for m in marks if m.object_id in mark_obj_ids]

    mark_ids = {m.id for m in marks}
    relations = [r for r in store.relations.values() if r.assessment_id == assessment_id and (r.subject_id in mark_ids or r.object_id in mark_ids)]
    checks = [c for c in store.checks.values() if c.assessment_id == assessment_id]
    cases = [c for c in store.cases.values() if c.assessment_id == assessment_id]
    evidence = [e for e in store.evidence.values() if e.assessment_id == assessment_id]

    return {
        "context": payload.model_dump(),
        "objects": objects,
        "nearby_objects": [],
        "marks": marks,
        "candidates": candidates,
        "relations": relations,
        "cases": cases,
        "checks": checks,
        "evidence": evidence,
        "suggested_actions": [],
    }
