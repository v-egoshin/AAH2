from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_batch_accept_reject_mixed():
    r = client.post('/api/candidates/batch-accept', json={'candidate_ids': ['00000000-0000-0000-0000-000000000000']})
    assert r.status_code == 200
    assert r.json()['results'][0]['status'] == 'ERROR'

    r = client.post('/api/candidates/batch-reject', json={'candidate_ids': ['00000000-0000-0000-0000-000000000000']})
    assert r.status_code == 200
    assert r.json()['results'][0]['status'] == 'ERROR'
