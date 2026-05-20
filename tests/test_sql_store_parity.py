from app.db.init_db import init_db
from app.repositories.sql_store import SqlStore
from app.schemas.assessment import AssessmentCreate
from app.schemas.domain import CandidateAcceptRequest, CandidateCreate, ImportCreate, ImportSource


def test_sql_accept_candidate_creates_object_mark_and_check():
    init_db()
    store = SqlStore()
    assessment = store.create_assessment(AssessmentCreate(title="sql parity", description="d"))

    import_payload = ImportCreate(
        source=ImportSource(source_type="OTHER", source_name="tool"),
        candidates=[
            CandidateCreate(candidate_type="OBJECT", proposed_payload={"name": "obj-1", "type": "CODE", "kind": "FUNCTION"}),
            CandidateCreate(candidate_type="MARK", proposed_payload={"kind": "NOTE", "title": "m1", "object": {"name": "obj-2"}}),
            CandidateCreate(candidate_type="CHECK", proposed_payload={"title": "c1", "status": "NOT_STARTED"}),
        ],
    )

    _, candidates = store.create_import(assessment.id, import_payload)

    for c in candidates:
        result = store.accept_candidate(c.id, CandidateAcceptRequest())
        assert isinstance(result, dict)

    objects = store.list_objects(assessment.id)
    marks = store.list_marks(assessment.id)
    checks = store.list_checks(assessment.id)

    assert len(objects) >= 2
    assert len(marks) == 1
    assert len(checks) == 1


def test_sql_merge_candidate_enforces_same_assessment():
    init_db()
    store = SqlStore()
    a1 = store.create_assessment(AssessmentCreate(title="a1", description="d"))
    a2 = store.create_assessment(AssessmentCreate(title="a2", description="d"))

    c1 = store.create_import(
        a1.id,
        ImportCreate(source=ImportSource(source_type="OTHER", source_name="tool"), candidates=[CandidateCreate(candidate_type="OBJECT", proposed_payload={"name": "1"})]),
    )[1][0]
    c2 = store.create_import(
        a2.id,
        ImportCreate(source=ImportSource(source_type="OTHER", source_name="tool"), candidates=[CandidateCreate(candidate_type="OBJECT", proposed_payload={"name": "2"})]),
    )[1][0]

    error = store.merge_candidate(c1.id, c2.id)
    assert error is not None
    assert error["error"] == "CROSS_ASSESSMENT_MERGE"
