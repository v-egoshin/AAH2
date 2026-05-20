from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_assessment_asset_flow():
    a = client.post('/api/assessments', json={'title': 'A', 'description': 'd'})
    assert a.status_code == 200
    aid = a.json()['id']

    asset = client.post(f'/api/assessments/{aid}/assets', json={'type': 'REPOSITORY', 'name': 'r'})
    assert asset.status_code == 200


def test_candidate_batch_endpoints_exist():
    r = client.post('/api/candidates/batch-accept', json={'candidate_ids': []})
    assert r.status_code == 200
    r = client.post('/api/candidates/batch-reject', json={'candidate_ids': []})
    assert r.status_code == 200
