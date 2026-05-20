from app.api.routes.relations import create_relation
from app.schemas.assessment import AssessmentCreate
from app.schemas.relation_evidence import RelationCreate
from app.services.store import store
from app.schemas.workflow import ObjectCreate, CheckCreate


def test_checks_relation_requires_check_subject():
    store.__init__()
    a = store.create_assessment(AssessmentCreate(title="t", description="d"))
    obj = store.create_object(a.id, ObjectCreate(name="n"))
    chk = store.create_check(a.id, CheckCreate(title="c"))

    ok = create_relation(a.id, RelationCreate(subject_type="CHECK", subject_id=chk.id, predicate="CHECKS", object_type="OBJECT", object_id=obj.id))
    assert ok.predicate == "CHECKS"
