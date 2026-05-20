from fastapi import HTTPException

from app.api.routes.candidates import merge_candidate
from app.schemas.assessment import AssessmentCreate
from app.schemas.domain import CandidateCreate, ImportCreate, ImportSource
from app.services.store import store


def test_merge_cross_assessment_returns_http_400():
    store.__init__()
    a1 = store.create_assessment(AssessmentCreate(title='a1', description='d'))
    a2 = store.create_assessment(AssessmentCreate(title='a2', description='d'))

    c1 = store.create_import(
        a1.id,
        ImportCreate(source=ImportSource(source_type='MANUAL_JSON', source_name='s'), candidates=[CandidateCreate(candidate_type='OBJECT', proposed_payload={'name': 'x'})]),
    )[1][0]
    c2 = store.create_import(
        a2.id,
        ImportCreate(source=ImportSource(source_type='MANUAL_JSON', source_name='s'), candidates=[CandidateCreate(candidate_type='OBJECT', proposed_payload={'name': 'y'})]),
    )[1][0]

    try:
        merge_candidate(c1.id, c2.id)
        assert False, 'expected HTTPException'
    except HTTPException as exc:
        assert exc.status_code == 400
        assert exc.detail['error'] == 'CROSS_ASSESSMENT_MERGE'
