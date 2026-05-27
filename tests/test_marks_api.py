"""API tests for mark PATCH including kind changes."""

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    from app.main import app

    return TestClient(app)


def _mk_assessment(client: TestClient) -> str:
    import uuid

    res = client.post(
        "/api/assessments",
        json={"title": f"Test assessment {uuid.uuid4()}", "description": ""},
    )
    assert res.status_code == 200, res.text
    return str(res.json()["id"])


def _create_mark(client: TestClient, assessment_id: str, kind: str = "SOURCE") -> str:
    res = client.get(f"/api/assessments/{assessment_id}/mark-kind-catalog")
    assert res.status_code == 200, res.text
    res = client.post(
        f"/api/assessments/{assessment_id}/marks",
        json={
            "kind": kind,
            "title": "Test mark",
            "object_payload": {
                "name": "obj",
                "type": "CODE",
                "kind": "CALLSITE",
            },
        },
    )
    assert res.status_code == 200, res.text
    return str(res.json()["id"])


def test_patch_mark_kind(client: TestClient):
    assessment_id = _mk_assessment(client)
    mark_id = _create_mark(client, assessment_id, "SOURCE")

    res = client.patch(f"/api/marks/{mark_id}", json={"kind": "SINK"})
    assert res.status_code == 200, res.text
    assert res.json()["kind"] == "SINK"

    res = client.patch(f"/api/marks/{mark_id}", json={"kind": "sink"})
    assert res.status_code == 200, res.text
    assert res.json()["kind"] == "SINK"


def test_patch_mark_kind_rejects_unknown_and_disabled(client: TestClient):
    assessment_id = _mk_assessment(client)
    mark_id = _create_mark(client, assessment_id, "SOURCE")

    res = client.patch(f"/api/marks/{mark_id}", json={"kind": "ALIEN_KIND"})
    assert res.status_code == 400

    client.patch(
        f"/api/assessments/{assessment_id}/mark-kind-catalog",
        json={
            "entries": [
                {"kind_key": "NOTE", "display_label": "Mark", "enabled": True, "sort_order": 0, "color": "#475569", "is_builtin": True},
                {"kind_key": "SOURCE", "display_label": "Source", "enabled": False, "sort_order": 10, "color": "#15803d", "is_builtin": True},
                {"kind_key": "SINK", "display_label": "Sink", "enabled": True, "sort_order": 20, "color": "#b91c1c", "is_builtin": True},
                {"kind_key": "GUARD", "display_label": "Guard", "enabled": True, "sort_order": 30, "color": "#1d4ed8", "is_builtin": True},
                {"kind_key": "TRANSFORM", "display_label": "Transform", "enabled": True, "sort_order": 40, "color": "#a16207", "is_builtin": True},
            ],
        },
    )

    res = client.patch(f"/api/marks/{mark_id}", json={"kind": "SOURCE"})
    assert res.status_code == 400
