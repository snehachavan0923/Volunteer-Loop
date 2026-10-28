from datetime import datetime, timezone, timedelta
from bson import ObjectId
from auth import current_user
from main import app, create_reminders

def test_notification_endpoints(client, student_user, mock_db):
    app.dependency_overrides[current_user] = lambda: student_user

    # Insert 2 test notifications
    n1 = mock_db.notifications.insert_one({
        "user_sub": student_user["sub"],
        "title": "Welcome",
        "message": "Welcome to VolunteerLoop!",
        "type": "system",
        "read": False,
        "created_at": datetime.now(timezone.utc),
    })
    n2 = mock_db.notifications.insert_one({
        "user_sub": student_user["sub"],
        "title": "Reminder",
        "message": "Don't forget your duty tomorrow",
        "type": "duty_reminder",
        "read": False,
        "created_at": datetime.now(timezone.utc),
    })

    # 1. Unread count should be 2
    count_res = client.get("/api/notifications/unread-count")
    assert count_res.status_code == 200
    assert count_res.json()["unread_count"] == 2

    # 2. List notifications
    list_res = client.get("/api/notifications")
    assert list_res.status_code == 200
    assert len(list_res.json()) == 2

    # 3. Mark single notification as read
    read_one = client.post(f"/api/notifications/{n1.inserted_id}/read")
    assert read_one.status_code == 200
    assert read_one.json()["ok"] is True

    # Unread count should now be 1
    assert client.get("/api/notifications/unread-count").json()["unread_count"] == 1

    # 4. Mark all as read
    read_all = client.post("/api/notifications/read-all")
    assert read_all.status_code == 200
    assert read_all.json()["marked_count"] == 1

    # Unread count should now be 0
    assert client.get("/api/notifications/unread-count").json()["unread_count"] == 0

def test_create_reminders_scheduler_and_deduplication(mock_db):
    now_utc = datetime.now(timezone.utc)
    target_time = now_utc + timedelta(hours=24) # In the 23-25h window

    # 1. Event 24h away with registered student
    ev = mock_db.events.insert_one({
        "title": "Riverside Cleanup",
        "location": "Riverside Park",
        "event_date": target_time,
        "category": "Environment",
        "status": "published",
    })
    mock_db.event_registrations.insert_one({
        "event_id": ev.inserted_id,
        "student_sub": "auth0|student123",
        "status": "active",
        "created_at": now_utc,
    })

    # 2. Duty 24h away
    duty = mock_db.duties.insert_one({
        "event_id": ev.inserted_id,
        "title": "Trash Sorter",
        "start_time": target_time,
        "status": "active",
        "created_at": now_utc,
    })
    mock_db.duty_registrations.insert_one({
        "event_id": ev.inserted_id,
        "duty_id": duty.inserted_id,
        "student_sub": "auth0|student123",
        "status": "active",
        "created_at": now_utc,
    })

    # 3. Event with deadline 24h away
    ev_dl = mock_db.events.insert_one({
        "title": "Hospital Volunteering",
        "event_date": now_utc + timedelta(days=5),
        "registration_deadline": target_time,
        "category": "Health",
        "status": "published",
    })
    mock_db.users.insert_one({
        "auth0_sub": "auth0|student456",
        "email": "stu456@college.edu",
        "name": "Alex Student",
        "interests": ["Health"],
        "roles": ["student"],
    })

    # Run reminder process first time
    create_reminders()

    # Verify event reminder created
    notif_ev = mock_db.notifications.find_one({"type": "event_reminder", "user_sub": "auth0|student123"})
    assert notif_ev is not None
    assert "Riverside Cleanup" in notif_ev["message"]

    # Verify duty reminder created
    notif_duty = mock_db.notifications.find_one({"type": "duty_reminder", "user_sub": "auth0|student123"})
    assert notif_duty is not None
    assert "Trash Sorter" in notif_duty["message"]

    # Verify registration deadline reminder created
    notif_dl = mock_db.notifications.find_one({"type": "registration_deadline", "user_sub": "auth0|student456"})
    assert notif_dl is not None
    assert "Hospital Volunteering" in notif_dl["message"]

    total_notifs = mock_db.notifications.count_documents({})

    # Run reminder process second time: deduplication MUST prevent new notifications!
    create_reminders()
    assert mock_db.notifications.count_documents({}) == total_notifs
