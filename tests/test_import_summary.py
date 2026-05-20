from app.schemas.assessment import AssessmentCreate
from app.schemas.domain import CandidateCreate, ImportCreate, ImportSource
from app.services.store import store


def test_import_summary_counts_duplicates_and_errors():
    store.__init__()
    a = store.create_assessment(AssessmentCreate(title='t', description='d'))
    good = CandidateCreate(candidate_type='OBJECT', proposed_payload={'type':'FILE'})
    dup = CandidateCreate(candidate_type='OBJECT', proposed_payload={'type':'FILE'})
    bad = CandidateCreate(candidate_type='MARK', proposed_payload={'title':'no kind'})
    batch, _ = store.create_import(a.id, ImportCreate(source=ImportSource(source_type='MANUAL_JSON', source_name='s'), candidates=[good, dup, bad]))
    assert batch.summary['duplicates'] >= 1
    assert batch.summary['errors'] >= 1
