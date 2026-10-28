from datetime import datetime, timezone, timedelta
from bson import ObjectId
from auth import current_user
from main import app

def test_event_creation_and_deadline_validation(client, organizer_user, mock_db):
    app.dependency_overrides[current_user] = lambda: organizer_user
    # Ensure organizer has an approved organization
    org = {
        "name": "Eco Club",
        "organization_type": "Club",
        "description": "Green activities",
        "contact_email": "eco@college.edu",
        "contact_name": "Eco Lead",
        "owner_sub": organizer_user["sub"],
        "status": "approved",
    }
    org_res = mock_db.organizations.insert_one(org)
    mock_db.organization_memberships.insert_one({
        "organization_id": org_res.inserted_id,
        "user_sub": organizer_user["sub"],
        "role": "owner",
        "status": "active",
    })

    future_event = datetime.now(timezone.utc) + timedelta(days=10)
    future_deadline = future_event - timedelta(days=2)
    invalid_deadline = future_event + timedelta(days=2)

    # 1. Invalid deadline after event date fails validation (422)
    res_bad = client.post("/api/events", json={
        "title": "Tree Plantation",
        "description": "Planting trees",
        "location": "North Campus",
        "event_date": future_event.isoformat(),
        "registration_deadline": invalid_deadline.isoformat(),
        "capacity": 30,
        "organizer_name": "Eco Club",
        "category": "Environment",
    })
    assert res_bad.status_code == 422

    # 2. Valid creation succeeds (201)
    res_good = client.post("/api/events", json={
        "title": "Tree Plantation",
        "description": "Planting trees",
        "location": "North Campus",
        "event_date": future_event.isoformat(),
        "registration_deadline": future_deadline.isoformat(),
        "capacity": 30,
        "organizer_name": "Eco Club",
        "category": "Environment",
    })
    assert res_good.status_code == 201
    event_data = res_good.json()
    assert event_data["title"] == "Tree Plantation"
    assert event_data["remaining_seats"] == 30
    assert event_data["is_registration_open"] is True

def test_event_update_capacity_check(client, organizer_user, student_user, mock_db):
    app.dependency_overrides[current_user] = lambda: organizer_user
    org = mock_db.organizations.insert_one({"name": "Eco Club", "owner_sub": organizer_user["sub"], "status": "approved"})
    mock_db.organization_memberships.insert_one({
        "organization_id": org.inserted_id,
        "user_sub": organizer_user["sub"],
        "role": "owner",
        "status": "active",
    })

    future_event = datetime.now(timezone.utc) + timedelta(days=5)
    created = client.post("/api/events", json={
        "title": "Food Drive",
        "description": "Collecting food for shelter",
        "location": "Dining Hall",
        "event_date": future_event.isoformat(),
        "capacity": 10,
        "organizer_name": "Eco Club",
        "category": "Community",
    }).json()
    event_id = created["id"]

    # Register 2 students
    mock_db.event_registrations.insert_one({
        "event_id": ObjectId(event_id),
        "student_sub": "auth0|stu1",
        "student_name": "Student 1",
        "status": "active",
        "created_at": datetime.now(timezone.utc),
    })
    mock_db.event_registrations.insert_one({
        "event_id": ObjectId(event_id),
        "student_sub": "auth0|stu2",
        "student_name": "Student 2",
        "status": "active",
        "created_at": datetime.now(timezone.utc),
    })

    # Capacity cannot be lower than active count (2)
    bad_update = client.put(f"/api/events/{event_id}", json={
        "title": "Food Drive",
        "description": "Collecting food for shelter",
        "location": "Dining Hall",
        "event_date": future_event.isoformat(),
        "capacity": 1,
        "organizer_name": "Eco Club",
        "category": "Community",
    })
    assert bad_update.status_code == 400
    assert "lower than active registrations (2)" in bad_update.json()["detail"]

    # Capacity at or above active count succeeds
    good_update = client.put(f"/api/events/{event_id}", json={
        "title": "Food Drive Updated",
        "description": "Collecting food for shelter",
        "location": "Dining Hall",
        "event_date": future_event.isoformat(),
        "capacity": 25,
        "organizer_name": "Eco Club",
        "category": "Community",
    })
    assert good_update.status_code == 200
    assert good_update.json()["capacity"] == 25
    assert good_update.json()["remaining_seats"] == 23

def test_duties_management_and_validation(client, organizer_user, mock_db):
    app.dependency_overrides[current_user] = lambda: organizer_user
    org = mock_db.organizations.insert_one({"name": "Eco Club", "owner_sub": organizer_user["sub"], "status": "approved"})
    mock_db.organization_memberships.insert_one({
        "organization_id": org.inserted_id,
        "user_sub": organizer_user["sub"],
        "role": "owner",
        "status": "active",
    })

    future_event = datetime.now(timezone.utc) + timedelta(days=5)
    ev = client.post("/api/events", json={
        "title": "Science Fair",
        "description": "Annual fair",
        "location": "Hall A",
        "event_date": future_event.isoformat(),
        "capacity": 50,
        "organizer_name": "Eco Club",
        "category": "Education",
    }).json()
    event_id = ev["id"]

    start = future_event + timedelta(hours=1)
    end = future_event + timedelta(hours=3)

    # 1. Invalid duty times (end before start)
    res_bad = client.post(f"/api/events/{event_id}/duties", json={
        "title": "Registration Desk",
        "description": "Checking attendees in",
        "capacity": 5,
        "start_time": end.isoformat(),
        "end_time": start.isoformat(),
    })
    assert res_bad.status_code == 422

    # 2. Valid duty creation
    res_good = client.post(f"/api/events/{event_id}/duties", json={
        "title": "Registration Desk",
        "description": "Checking attendees in",
        "capacity": 5,
        "start_time": start.isoformat(),
        "end_time": end.isoformat(),
    })
    assert res_good.status_code == 201
    duty = res_good.json()
    assert duty["title"] == "Registration Desk"
    assert duty["remaining_openings"] == 5

    # 3. List duties
    duties_list = client.get(f"/api/events/{event_id}/duties").json()
    assert len(duties_list) == 1
    assert duties_list[0]["id"] == duty["id"]

    # 4. Delete duty
    del_res = client.delete(f"/api/events/{event_id}/duties/{duty['id']}")
    assert del_res.status_code == 204

    # Now duties list should be empty
    assert len(client.get(f"/api/events/{event_id}/duties").json()) == 0

def test_unauthorized_organizer_cannot_modify_other_orgs_events(client, organizer_user, mock_db):
    # Event owned by Org A
    org_a = mock_db.organizations.insert_one({"name": "Org A", "owner_sub": "auth0|other_owner", "status": "approved"})
    ev = mock_db.events.insert_one({
        "title": "Org A Event",
        "description": "Description",
        "location": "Room 101",
        "event_date": datetime.now(timezone.utc) + timedelta(days=7),
        "capacity": 20,
        "organizer_name": "Org A",
        "category": "Education",
        "organization_id": org_a.inserted_id,
        "created_by": "auth0|other_owner",
        "status": "published",
    })
    event_id = str(ev.inserted_id)

    # User organizer_user does NOT belong to Org A
    app.dependency_overrides[current_user] = lambda: organizer_user
    res = client.put(f"/api/events/{event_id}", json={
        "title": "Hacked Title",
        "description": "Description",
        "location": "Room 101",
        "event_date": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
        "capacity": 20,
        "organizer_name": "Org A",
        "category": "Education",
    })
    assert res.status_code == 403

    del_res = client.delete(f"/api/events/{event_id}")
    assert del_res.status_code == 403
