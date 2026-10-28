from fastapi.testclient import TestClient
from main import app

client = TestClient(app, raise_server_exceptions=False)

def test_health_does_not_require_external_credentials():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] in {"ok", "degraded"}

def test_event_listing_requires_database_configuration():
    response = client.get("/api/events")
    assert response.status_code == 500
    assert response.json()["detail"] == "Internal server error. Check backend logs for configuration details."

def test_protected_endpoint_requires_authentication():
    response = client.get("/api/me")
    assert response.status_code == 401
