"""API-тесты на уникальность имён assessments/assets/cases."""

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    from app.main import app

    return TestClient(app)


def _mk_assessment(client: TestClient, title: str = "Project Alpha") -> str:
    res = client.post("/api/assessments", json={"title": title, "description": ""})
    assert res.status_code == 200, res.text
    return str(res.json()["id"])


def _mk_asset(client: TestClient, assessment_id: str, name: str = "service-A") -> str:
    res = client.post(
        f"/api/assessments/{assessment_id}/assets",
        json={"type": "REPOSITORY", "name": name, "locator": "src"},
    )
    assert res.status_code == 200, res.text
    return str(res.json()["id"])


def test_assessment_title_must_be_unique(client: TestClient):
    _mk_assessment(client, "Same name")
    res = client.post("/api/assessments", json={"title": "Same name", "description": ""})
    assert res.status_code == 409, res.text
    assert "already exists" in res.json()["detail"]


def test_assessment_title_unique_on_update(client: TestClient):
    first = _mk_assessment(client, "First")
    second = _mk_assessment(client, "Second")
    res = client.patch(f"/api/assessments/{second}", json={"title": "First"})
    assert res.status_code == 409, res.text
    res = client.patch(f"/api/assessments/{first}", json={"title": "First"})
    assert res.status_code == 200, res.text


def test_asset_name_unique_within_assessment(client: TestClient):
    a1 = _mk_assessment(client, "A1")
    a2 = _mk_assessment(client, "A2")
    _mk_asset(client, a1, "shared-name")
    # тот же name в другом assessment разрешён
    _mk_asset(client, a2, "shared-name")
    # тот же name в том же assessment запрещён
    res = client.post(
        f"/api/assessments/{a1}/assets",
        json={"type": "REPOSITORY", "name": "shared-name", "locator": "x"},
    )
    assert res.status_code == 409, res.text


def test_asset_rename_conflict(client: TestClient):
    assessment_id = _mk_assessment(client, "AsRename")
    _mk_asset(client, assessment_id, "first")
    other = _mk_asset(client, assessment_id, "second")
    res = client.patch(f"/api/assets/{other}", json={"name": "first"})
    assert res.status_code == 409, res.text


def test_case_title_unique_within_assessment(client: TestClient):
    assessment_id = _mk_assessment(client, "CasesUnique")
    asset_id = _mk_asset(client, assessment_id, "main")
    res = client.post(
        f"/api/assessments/{assessment_id}/cases",
        json={"title": "Login flow", "asset_id": asset_id},
    )
    assert res.status_code == 200, res.text
    res = client.post(
        f"/api/assessments/{assessment_id}/cases",
        json={"title": "Login flow", "asset_id": asset_id},
    )
    assert res.status_code == 409, res.text


def test_case_title_unique_in_different_assessment(client: TestClient):
    a1 = _mk_assessment(client, "CaseA1")
    a2 = _mk_assessment(client, "CaseA2")
    asset_a1 = _mk_asset(client, a1, "code")
    asset_a2 = _mk_asset(client, a2, "code")
    res = client.post(f"/api/assessments/{a1}/cases", json={"title": "Same", "asset_id": asset_a1})
    assert res.status_code == 200
    res = client.post(f"/api/assessments/{a2}/cases", json={"title": "Same", "asset_id": asset_a2})
    assert res.status_code == 200


def test_case_rename_conflict(client: TestClient):
    assessment_id = _mk_assessment(client, "RenameC")
    asset_id = _mk_asset(client, assessment_id, "code")
    case_a = client.post(
        f"/api/assessments/{assessment_id}/cases",
        json={"title": "Alpha", "asset_id": asset_id},
    ).json()["id"]
    case_b = client.post(
        f"/api/assessments/{assessment_id}/cases",
        json={"title": "Beta", "asset_id": asset_id},
    ).json()["id"]
    res = client.patch(f"/api/cases/{case_b}", json={"title": "Alpha"})
    assert res.status_code == 409, res.text
    # Сам себе менять имя на то же — ок (не конфликт)
    res = client.patch(f"/api/cases/{case_a}", json={"title": "Alpha"})
    assert res.status_code == 200, res.text
