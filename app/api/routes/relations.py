from uuid import UUID

from fastapi import APIRouter, HTTPException

from app.api.errors import DomainError
from app.repositories.store_provider import get_store
from app.schemas.relation_evidence import RelationCreate

router = APIRouter(tags=["relations"])


_ALLOWED = {"ASSET", "OBJECT", "MARK", "RELATION", "CASE", "CHECK", "EVIDENCE", "FINDING", "CANDIDATE", "IMPORT_BATCH"}
_STATUS = {"CANDIDATE", "ACCEPTED", "CONFIRMED", "DISMISSED", "NEEDS_REVIEW"}


def _exists(store, t: str, i: UUID) -> bool:
    maps = {"ASSET": "assets", "OBJECT": "objects", "MARK": "marks", "RELATION": "relations", "CASE": "cases", "CHECK": "checks", "EVIDENCE": "evidence", "FINDING": "findings", "CANDIDATE": "candidates", "IMPORT_BATCH": "imports"}
    attr = maps.get(t)
    if not attr or not hasattr(store, attr):
        return True
    return i in getattr(store, attr)


def _raise(code: str, msg: str, details: dict | None = None):
    raise DomainError(code, msg, details or {}, 400)


@router.post("/api/assessments/{assessment_id}/relations")
def create_relation(assessment_id: UUID, payload: RelationCreate):
    store = get_store()
    if store.get_assessment(assessment_id) is None:
        raise HTTPException(status_code=404, detail="Assessment not found")
    if payload.subject_type not in _ALLOWED or payload.object_type not in _ALLOWED:
        _raise("RELATION_TYPE_INVALID", "Invalid subject/object type")
    if payload.status not in _STATUS:
        _raise("RELATION_STATUS_INVALID", "Invalid relation status")

    if payload.predicate == "CHECKS" and payload.subject_type != "CHECK":
        _raise("RELATION_CONVENTION_ERROR", "Check CHECKS Object/Mark/Relation convention violated")
    if payload.predicate == "SUPPORTS" and payload.subject_type != "EVIDENCE":
        _raise("RELATION_CONVENTION_ERROR", "Evidence SUPPORTS target convention violated")
    if payload.predicate == "PART_OF" and payload.subject_type not in {"MARK", "RELATION", "CHECK"}:
        _raise("RELATION_CONVENTION_ERROR", "Only Mark/Relation/Check PART_OF Case supported")
    if payload.predicate == "GENERATED_FROM" and payload.subject_type != "FINDING":
        _raise("RELATION_CONVENTION_ERROR", "Finding GENERATED_FROM Check/Case convention violated")
    if payload.predicate == "DUPLICATE_OF" and payload.subject_type != "CANDIDATE":
        _raise("RELATION_CONVENTION_ERROR", "Candidate DUPLICATE_OF target convention violated")

    if not _exists(store, payload.subject_type, payload.subject_id) or not _exists(store, payload.object_type, payload.object_id):
        _raise("RELATION_ENTITY_NOT_FOUND", "Subject/object not found in current assessment")

    return store.create_relation(assessment_id, payload)


@router.get("/api/assessments/{assessment_id}/relations")
def list_relations(assessment_id: UUID):
    store = get_store()
    if hasattr(store, "list_relations"):
        return store.list_relations(assessment_id)
    return [r for r in getattr(store, "relations", {}).values() if r.assessment_id == assessment_id]
