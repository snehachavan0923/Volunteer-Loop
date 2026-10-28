"""MongoDB Atlas connection and collection indexes for VolunteerLoop."""
import os
from functools import lru_cache
from pathlib import Path
from dotenv import load_dotenv
from pymongo import MongoClient, ASCENDING, DESCENDING
from pymongo.errors import PyMongoError

load_dotenv(Path(__file__).resolve().parent / ".env")

_override_db = None

def set_test_db(db):
    """Allows setting an in-memory/mock test database for isolated automated testing."""
    global _override_db
    _override_db = db
    get_client.cache_clear()

@lru_cache(maxsize=1)
def get_client():
    uri = os.getenv("MONGODB_URI", "").strip()
    if not uri or "<username>" in uri or "<cluster-host>" in uri:
        return None
    try:
        return MongoClient(uri, serverSelectionTimeoutMS=4000, connectTimeoutMS=4000)
    except PyMongoError:
        return None


def get_db(required=True):
    global _override_db
    if _override_db is not None:
        return _override_db
    client = get_client()
    if client is None:
        if required:
            raise RuntimeError("MongoDB is not configured. Copy backend/.env.example to backend/.env and set MONGODB_URI.")
        return None
    return client[os.getenv("MONGODB_DATABASE", "volunteerloop")]

def ensure_indexes():
    db = get_db(required=False)
    if db is None:
        return
    db.events.create_index([("event_date", ASCENDING), ("status", ASCENDING)])
    db.events.create_index([("category", ASCENDING)])
    db.events.create_index([("registration_deadline", ASCENDING)])
    db.duties.create_index([("event_id", ASCENDING)])
    db.event_registrations.create_index(
        [("event_id", ASCENDING), ("student_sub", ASCENDING)],
        unique=True,
        partialFilterExpression={"status": "active"},
        name="one_active_event_registration",
    )
    db.event_registrations.create_index([("student_sub", ASCENDING), ("status", ASCENDING)])
    db.duty_registrations.create_index(
        [("duty_id", ASCENDING), ("student_sub", ASCENDING)],
        unique=True,
        partialFilterExpression={"status": "active"},
        name="one_active_duty_registration",
    )
    db.duty_registrations.create_index([("student_sub", ASCENDING), ("status", ASCENDING)])
    db.users.create_index([("auth0_sub", ASCENDING)], unique=True)
    db.users.create_index([("email", ASCENDING)], unique=True, sparse=True)
    db.organizations.create_index([("owner_sub", ASCENDING), ("status", ASCENDING)])
    db.notifications.create_index([("user_sub", ASCENDING), ("created_at", DESCENDING)])
    db.notifications.create_index([("dedupe_key", ASCENDING)], unique=True, sparse=True)
