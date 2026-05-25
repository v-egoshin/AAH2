from uuid import UUID

from fastapi import APIRouter
from pydantic import BaseModel

from app.models.enums import CandidateStatus
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


def _normalize_file_path(path: str | None) -> str:
    if not path:
        return ""
    normalized = str(path).replace("\\", "/").lstrip("./")
    return normalized


def _file_paths_match(stored: str | None, query: str | None) -> bool:
    left = _normalize_file_path(stored)
    right = _normalize_file_path(query)
    if not left or not right:
        return not left and not right
    if left == right:
        return True
    return left.endswith(f"/{right}") or right.endswith(f"/{left}")


def _locator_matches(locator: str | None, file: str | None, start_line: int | None, end_line: int | None) -> bool:
    if not locator or not file:
        return True
    locator_value = str(locator)
    locator_file = locator_value.split(":", 1)[0]
    if not _file_paths_match(locator_file, file) and not locator_value.startswith(file):
        return False
    if start_line is None:
        return True
    parts = locator_value.rsplit(":", 2)
    try:
        locator_line = int(parts[-2] if len(parts) == 3 else parts[-1])
    except (IndexError, ValueError):
        return True
    target_end = end_line or start_line
    return start_line <= locator_line <= target_end


def _line_matches(range_data: dict | None, locator: str | None, file: str | None, start_line: int | None, end_line: int | None) -> bool:
    if start_line is None:
        return True
    if not range_data:
        return _locator_matches(locator, file, start_line, end_line)
    range_start = range_data.get("start_line")
    range_end = range_data.get("end_line", range_start)
    if range_start is None:
        return _locator_matches(locator, file, start_line, end_line)
    target_end = end_line or start_line
    return int(range_start) <= int(target_end) and int(range_end or range_start) >= int(start_line)


def _candidate_locator(candidate) -> tuple[str | None, dict | None]:
    payload = candidate.proposed_payload or {}
    object_payload = payload.get("object") if isinstance(payload.get("object"), dict) else None
    locator = payload.get("locator")
    range_data = payload.get("range")
    if object_payload:
        locator = locator or object_payload.get("locator")
        range_data = range_data or object_payload.get("range")
    return locator, range_data


def _candidate_matches(candidate, file: str | None, start_line: int | None, end_line: int | None) -> bool:
    if not file:
        return True
    locator, range_data = _candidate_locator(candidate)
    return _line_matches(range_data, locator, file, start_line, end_line)


@router.post("/api/assessments/{assessment_id}/review-context")
def review_context(assessment_id: UUID, payload: ReviewContextRequest) -> dict:
    store = get_store()
    all_objects = store.list_objects(assessment_id)
    all_marks = store.list_marks(assessment_id)
    all_checks = store.list_checks(assessment_id)
    all_cases = store.list_cases(assessment_id)
    all_findings = store.list_findings(assessment_id)
    all_relations = store.list_relations(assessment_id)
    candidates = [
        candidate
        for candidate in store.list_candidates(assessment_id)
        if candidate.status in {CandidateStatus.NEW, CandidateStatus.NEEDS_REVIEW, CandidateStatus.DUPLICATE}
    ]

    objects = all_objects
    marks = all_marks
    if payload.file:
        file_objects = [
            obj
            for obj in all_objects
            if _file_paths_match((obj.range or {}).get("file"), payload.file)
            or _file_paths_match(str(obj.locator or "").split(":", 1)[0], payload.file)
            or str(obj.locator or "").startswith(payload.file)
        ]
        nearby_objects = file_objects
        objects = [
            obj
            for obj in file_objects
            if _line_matches(obj.range, obj.locator, payload.file, payload.start_line, payload.end_line)
        ]
        object_ids = {obj.id for obj in objects}
        nearby_object_ids = {obj.id for obj in nearby_objects}
        marks = [mark for mark in all_marks if mark.object_id in object_ids]
        nearby_marks = [mark for mark in all_marks if mark.object_id in nearby_object_ids]
        candidates = [
            candidate
            for candidate in candidates
            if _candidate_matches(candidate, payload.file, payload.start_line, payload.end_line)
        ]
    else:
        object_ids = {obj.id for obj in objects}
        nearby_objects = objects
        nearby_marks = marks
        nearby_object_ids = object_ids

    mark_ids = {mark.id for mark in marks}
    nearby_mark_ids = {mark.id for mark in nearby_marks}
    related_entity_ids = mark_ids | object_ids
    if payload.include_nearby:
        related_entity_ids |= nearby_mark_ids | nearby_object_ids
    relations = [
        relation
        for relation in all_relations
        if relation.subject_id in related_entity_ids
        or relation.object_id in related_entity_ids
    ]
    related_case_ids = {
        relation.object_id
        for relation in relations
        if relation.predicate == "PART_OF" and relation.object_type == "CASE"
    }
    related_check_ids = {
        relation.subject_id
        for relation in relations
        if relation.subject_type == "CHECK"
    } | {
        relation.object_id
        for relation in relations
        if relation.object_type == "CHECK"
    }
    related_finding_ids = {
        relation.subject_id
        for relation in relations
        if relation.subject_type == "FINDING"
    } | {
        relation.object_id
        for relation in relations
        if relation.object_type == "FINDING"
    }

    checks = [check for check in all_checks if check.id in related_check_ids]
    cases = [case for case in all_cases if case.id in related_case_ids]
    findings = [finding for finding in all_findings if finding.id in related_finding_ids]

    suggested_actions = []
    if not marks:
        suggested_actions.extend(["Mark Source", "Mark Sink", "Mark Guard", "Mark Transform"])
    if marks and not checks:
        suggested_actions.append("Create Check")
    if marks and not cases:
        suggested_actions.append("Create Case")
    if candidates:
        suggested_actions.append("Review Candidates")

    return {
        "context": payload.model_dump(),
        "objects": objects,
        "nearby_objects": nearby_objects if payload.include_nearby else [],
        "marks": marks,
        "nearby_marks": nearby_marks if payload.include_nearby else [],
        "candidates": candidates,
        "relations": relations,
        "cases": cases,
        "checks": checks,
        "findings": findings,
        "summary": {
            "current_objects": len(objects),
            "current_marks": len(marks),
            "current_candidates": len(candidates),
            "current_relations": len(relations),
            "current_checks": len(checks),
            "current_cases": len(cases),
            "current_findings": len(findings),
            "nearby_marks": len(nearby_marks),
            "nearby_objects": len(nearby_objects),
        },
        "suggested_actions": suggested_actions,
    }
