from datetime import datetime, timezone, timedelta
from bson import ObjectId
from auth import current_user
from main import app

def _setup_event_and_duty(mock_db, organizer_sub="auth0|org1", capacity=2, duty_capacity=1, days_ahead=5, deadline_days_ahead=2):
    now_utc = datetime.now(timezone.utc)
    ev_dt = now_utc + timedelta(days=days_ahead)
    dl_dt = now_utc + timedelta(days=deadline_days_ahead) if deadline_days_ahead is not None else None

    org = mock_db.organizations.insert_one({"name": "Volunteers Inc", "owner_sub": organizer_sub, "status": "approved"})
    mock_db.organization_memberships.insert_one({
        "organization_id": org.inserted_id,
        "user_sub": organizer_sub,
        "role": "owner",
        "status": "active",
    })
    ev = mock_db.events.insert_one({
        "title": "Community Tutoring",
        "description": "Tutoring middle schoolers",
        "location": "Library",
        "event_date": ev_dt,
        "registration_deadline": dl_dt,
        "capacity": capacity,
        "reserved_count": 0,
        "organizer_name": "Volunteers Inc",
        "category": "Education",
        "organization_id": org.inserted_id,
        "created_by": organizer_sub,
        "status": "published",
    })
    duty = mock_db.duties.insert_one({
        "event_id": ev.inserted_id,
        "title": "Math Tutor",
        "description": "Grade 7 Math help",
        "capacity": duty_capacity,
        "reserved_count": 0,
        "status": "active",
        "created_at": now_utc,
    })
    return str(ev.inserted_id), str(duty.inserted_id)

def test_event_and_duty_registration_lifecycle(client, student_user, mock_db):
    event_id, duty_id = _setup_event_and_duty(mock_db)
    app.dependency_overrides[current_user] = lambda: student_user

    # 1. Duty registration fails if not registered for the event first
    duty_early = client.post(f"/api/events/{event_id}/duties/{duty_id}/register", json={})
    assert duty_early.status_code == 400
    assert "register for the event before" in duty_early.json()["detail"].lower()

    # 2. Register for event
    reg_res = client.post(f"/api/events/{event_id}/register", json={})
    assert reg_res.status_code == 201
    assert reg_res.json()["remaining_seats"] == 1
    assert reg_res.json()["registered_count"] == 1

    # 3. Duplicate event registration rejected
    dup_res = client.post(f"/api/events/{event_id}/register", json={})
    assert dup_res.status_code == 400
    assert "already registered" in dup_res.json()["detail"].lower()

    # 4. Now register for duty succeeds
    duty_reg = client.post(f"/api/events/{event_id}/duties/{duty_id}/register", json={})
    assert duty_reg.status_code == 201
    assert duty_reg.json()["remaining_openings"] == 0

    # 5. Duplicate duty registration rejected
    dup_duty = client.post(f"/api/events/{event_id}/duties/{duty_id}/register", json={})
    assert dup_duty.status_code == 400
    assert "already registered" in dup_duty.json()["detail"].lower()

    # 6. Verify student registrations endpoint
    history = client.get(f"/api/students/{student_user['sub']}/registrations").json()
    assert len(history["event_registrations"]) == 1
    assert history["event_registrations"][0]["event"]["id"] == event_id
    assert len(history["event_registrations"][0]["duty_registrations"]) == 1

    # 7. Cancel duty registration only
    duty_cancel = client.delete(f"/api/events/{event_id}/duties/{duty_id}/register/{student_user['sub']}")
    assert duty_cancel.status_code == 200
    assert duty_cancel.json()["remaining_openings"] == 1

    # Event registration remains active
    ev_active = mock_db.event_registrations.find_one({"event_id": ObjectId(event_id), "student_sub": student_user["sub"], "status": "active"})
    assert ev_active is not None

    # Re-register for duty succeeds
    re_duty = client.post(f"/api/events/{event_id}/duties/{duty_id}/register", json={})
    assert re_duty.status_code == 201

    # 8. Cancel event registration (cancels duty registration too)
    ev_cancel = client.delete(f"/api/events/{event_id}/register/{student_user['sub']}")
    assert ev_cancel.status_code == 200
    assert ev_cancel.json()["remaining_seats"] == 2
    assert ev_cancel.json()["cancelled_duty_registrations"] == 1

    # Check both registrations are cancelled in database
    ev_check = mock_db.event_registrations.find_one({"event_id": ObjectId(event_id), "student_sub": student_user["sub"]})
    assert ev_check["status"] == "cancelled"
    duty_check = mock_db.duty_registrations.find_one({"duty_id": ObjectId(duty_id), "student_sub": student_user["sub"]})
    assert duty_check["status"] == "cancelled"

    # 9. Re-registration after cancellation succeeds
    re_reg = client.post(f"/api/events/{event_id}/register", json={})
    assert re_reg.status_code == 201

def test_capacity_limits_enforced(client, mock_db):
    # Event capacity 1
    event_id, duty_id = _setup_event_and_duty(mock_db, capacity=1, duty_capacity=1)

    # First student registers
    u1 = {"sub": "auth0|u1", "auth0_sub": "auth0|u1", "name": "User 1", "roles": ["student"]}
    app.dependency_overrides[current_user] = lambda: u1
    res1 = client.post(f"/api/events/{event_id}/register", json={})
    assert res1.status_code == 201

    # Second student tries to register: event is full
    u2 = {"sub": "auth0|u2", "auth0_sub": "auth0|u2", "name": "User 2", "roles": ["student"]}
    app.dependency_overrides[current_user] = lambda: u2
    res2 = client.post(f"/api/events/{event_id}/register", json={})
    assert res2.status_code == 400
    assert "full" in res2.json()["detail"].lower()

def test_cannot_register_for_cancelled_or_expired_or_deadline_passed_events(client, student_user, mock_db):
    app.dependency_overrides[current_user] = lambda: student_user

    # 1. Past event date
    past_id, _ = _setup_event_and_duty(mock_db, days_ahead=-2)
    res_past = client.post(f"/api/events/{past_id}/register", json={})
    assert res_past.status_code == 400
    assert "already taken place" in res_past.json()["detail"].lower()

    # 2. Registration deadline passed
    dl_passed_id, _ = _setup_event_and_duty(mock_db, days_ahead=5, deadline_days_ahead=-1)
    res_dl = client.post(f"/api/events/{dl_passed_id}/register", json={})
    assert res_dl.status_code == 400
    assert "deadline" in res_dl.json()["detail"].lower()

    # 3. Cancelled event
    canc_id, _ = _setup_event_and_duty(mock_db)
    mock_db.events.update_one({"_id": ObjectId(canc_id)}, {"$set": {"status": "cancelled"}})
    res_canc = client.post(f"/api/events/{canc_id}/register", json={})
    assert res_canc.status_code == 400
    assert "cancelled" in res_canc.json()["detail"].lower()

def test_attendance_and_hours_verification(client, student_user, organizer_user, mock_db):
    event_id, duty_id = _setup_event_and_duty(mock_db, organizer_sub=organizer_user["sub"])

    # Register student
    app.dependency_overrides[current_user] = lambda: student_user
    reg = client.post(f"/api/events/{event_id}/register", json={}).json()
    reg_id = reg["registration"]["id"]

    # Organizer marks attendance and verifies 3.5 hours
    app.dependency_overrides[current_user] = lambda: organizer_user
    att_res = client.patch(
        f"/api/events/{event_id}/registrations/{reg_id}/attendance",
        json={"attended": True, "hours_verified": 3.5},
    )
    assert att_res.status_code == 200
    assert att_res.json()["registration"]["attended"] is True
    assert att_res.json()["registration"]["hours_verified"] == 3.5

    # Check notification was created for student
    notif = mock_db.notifications.find_one({"user_sub": student_user["sub"], "type": "hours_verified"})
    assert notif is not None
    assert "3.5" in notif["message"]

    # Student checks their hours
    app.dependency_overrides[current_user] = lambda: student_user
    hours_res = client.get(f"/api/students/{student_user['sub']}/hours")
    assert hours_res.status_code == 200
    data = hours_res.json()
    assert data["total_hours"] == 3.5
    assert data["events_attended"] == 1
    assert len(data["records"]) == 1
