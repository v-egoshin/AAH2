from app.schemas.assessment import AssessmentCreate
from app.schemas.domain import CandidateCreate, ImportCreate, ImportSource
from app.services.store import store


def test_duplicate_candidate_import_marks_duplicate():
    store.__init__()
    a = store.create_assessment(AssessmentCreate(title='x', description='y'))
    c = CandidateCreate(candidate_type='OBJECT', proposed_payload={'type':'FILE','kind':'PY','locator':'a.py:1'})
    imp = ImportCreate(source=ImportSource(source_type='MANUAL_JSON', source_name='s'), candidates=[c,c])
    _, created = store.create_import(a.id, imp)
    assert created[0].status in {'NEW','DUPLICATE'}
    assert created[1].status == 'DUPLICATE'


def test_merge_candidate_links_duplicate():
    store.__init__()
    a = store.create_assessment(AssessmentCreate(title='x', description='y'))
    c1 = store._create_candidate(a.id, a.id, CandidateCreate(candidate_type='OBJECT', proposed_payload={'type':'FILE'}))
    c2 = store._create_candidate(a.id, a.id, CandidateCreate(candidate_type='OBJECT', proposed_payload={'type':'FUNC'}))
    out = store.merge_candidate(c2.id, c1.id)
    assert out['status'] == 'DUPLICATE'
