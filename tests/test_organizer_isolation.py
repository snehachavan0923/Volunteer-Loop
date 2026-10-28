from datetime import datetime, timedelta, timezone

from bson import ObjectId
from auth import current_user
from main import app


def _add_organization(db, user_sub, name, status="approved"):
    result = db.organizations.insert_one({
        "name": name,
        "organization_type": "Club",
        "description": f"{name} volunteering group",
        "contact_email": f"{name.lower().replace(' ', '')}@example.com",
        "contact_name": name,
        "owner_sub": user_sub,
        "status": status,
        "created_at": datetime.now(timezone.utc),
    })
    db.organization_memberships.insert_one({
        "organization_id": result.inserted_id,
        "user_sub": user_sub,
        "role": "owner",
        "status": "active",
    })
    return result.inserted_id


def _add_event(db, org_id, owner_sub, title):
    result = db.events.insert_one({
        "title": title,
        "description": f"{title} description",
        "location": "Campus",
        "event_date": datetime.now(timezone.utc) + timedelta(days=14),
        "capacity": 10,
        "reserved_count": 0,
        "organizer_name": title,
        "category": "Community",
        "organization_id": org_id,
        "created_by": owner_sub,
        "status": "published",
    })
    return result.inserted_id


def test_new_organizer_has_empty_dashboard_without_an_organization(client, mock_db):
    signup = client.post("/api/auth/signup", json={
        "name": "New Organizer",
        "email": "new-organizer@example.com",
        "password": "secure-pass-123",
        "role": "organizer",
    })
    assert signup.status_code == 201
    token = signup.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    dashboard = client.get("/api/organizer/dashboard", headers=headers)
    assert dashboard.status_code == 200
    assert dashboard.json()["status"] == "not_submitted"
    assert dashboard.json()["events"] == []

    # Public event discovery remains separate and cannot populate the dashboard.
    other_org = _add_organization(mock_db, "other-owner", "Other Club")
    _add_event(mock_db, other_org, "other-owner", "Another organizer event")
    dashboard_after_other_event = client.get("/api/organizer/dashboard", headers=headers)
    assert dashboard_after_other_event.json()["events"] == []


def test_two_organizers_only_see_and_manage_their_own_organization(client, organizer_user, mock_db):
    user_two = {
        "sub": "auth0|organizer-two",
        "auth0_sub": "auth0|organizer-two",
        "email": "organizer-two@example.com",
        "name": "Organizer Two",
        "roles": ["organizer"],
    }
    mock_db.users.insert_one(user_two)
    org_one = _add_organization(mock_db, organizer_user["sub"], "First Club")
    org_two = _add_organization(mock_db, user_two["sub"], "Second Club")
    event_one = _add_event(mock_db, org_one, organizer_user["sub"], "First Club Event")
    event_two = _add_event(mock_db, org_two, user_two["sub"], "Second Club Event")
    duty_two = mock_db.duties.insert_one({
        "event_id": event_two,
        "title": "Private duty",
        "description": "Other organizer duty",
        "capacity": 2,
        "status": "active",
    }).inserted_id

    app.dependency_overrides[current_user] = lambda: organizer_user
    first_dashboard = client.get("/api/organizer/dashboard")
    assert first_dashboard.status_code == 200
    assert [event["title"] for event in first_dashboard.json()["events"]] == ["First Club Event"]
    assert client.get(f"/api/organizer/events/{event_two}/summary").status_code == 403
    assert client.get(f"/api/events/{event_two}/registrations").status_code == 403
    assert client.get(f"/api/events/{event_two}/duties/{duty_two}/registrations").status_code == 403
    denied_update = client.delete(f"/api/events/{event_two}")
    assert denied_update.status_code == 403
    assert client.delete(f"/api/events/{event_two}/duties/{duty_two}").status_code == 403
    assert mock_db.events.find_one({"_id": event_two})["status"] == "published"

    app.dependency_overrides[current_user] = lambda: user_two
    second_dashboard = client.get("/api/organizer/dashboard")
    assert second_dashboard.status_code == 200
    assert [event["title"] for event in second_dashboard.json()["events"]] == ["Second Club Event"]
    assert client.get(f"/api/organizer/events/{event_one}/summary").status_code == 403


def test_pending_organizer_sees_pending_state_and_no_other_events(client, organizer_user, mock_db):
    other_org = _add_organization(mock_db, "another-owner", "Approved Other Club")
    _add_event(mock_db, other_org, "another-owner", "Private Other Event")
    app.dependency_overrides[current_user] = lambda: organizer_user

    application = client.post("/api/organizations", json={
        "name": "Pending Club",
        "organization_type": "Student Club",
        "description": "A club application waiting for administrator review.",
        "contact_email": "pending@example.com",
        "contact_name": "Green Club Organizer",
    })
    assert application.status_code == 201
    assert application.json()["status"] == "pending"

    dashboard = client.get("/api/organizer/dashboard")
    assert dashboard.status_code == 200
    assert dashboard.json()["status"] == "pending"
    assert dashboard.json()["events"] == []


def test_unapproved_or_unmembered_organization_cannot_access_private_data(client, organizer_user, mock_db):
    org = _add_organization(mock_db, "someone-else", "Not Their Club", status="pending")
    event_id = _add_event(mock_db, org, "someone-else", "Unapproved Event")
    app.dependency_overrides[current_user] = lambda: organizer_user

    assert client.get(f"/api/organizer/events/{event_id}/summary").status_code == 403
    assert client.get(f"/api/events/{event_id}/registrations").status_code == 403
    assert client.delete(f"/api/events/{event_id}").status_code == 403


def test_organization_creation_duplicate_remains_a_clear_client_error(client, organizer_user):
    app.dependency_overrides[current_user] = lambda: organizer_user
    payload = {
        "name": "Existing Club",
        "organization_type": "Student Club",
        "description": "An existing application that must not be duplicated.",
        "contact_email": "existing@example.com",
        "contact_name": "Organizer",
    }
    assert client.post("/api/organizations", json=payload).status_code == 201
    duplicate = client.post("/api/organizations", json=payload)
    assert duplicate.status_code == 400
    assert duplicate.json()["detail"] == "You already have an organization application."
