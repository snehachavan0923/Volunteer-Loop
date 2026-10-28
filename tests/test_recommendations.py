from datetime import datetime, timezone, timedelta
from bson import ObjectId
from auth import current_user
from main import app

def test_recommendations_filters_and_rankings(client, student_user, mock_db):
    app.dependency_overrides[current_user] = lambda: student_user
    now_utc = datetime.now(timezone.utc)

    # Student has interests: ["Environment", "Education"]
    # 1. Matching Environment event (available)
    e_env = mock_db.events.insert_one({
        "title": "Park Clean Up",
        "description": "Clean up park",
        "location": "Central Park",
        "event_date": now_utc + timedelta(days=3),
        "capacity": 20,
        "reserved_count": 0,
        "category": "Environment",
        "status": "published",
    })
    # 2. Matching Education event (full - should NOT be recommended)
    e_full = mock_db.events.insert_one({
        "title": "Full Tutoring Session",
        "description": "Tutoring session",
        "location": "Library",
        "event_date": now_utc + timedelta(days=4),
        "capacity": 5,
        "reserved_count": 5,
        "category": "Education",
        "status": "published",
    })
    # 3. Cancelled event (should NOT be recommended)
    e_canc = mock_db.events.insert_one({
        "title": "Cancelled Workshop",
        "description": "Workshop",
        "location": "Room 2",
        "event_date": now_utc + timedelta(days=5),
        "capacity": 10,
        "reserved_count": 0,
        "category": "Education",
        "status": "cancelled",
    })
    # 4. Past event (should NOT be recommended)
    e_past = mock_db.events.insert_one({
        "title": "Past Clean Up",
        "description": "Yesterday clean up",
        "location": "Central Park",
        "event_date": now_utc - timedelta(days=1),
        "capacity": 10,
        "reserved_count": 0,
        "category": "Environment",
        "status": "published",
    })
    # 5. Non-matching category (Sports)
    e_sports = mock_db.events.insert_one({
        "title": "Marathon Volunteer",
        "description": "Help marathon water stations",
        "location": "Stadium",
        "event_date": now_utc + timedelta(days=10),
        "capacity": 15,
        "reserved_count": 0,
        "category": "Sports",
        "status": "published",
    })

    res = client.get("/api/recommendations")
    assert res.status_code == 200
    recs = res.json()
    rec_ids = [r["id"] for r in recs]

    # Environment event should be recommended
    assert str(e_env.inserted_id) in rec_ids
    # Full, cancelled, and past events should NOT be in recommendations
    assert str(e_full.inserted_id) not in rec_ids
    assert str(e_canc.inserted_id) not in rec_ids
    assert str(e_past.inserted_id) not in rec_ids

    # Higher score for matched category: Environment should be first
    assert recs[0]["id"] == str(e_env.inserted_id)

    # 6. Now student registers for the Environment event: it should no longer be recommended!
    mock_db.event_registrations.insert_one({
        "event_id": e_env.inserted_id,
        "student_sub": student_user["sub"],
        "status": "active",
        "created_at": now_utc,
    })
    res_after = client.get("/api/recommendations")
    rec_ids_after = [r["id"] for r in res_after.json()]
    assert str(e_env.inserted_id) not in rec_ids_after

def test_recommendations_empty_state(client, student_user, mock_db):
    app.dependency_overrides[current_user] = lambda: student_user
    # No events in database
    res = client.get("/api/recommendations")
    assert res.status_code == 200
    assert res.json() == []
