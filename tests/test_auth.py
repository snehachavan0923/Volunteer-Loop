import time
import jwt
import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from auth import current_user, require_role, TOKEN_ISSUER, TOKEN_SECRET
from main import app


def test_unauthenticated_request_rejected(client):
    res = client.get("/api/me")
    assert res.status_code == 401
    assert "log in" in res.json()["detail"].lower()


def test_signup_login_and_profile(client):
    payload = {
        "name": "Jane Student",
        "email": "jane@example.com",
        "password": "secure-pass-123",
        "role": "student",
    }
    signup = client.post("/api/auth/signup", json=payload)
    assert signup.status_code == 201
    data = signup.json()
    assert data["user"]["name"] == "Jane Student"
    assert data["user"]["roles"] == ["student"]
    assert data["access_token"]

    me = client.get("/api/me", headers={"Authorization": f"Bearer {data['access_token']}"})
    assert me.status_code == 200
    assert me.json()["email"] == "jane@example.com"
    assert me.json()["roles"] == ["student"]

    login = client.post("/api/auth/login", json={"email": "JANE@example.com", "password": "secure-pass-123"})
    assert login.status_code == 200
    assert login.json()["user"]["sub"] == data["user"]["sub"]


def test_signup_duplicate_email_rejected(client):
    payload = {"name": "Jane Student", "email": "jane@example.com", "password": "secure-pass-123", "role": "student"}
    assert client.post("/api/auth/signup", json=payload).status_code == 201
    duplicate = client.post("/api/auth/signup", json=payload)
    assert duplicate.status_code == 409


def test_wrong_password_rejected(client):
    payload = {"name": "Jane Student", "email": "jane@example.com", "password": "secure-pass-123", "role": "student"}
    client.post("/api/auth/signup", json=payload)
    response = client.post("/api/auth/login", json={"email": "jane@example.com", "password": "wrong-password"})
    assert response.status_code == 401


def test_require_role_rejects_unauthorized_roles(client, student_user):
    app.dependency_overrides[current_user] = lambda: student_user
    res = client.get("/api/admin/organizations")
    assert res.status_code == 403
    assert "permission" in res.json()["detail"].lower()
    event = client.post("/api/events", json={
        "title": "Unauthorized Event", "description": "Should fail", "location": "Quad",
        "event_date": "2030-01-01T10:00:00Z", "capacity": 10,
        "organizer_name": "Student", "category": "Community",
    })
    assert event.status_code == 403


def test_require_role_allows_authorized_role(client, admin_user):
    app.dependency_overrides[current_user] = lambda: admin_user
    res = client.get("/api/admin/organizations")
    assert res.status_code == 200
    assert isinstance(res.json(), list)


def test_profile_retrieval_and_update(client, student_user):
    app.dependency_overrides[current_user] = lambda: student_user
    res = client.get("/api/me")
    assert res.status_code == 200
    assert res.json()["sub"] == student_user["sub"]
    assert res.json()["roles"] == ["student"]
    updated = client.put("/api/me", json={"name": "Jane Updated", "interests": ["Health", "Sports"]})
    assert updated.status_code == 200
    assert updated.json()["name"] == "Jane Updated"
    assert updated.json()["interests"] == ["Health", "Sports"]


def test_expired_local_jwt_rejected(mock_db):
    token = jwt.encode({"sub": "local:expired", "iss": TOKEN_ISSUER, "iat": int(time.time()) - 7200, "exp": int(time.time()) - 3600}, TOKEN_SECRET, algorithm="HS256")
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
    with pytest.raises(HTTPException) as exc_info:
        current_user(credentials=credentials)
    assert exc_info.value.status_code == 401
    assert "invalid or expired" in exc_info.value.detail.lower()
