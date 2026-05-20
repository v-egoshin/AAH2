from uuid import uuid4

from app.api.routes.review_context import ReviewContextRequest, review_context
from app.services.store import store
from app.schemas.assessment import AssessmentCreate
from app.schemas.workflow import ObjectCreate, MarkCreate


def test_review_context_locator_priority():
    store.__init__()
    a = store.create_assessment(AssessmentCreate(title="t", description="d"))
    o1 = store.create_object(a.id, ObjectCreate(name="f1", locator="a.py:10", range={"file":"a.py","start_line":10,"end_line":10}))
    o2 = store.create_object(a.id, ObjectCreate(name="f2", locator="a.py:20", range={"file":"a.py","start_line":20,"end_line":20}))
    store.create_mark(a.id, MarkCreate(object_id=o1.id, kind="SOURCE", title="src"))
    store.create_mark(a.id, MarkCreate(object_id=o2.id, kind="SINK", title="sink"))

    out = review_context(a.id, ReviewContextRequest(file="a.py", start_line=20, end_line=20, locator="a.py:10"))
    assert len(out["objects"]) == 1
    assert out["objects"][0].id == o1.id
