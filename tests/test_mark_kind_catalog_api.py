"""API tests for assessment mark-kind catalog and mark validation."""

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


def test_catalog_seed_and_replace(client: TestClient):
    assessment_id = _mk_assessment(client)
    res = client.get(f"/api/assessments/{assessment_id}/mark-kind-catalog")
    assert res.status_code == 200
    data = res.json()
    keys = sorted(e["kind_key"] for e in data["entries"])
    assert keys == sorted(["SOURCE", "SINK", "GUARD", "TRANSFORM", "NOTE"])

    res = client.patch(
        f"/api/assessments/{assessment_id}/mark-kind-catalog",
        json={
            "entries": [
                {"kind_key": "NOTE", "display_label": "Mark", "enabled": True, "sort_order": 0, "color": "#475569", "is_builtin": True},
                {"kind_key": "SOURCE", "display_label": "Source", "enabled": True, "sort_order": 10, "color": "#15803d", "is_builtin": True},
                {"kind_key": "SINK", "display_label": "Sink", "enabled": True, "sort_order": 20, "color": "#b91c1c", "is_builtin": True},
                {"kind_key": "GUARD", "display_label": "Guard", "enabled": True, "sort_order": 30, "color": "#1d4ed8", "is_builtin": True},
                {"kind_key": "TRANSFORM", "display_label": "Transform", "enabled": True, "sort_order": 40, "color": "#a16207", "is_builtin": True},
                {"kind_key": "FUN", "display_label": "Fun", "enabled": True, "sort_order": 50, "color": "#9333ea", "is_builtin": False},
            ],
        },
    )
    assert res.status_code == 200, res.text
    keys_after = sorted(e["kind_key"] for e in res.json()["entries"])
    assert "FUN" in keys_after


def test_create_mark_rejects_unknown_and_disabled_kind(client: TestClient):
    assessment_id = _mk_assessment(client)
    payload = {
        "kind": "ALIEN_KIND",
        "title": "t",
        "object_payload": {
            "name": "obj",
            "type": "CODE",
            "kind": "CALLSITE",
        },
    }
    res = client.post(f"/api/assessments/{assessment_id}/marks", json=payload)
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
    blocked = dict(payload)
    blocked["kind"] = "SOURCE"
    res = client.post(f"/api/assessments/{assessment_id}/marks", json=blocked)
    assert res.status_code == 400

    ok = dict(blocked)
    ok["kind"] = "NOTE"
    res = client.post(f"/api/assessments/{assessment_id}/marks", json=ok)
    assert res.status_code == 200, res.text


def test_patch_catalog_requires_all_builtins(client: TestClient):
    assessment_id = _mk_assessment(client)
    bad = [
        {"kind_key": "NOTE", "display_label": "Mark", "enabled": True, "sort_order": 0, "color": "#475569", "is_builtin": True},
        {"kind_key": "SOURCE", "display_label": "Source", "enabled": True, "sort_order": 10, "color": "#15803d", "is_builtin": True},
    ]
    res = client.patch(f"/api/assessments/{assessment_id}/mark-kind-catalog", json={"entries": bad})
    assert res.status_code == 422


def test_get_catalog_404_for_missing_assessment(client: TestClient):
    res = client.get("/api/assessments/00000000-0000-4000-8000-000000000099/mark-kind-catalog")
    assert res.status_code == 404
