from auth import current_user
from main import app

def test_student_can_apply_for_organization(client, student_user, mock_db):
    app.dependency_overrides[current_user] = lambda: student_user

    payload = {
        "name": "Robotics Club",
        "organization_type": "Student Club",
        "description": "Building competitive robots and mentoring freshmen.",
        "contact_email": "robotics@college.edu",
        "contact_name": "Jane Student",
    }
    res = client.post("/api/organizations", json=payload)
    assert res.status_code == 201
    data = res.json()
    assert data["name"] == "Robotics Club"
    assert data["status"] == "pending"
    assert data["owner_sub"] == student_user["sub"]

    # Prevent duplicate pending application
    dup_res = client.post("/api/organizations", json=payload)
    assert dup_res.status_code == 400
    assert "already have an organization application" in dup_res.json()["detail"]

def test_admin_approval_and_rejection_workflow(client, student_user, admin_user, mock_db):
    # 1. Student applies
    app.dependency_overrides[current_user] = lambda: student_user
    app_res = client.post("/api/organizations", json={
        "name": "Environmental Society",
        "organization_type": "NGO",
        "description": "Campus sustainability projects and recycling drives.",
        "contact_email": "eco@college.edu",
        "contact_name": "Jane Student",
    })
    assert app_res.status_code == 201
    org_id = app_res.json()["id"]

    # 2. Student cannot publish event before approval
    event_res = client.post("/api/events", json={
        "title": "Clean Up Event",
        "description": "Cleaning campus",
        "location": "Quad",
        "event_date": "2030-05-01T10:00:00Z",
        "capacity": 20,
        "organizer_name": "Environmental Society",
        "category": "Environment",
    })
    assert event_res.status_code == 403

    # 3. Admin lists pending organizations
    app.dependency_overrides[current_user] = lambda: admin_user
    pending_res = client.get("/api/admin/organizations")
    assert pending_res.status_code == 200
    pending_list = pending_res.json()
    assert any(o["id"] == org_id for o in pending_list)

    # 4. Admin approves organization
    decide_res = client.post(f"/api/admin/organizations/{org_id}/decision?decision=approve")
    assert decide_res.status_code == 200
    assert decide_res.json()["status"] == "approved"

    # Check that owner received organizer role
    updated_user = mock_db.users.find_one({"auth0_sub": student_user["sub"]})
    assert "organizer" in updated_user["roles"]

    # Check notification was generated for student
    notif = mock_db.notifications.find_one({"user_sub": student_user["sub"], "type": "organization_approved"})
    assert notif is not None
    assert "approved" in notif["title"].lower()

    # 5. Now student (as approved organizer) can publish event
    student_user["roles"].append("organizer")
    app.dependency_overrides[current_user] = lambda: student_user
    publish_res = client.post("/api/events", json={
        "title": "Campus Clean Up Drive",
        "description": "Cleaning campus lawns and pathways.",
        "location": "Main Lawn",
        "event_date": "2030-05-01T10:00:00Z",
        "capacity": 20,
        "organizer_name": "Environmental Society",
        "category": "Environment",
    })
    assert publish_res.status_code == 201
    assert publish_res.json()["title"] == "Campus Clean Up Drive"

def test_admin_rejection_workflow(client, student_user, admin_user, mock_db):
    app.dependency_overrides[current_user] = lambda: student_user
    app_res = client.post("/api/organizations", json={
        "name": "Spam Club",
        "organization_type": "Unknown",
        "description": "Just testing the system with spam description.",
        "contact_email": "spam@example.com",
        "contact_name": "Spammer",
    })
    assert app_res.status_code == 201
    org_id = app_res.json()["id"]

    # Admin rejects
    app.dependency_overrides[current_user] = lambda: admin_user
    decide_res = client.post(f"/api/admin/organizations/{org_id}/decision?decision=reject")
    assert decide_res.status_code == 200
    assert decide_res.json()["status"] == "rejected"

    # Student did not receive organizer role
    updated_user = mock_db.users.find_one({"auth0_sub": student_user["sub"]})
    assert "organizer" not in updated_user.get("roles", [])

    # Student received rejection notification
    notif = mock_db.notifications.find_one({"user_sub": student_user["sub"], "type": "organization_rejected"})
    assert notif is not None
