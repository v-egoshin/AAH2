from uuid import UUID

from fastapi import APIRouter

from app.models.enums import CandidateStatus, CheckStatus, MarkKind
from app.services.store import store

router = APIRouter(tags=["coverage"])


@router.get("/api/assessments/{assessment_id}/coverage")
def coverage(assessment_id: UUID) -> dict:
    candidates = [c for c in store.candidates.values() if c.assessment_id == assessment_id]
    marks = [m for m in store.marks.values() if m.assessment_id == assessment_id]
    checks = [c for c in store.checks.values() if c.assessment_id == assessment_id]
    findings = [f for f in store.findings.values() if f.assessment_id == assessment_id]
    relations = [r for r in store.relations.values() if r.assessment_id == assessment_id]
    evidence = [e for e in store.evidence.values() if e.assessment_id == assessment_id]
    cases = [c for c in store.cases.values() if c.assessment_id == assessment_id]

    check_ids_with_finding = {r.object_id for r in relations if r.subject_type == "FINDING" and r.object_type == "CHECK" and r.predicate == "GENERATED_FROM"}
    sinks = [m for m in marks if m.kind == MarkKind.SINK]
    sources = [m for m in marks if m.kind == MarkKind.SOURCE]
    marks_with_checks = {r.object_id for r in relations if r.predicate == "CHECKS" and r.object_type == "MARK"}

    return {
        "candidates": {
            "new_count": sum(1 for c in candidates if c.status == CandidateStatus.NEW),
            "needs_review_count": sum(1 for c in candidates if c.status == CandidateStatus.NEEDS_REVIEW),
            "error_count": sum(1 for c in candidates if c.status == CandidateStatus.ERROR),
        },
        "marks": {
            "sinks_without_checks": sum(1 for m in sinks if m.id not in marks_with_checks),
            "sources_without_relations": sum(1 for m in sources if not any(r.subject_id == m.id or r.object_id == m.id for r in relations)),
            "guards_without_related_flow": sum(1 for m in marks if m.kind == MarkKind.GUARD and not any(r.subject_id == m.id or r.object_id == m.id for r in relations)),
        },
        "cases": {
            "open_without_checks": max(0, len(cases) - len([r for r in relations if r.predicate == "PART_OF" and r.subject_type == "CHECK" and r.object_type == "CASE"])),
            "confirmed_without_finding": 0,
        },
        "checks": {
            "failed_without_finding": sum(1 for c in checks if c.status == CheckStatus.FAILED and c.id not in check_ids_with_finding),
            "done_without_evidence": sum(1 for c in checks if c.status in {CheckStatus.CHECKED_OK, CheckStatus.CHECKED_WEAK, CheckStatus.FAILED} and not any(r.object_type == "CHECK" and r.object_id == c.id and r.subject_type == "EVIDENCE" for r in relations)),
            "not_applicable_without_reason": sum(1 for c in checks if c.status == CheckStatus.NOT_APPLICABLE and not c.reason),
        },
        "findings": {
            "without_evidence": sum(1 for f in findings if not any(r.object_type == "FINDING" and r.object_id == f.id and r.subject_type == "EVIDENCE" for r in relations)),
            "open_critical": sum(1 for f in findings if f.status == "OPEN" and f.severity == "CRITICAL"),
        },
        "totals": {
            "relations": len(relations),
            "evidence": len(evidence),
        },
    }
