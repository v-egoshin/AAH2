from app.schemas.domain import CandidateRead


def object_key(assessment_id: str, payload: dict) -> str:
    r = payload.get("range", {}) or {}
    return f"OBJ:{assessment_id}:{payload.get('asset_id')}:{payload.get('type')}:{payload.get('kind')}:{payload.get('locator')}:{r.get('file')}:{r.get('start_line')}:{r.get('end_line')}"


def mark_key(assessment_id: str, payload: dict) -> str:
    title = (payload.get("title") or "").strip().lower()
    object_locator = ((payload.get("object") or {}).get("locator"))
    return f"MRK:{assessment_id}:{payload.get('kind')}:{title}:{object_locator}"


def relation_key(assessment_id: str, payload: dict) -> str:
    return f"REL:{assessment_id}:{payload.get('subject_type')}:{payload.get('subject_id')}:{payload.get('predicate')}:{payload.get('object_type')}:{payload.get('object_id')}"


def check_key(assessment_id: str, payload: dict) -> str:
    target = payload.get("primary_object_or_relation_id") or payload.get("title")
    return f"CHK:{assessment_id}:{payload.get('check_type')}:{target}"


def candidate_key(assessment_id: str, ctype: str, payload: dict) -> str:
    if ctype == "OBJECT":
        return object_key(assessment_id, payload)
    if ctype == "MARK":
        return mark_key(assessment_id, payload)
    if ctype == "RELATION":
        return relation_key(assessment_id, payload)
    if ctype == "CHECK":
        return check_key(assessment_id, payload)
    return f"GEN:{assessment_id}:{ctype}:{str(payload)}"


def minimal_validation_error(candidate: CandidateRead) -> str | None:
    p = candidate.proposed_payload or {}
    if candidate.candidate_type == "MARK" and not p.get("kind"):
        return "MARK candidate missing kind"
    if candidate.candidate_type == "RELATION" and not p.get("predicate"):
        return "RELATION candidate missing predicate"
    return None
