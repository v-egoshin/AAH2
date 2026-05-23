from uuid import UUID

from fastapi import APIRouter

from app.models.enums import CandidateStatus, CheckStatus, MarkKind
from app.repositories.store_provider import get_store

router = APIRouter(tags=["coverage"])


@router.get("/api/assessments/{assessment_id}/coverage")
def coverage(assessment_id: UUID) -> dict:
    store = get_store()
    candidates = store.list_candidates(assessment_id)
    marks = store.list_marks(assessment_id)
    checks = store.list_checks(assessment_id)
    findings = store.list_findings(assessment_id)
    relations = store.list_relations(assessment_id)
    cases = store.list_cases(assessment_id)

    check_ids_with_finding = {
        relation.object_id
        for relation in relations
        if relation.subject_type == "FINDING" and relation.object_type == "CHECK" and relation.predicate == "GENERATED_FROM"
    }
    sinks = [mark for mark in marks if mark.kind == MarkKind.SINK]
    sources = [mark for mark in marks if mark.kind == MarkKind.SOURCE]
    marks_with_checks = {
        relation.object_id
        for relation in relations
        if relation.predicate == "CHECKS" and relation.object_type == "MARK"
    }

    return {
        "candidates": {
            "new_count": sum(1 for candidate in candidates if candidate.status == CandidateStatus.NEW),
            "needs_review_count": sum(1 for candidate in candidates if candidate.status == CandidateStatus.NEEDS_REVIEW),
            "error_count": sum(1 for candidate in candidates if candidate.status == CandidateStatus.ERROR),
        },
        "marks": {
            "sinks_without_checks": sum(1 for mark in sinks if mark.id not in marks_with_checks),
            "sources_without_relations": sum(1 for mark in sources if not any(relation.subject_id == mark.id or relation.object_id == mark.id for relation in relations)),
            "guards_without_related_flow": sum(1 for mark in marks if mark.kind == MarkKind.GUARD and not any(relation.subject_id == mark.id or relation.object_id == mark.id for relation in relations)),
        },
        "cases": {
            "open_without_checks": max(0, len(cases) - len([relation for relation in relations if relation.predicate == "PART_OF" and relation.subject_type == "CHECK" and relation.object_type == "CASE"])),
            "confirmed_without_finding": 0,
        },
        "checks": {
            "failed_without_finding": sum(1 for check in checks if check.status == CheckStatus.FAILED and check.id not in check_ids_with_finding),
            "not_applicable_without_reason": sum(1 for check in checks if check.status == CheckStatus.NOT_APPLICABLE and not check.reason),
        },
        "findings": {
            "open_critical": sum(1 for finding in findings if finding.status == "OPEN" and finding.severity == "CRITICAL"),
        },
        "totals": {
            "relations": len(relations),
        },
    }
