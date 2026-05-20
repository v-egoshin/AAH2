from uuid import UUID

from fastapi import APIRouter
from pydantic import BaseModel

from app.repositories.store_provider import get_store

router = APIRouter(tags=["review-context"])


class ReviewContextRequest(BaseModel):
    asset_id: UUID | None = None
    file: str | None = None
    start_line: int | None = None
    end_line: int | None = None
    symbol: str | None = None
    locator: str | None = None
    include_nearby: bool = True
    nearby_window: int = 5
    include_candidates: bool = True
    include_relations: bool = True
    include_checks: bool = True
    include_cases: bool = True
    include_evidence: bool = True


def _line_overlap(a_start: int | None, a_end: int | None, b_start: int | None, b_end: int | None) -> bool:
    if None in {a_start, a_end, b_start, b_end}:
        return False
    return not (a_end < b_start or b_end < a_start)


def _to_list(store, attr: str, assessment_id: UUID):
    if hasattr(store, f"list_{attr}"):
        return getattr(store, f"list_{attr}")(assessment_id)
    data = getattr(store, attr, {})
    return [x for x in data.values() if getattr(x, "assessment_id", None) == assessment_id]


@router.post("/api/assessments/{assessment_id}/review-context")
def review_context(assessment_id: UUID, payload: ReviewContextRequest) -> dict:
    store = get_store()
    objects = _to_list(store, "objects", assessment_id)
    marks = _to_list(store, "marks", assessment_id)
    candidates = store.list_candidates(assessment_id) if payload.include_candidates else []

    exact_locator = []
    exact_range = []
    symbol_match = []
    file_match = []
    nearby_objects = []

    if payload.locator:
        exact_locator = [o for o in objects if getattr(o, "locator", None) == payload.locator]

    if payload.file:
        exact_range = [
            o
            for o in objects
            if (getattr(o, "range", None) or {}).get("file") == payload.file
            and _line_overlap(
                (getattr(o, "range", None) or {}).get("start_line"),
                (getattr(o, "range", None) or {}).get("end_line"),
                payload.start_line,
                payload.end_line,
            )
        ]

    if payload.symbol:
        symbol_match = [o for o in objects if payload.symbol.lower() in (getattr(o, "name", "") or "").lower()]

    if payload.file:
        file_match = [o for o in objects if (getattr(o, "range", None) or {}).get("file") == payload.file]

    prioritized = exact_locator or exact_range or symbol_match or file_match

    if payload.include_nearby and payload.file and payload.start_line is not None:
        nearby_objects = [
            o
            for o in file_match
            if (getattr(o, "range", None) or {}).get("start_line") is not None
            and abs((getattr(o, "range", None) or {}).get("start_line") - payload.start_line) <= payload.nearby_window
            and o not in prioritized
        ]

    selected_ids = {getattr(o, "id") for o in prioritized + nearby_objects}
    marks = [m for m in marks if getattr(m, "object_id", None) in selected_ids]
    mark_ids = {getattr(m, "id") for m in marks}

    relations = _to_list(store, "relations", assessment_id) if payload.include_relations else []
    relations = [r for r in relations if getattr(r, "subject_id", None) in mark_ids or getattr(r, "object_id", None) in mark_ids]

    checks = _to_list(store, "checks", assessment_id) if payload.include_checks else []
    cases = _to_list(store, "cases", assessment_id) if payload.include_cases else []
    evidence = _to_list(store, "evidence", assessment_id) if payload.include_evidence else []

    suggested_actions: list[dict] = []
    for c in candidates[:3]:
        suggested_actions.append({"action": "ACCEPT_CANDIDATE_AS_MARK", "label": "Accept candidate", "candidate_id": str(c.id)})
    if marks:
        suggested_actions.append({"action": "CREATE_CASE_FROM_MARK", "label": "Create case around this mark", "mark_id": str(marks[0].id)})
    if relations:
        suggested_actions.append({"action": "CREATE_CHECK_FROM_RELATION", "label": "Create check from relation", "relation_id": str(relations[0].id)})

    return {
        "context": payload.model_dump(),
        "objects": prioritized,
        "nearby_objects": nearby_objects,
        "marks": marks,
        "candidates": candidates,
        "relations": relations,
        "cases": cases,
        "checks": checks,
        "evidence": evidence,
        "suggested_actions": suggested_actions,
    }
