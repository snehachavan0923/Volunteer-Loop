
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

# Resolve project paths.
ROOT_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT_DIR / "backend"

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

# Keep tests isolated from real services and credentials.
os.environ["MONGODB_URI"] = ""
os.environ["AUTH0_DOMAIN"] = ""
os.environ["AUTH0_API_AUDIENCE"] = ""
os.environ["BOOTSTRAP_ADMIN_SUB"] = ""
os.environ["RESEND_API_KEY"] = ""
os.environ["EMAIL_FROM"] = ""

import mongomock
import pytest
from fastapi.testclient import TestClient

from database import ensure_indexes, set_test_db
from main import app


@pytest.fixture
def mock_db():
    """Provide an isolated in-memory MongoDB database for tests."""
    client = mongomock.MongoClient()
    db = client["volunteerloop_test"]

    set_test_db(db)
    try:
        ensure_indexes()
        yield db
    finally:
        set_test_db(None)
        client.close()


@pytest.fixture
def client(mock_db):
    """Provide a test client using the mock database."""
    app.dependency_overrides.clear()
    try:
        with TestClient(app, raise_server_exceptions=False) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def student_user(mock_db):
    user = {
        "sub": "auth0|student123",
        "auth0_sub": "auth0|student123",
        "email": "student@college.edu",
        "name": "Jane Student",
        "roles": ["student"],
        "interests": ["Environment", "Education"],
        "created_at": datetime.now(timezone.utc),
    }
    mock_db.users.insert_one(user)
    return user


@pytest.fixture
def organizer_user(mock_db):
    user = {
        "sub": "auth0|organizer456",
        "auth0_sub": "auth0|organizer456",
        "email": "organizer@college.edu",
        "name": "Green Club Organizer",
        "roles": ["student", "organizer"],
        "interests": ["Environment"],
        "created_at": datetime.now(timezone.utc),
    }
    mock_db.users.insert_one(user)
    return user


@pytest.fixture
def admin_user(mock_db):
    user = {
        "sub": "auth0|admin789",
        "auth0_sub": "auth0|admin789",
        "email": "admin@college.edu",
        "name": "Platform Admin",
        "roles": ["student", "admin"],
        "interests": [],
        "created_at": datetime.now(timezone.utc),
    }
    mock_db.users.insert_one(user)
    return user