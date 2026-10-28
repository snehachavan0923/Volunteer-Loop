"""MongoDB-backed VolunteerLoop API. Public reads; authenticated writes."""
import logging
import os
import re
from datetime import datetime, timezone
from bson import ObjectId
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError, PyMongoError
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field, model_validator
from database import get_db
from auth import current_user, require_role
from email_service import send_email

logger = logging.getLogger("volunteerloop.api")
router = APIRouter()

def now():
    return datetime.now(timezone.utc)

def ensure_utc(dt):
    if dt is None:
        return None
    if isinstance(dt, datetime):
        if dt.tzinfo is None:
            return dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    return dt

def oid(value):
    try:
        return ObjectId(value)
    except Exception:
        raise HTTPException(404, "Item not found.")

def clean(doc):
    if not doc:
        return doc
    out = dict(doc)
    out["id"] = str(out.pop("_id", ""))
    for k, v in list(out.items()):
        if isinstance(v, ObjectId):
            out[k] = str(v)
        elif isinstance(v, datetime):
            out[k] = v.isoformat().replace("+00:00", "Z")
    return out

def active_count(db, collection, query):
    return collection.count_documents({**query, "status": "active"})

def is_event_open_for_registration(e):
    if e.get("status") == "cancelled":
        return False, "This event has been cancelled."
    event_dt = ensure_utc(e.get("event_date"))
    if isinstance(event_dt, datetime) and event_dt < now():
        return False, "This event has already taken place."
    deadline = ensure_utc(e.get("registration_deadline"))
    if isinstance(deadline, datetime) and deadline < now():
        return False, "The registration deadline for this event has passed."
    return True, ""

def event_out(db, e):
    if not e:
        raise HTTPException(404, "Event not found.")
    count = max(e.get("reserved_count", 0), active_count(db, db.event_registrations, {"event_id": e["_id"]}))
    x = clean(e)
    is_open, _ = is_event_open_for_registration(e)
    rem = max(0, e["capacity"] - count)
    x.update(
        registered_count=count,
        remaining_seats=rem,
        is_registration_open=(is_open and rem > 0),
    )
    return x

def duty_out(db, d):
    if not d:
        raise HTTPException(404, "Duty not found.")
    count = max(d.get("reserved_count", 0), active_count(db, db.duty_registrations, {"duty_id": d["_id"]}))
    x = clean(d)
    rem = max(0, d["capacity"] - count)
    is_open = d.get("status") != "cancelled" and rem > 0
    start = ensure_utc(d.get("start_time"))
    if start and isinstance(start, datetime) and start < now():
        is_open = False
    x.update(
        registered_count=count,
        remaining_openings=rem,
        is_registration_open=is_open,
    )
    return x

def require_event(db, event_id):
    e = db.events.find_one({"_id": oid(event_id)})
    if not e:
        raise HTTPException(404, "Event not found.")
    return e

def require_duty(db, event_id, duty_id):
    d = db.duties.find_one({"_id": oid(duty_id), "event_id": oid(event_id)})
    if not d:
        raise HTTPException(404, "Duty not found.")
    return d

def org_allowed(db, user, event):
    if "admin" in user.get("roles", []):
        return
    org_id = event.get("organization_id")
    if not org_id:
        raise HTTPException(403, "You do not have permission to manage this event.")
    organization = db.organizations.find_one({"_id": org_id, "status": "approved"})
    membership = db.organization_memberships.find_one({
        "organization_id": org_id,
        "user_sub": user["sub"],
        "status": "active",
        "role": {"$in": ["owner", "organizer"]},
    })
    if not organization or not membership:
        raise HTTPException(403, "Only an organizer of this organization can manage this event.")

def authorized_organization_ids(db, user):
    memberships = db.organization_memberships.find({
        "user_sub": user["sub"],
        "status": "active",
        "role": {"$in": ["owner", "organizer"]},
    })
    membership_ids = [membership["organization_id"] for membership in memberships]
    if not membership_ids:
        return []
    return [org["_id"] for org in db.organizations.find({
        "_id": {"$in": membership_ids},
        "status": "approved",
    })]

# --- Request / Response Models ---

class EventPayload(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=5000)
    location: str = Field(min_length=1, max_length=200)
    event_date: datetime
    registration_deadline: datetime | None = None
    capacity: int = Field(gt=0, le=100000)
    organizer_name: str = Field(min_length=1, max_length=100)
    category: str = Field(min_length=1, max_length=50)

    @model_validator(mode="after")
    def check_dates(self):
        ed = ensure_utc(self.event_date)
        rd = ensure_utc(self.registration_deadline)
        if rd and rd > ed:
            raise ValueError("Registration deadline must be on or before the event date.")
        return self

class DutyPayload(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=5000)
    capacity: int = Field(gt=0, le=10000)
    start_time: datetime | None = None
    end_time: datetime | None = None

    @model_validator(mode="after")
    def check_times(self):
        st = ensure_utc(self.start_time)
        et = ensure_utc(self.end_time)
        if st and et and et <= st:
            raise ValueError("end_time must be after start_time")
        return self

class ProfilePayload(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    interests: list[str] = Field(default_factory=list)

class OrganizationPayload(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    organization_type: str = Field(min_length=2, max_length=80)
    description: str = Field(min_length=10, max_length=2000)
    contact_email: str = Field(min_length=3, max_length=254)
    contact_name: str = Field(min_length=1, max_length=100)

class RegistrationPayload(BaseModel):
    student_id: str | None = None
    student_name: str | None = None

class AttendancePayload(BaseModel):
    attended: bool = True
    hours_verified: float = Field(ge=0.0, le=100.0, default=0.0)

# --- Health Check ---

@router.get("/health")
def health():
    db = get_db(required=False)
    if db is None:
        return {
            "status": "ok",
            "database": "not_configured",
            "auth": "configured" if os.getenv("AUTH0_DOMAIN") and os.getenv("AUTH0_API_AUDIENCE") else "not_configured",
        }
    try:
        db.command("ping")
        return {"status": "ok", "database": "connected"}
    except Exception:
        return {"status": "degraded", "database": "unavailable"}

# --- Events Endpoints ---

@router.get("/api/events")
def list_events(q: str | None = None, category: str | None = None, include_past: bool = False):
    db = get_db()
    query = {"status": {"$ne": "cancelled"}}
    if not include_past:
        query["event_date"] = {"$gte": now()}
    if q and q.strip():
        query["$or"] = [{k: {"$regex": re.escape(q.strip()), "$options": "i"}} for k in ("title", "description", "location", "organizer_name")]
    if category and category.strip():
        query["category"] = {"$regex": f"^{re.escape(category.strip())}$", "$options": "i"}
    return [event_out(db, e) for e in db.events.find(query).sort("event_date", 1)]

@router.get("/api/events/categories")
def categories():
    return sorted([x for x in get_db().events.distinct("category", {"status": {"$ne": "cancelled"}}) if x], key=str.lower)

@router.get("/api/events/{event_id}")
def get_event(event_id: str):
    return event_out(get_db(), require_event(get_db(), event_id))

@router.post("/api/events", status_code=201)
def create_event(payload: EventPayload, user=Depends(require_role("organizer", "admin"))):
    db = get_db()
    org = None
    if "admin" not in user.get("roles", []):
        owned_organizations = list(db.organizations.find({"owner_sub": user["sub"], "status": "approved"}))
        authorized_ids = set(authorized_organization_ids(db, user))
        owned_organizations = [item for item in owned_organizations if item["_id"] in authorized_ids]
        if not owned_organizations:
            raise HTTPException(403, "Your organization must be approved before publishing events.")
        if len(owned_organizations) > 1:
            raise HTTPException(409, "More than one approved organization is associated with this account. Contact an administrator.")
        org = owned_organizations[0]
    doc = payload.model_dump()
    doc.update(
        status="published",
        organization_id=org["_id"] if org else None,
        created_by=user["sub"],
        created_at=now(),
        updated_at=now(),
    )
    result = db.events.insert_one(doc)
    return event_out(db, db.events.find_one({"_id": result.inserted_id}))

@router.put("/api/events/{event_id}")
def update_event(event_id: str, payload: EventPayload, user=Depends(require_role("organizer", "admin"))):
    db = get_db()
    e = require_event(db, event_id)
    org_allowed(db, user, e)
    count = active_count(db, db.event_registrations, {"event_id": e["_id"]})
    if payload.capacity < count:
        raise HTTPException(400, f"Capacity cannot be lower than active registrations ({count}).")
    changed_at = now()
    db.events.update_one(
        {"_id": e["_id"]},
        {"$set": {**payload.model_dump(), "reserved_count": count, "updated_at": changed_at}},
    )
    for reg in db.event_registrations.find({"event_id": e["_id"], "status": "active"}):
        key = f"event-updated:{event_id}:{reg['student_sub']}:{changed_at.isoformat()}"
        db.notifications.update_one(
            {"dedupe_key": key},
            {"$setOnInsert": {
                "user_sub": reg["student_sub"],
                "type": "event_updated",
                "title": "Event details updated",
                "message": f"Details for {payload.title} changed. Please review the event page before attending.",
                "event_id": event_id,
                "created_at": changed_at,
                "read": False,
                "dedupe_key": key,
            }},
            upsert=True,
        )
    return event_out(db, require_event(db, event_id))

@router.delete("/api/events/{event_id}")
def delete_event(event_id: str, force: bool = False, user=Depends(require_role("organizer", "admin"))):
    db = get_db()
    e = require_event(db, event_id)
    org_allowed(db, user, e)
    cancel_time = now()
    db.events.update_one({"_id": e["_id"]}, {"$set": {"status": "cancelled", "updated_at": cancel_time}})
    # Mark associated duties as cancelled too
    db.duties.update_many({"event_id": e["_id"], "status": {"$ne": "cancelled"}}, {"$set": {"status": "cancelled", "updated_at": cancel_time}})
    regs = list(db.event_registrations.find({"event_id": e["_id"], "status": "active"}))
    db.event_registrations.update_many({"event_id": e["_id"], "status": "active"}, {"$set": {"status": "cancelled", "updated_at": cancel_time}})
    db.duty_registrations.update_many({"event_id": e["_id"], "status": "active"}, {"$set": {"status": "cancelled", "updated_at": cancel_time}})
    for r in regs:
        key = f"event-cancel:{event_id}:{r['student_sub']}"
        db.notifications.update_one(
            {"dedupe_key": key},
            {"$setOnInsert": {
                "user_sub": r["student_sub"],
                "type": "event_cancelled",
                "title": "Event cancelled",
                "message": f'{e["title"]} has been cancelled by the organizer.',
                "event_id": event_id,
                "created_at": cancel_time,
                "read": False,
                "dedupe_key": key,
            }},
            upsert=True,
        )
    return Response(status_code=204)

# --- Duties Endpoints ---

@router.get("/api/events/{event_id}/duties")
def list_duties(event_id: str):
    db = get_db()
    e = require_event(db, event_id)
    return [duty_out(db, d) for d in db.duties.find({"event_id": e["_id"], "status": {"$ne": "cancelled"}}).sort("created_at", 1)]

@router.post("/api/events/{event_id}/duties", status_code=201)
def create_duty(event_id: str, payload: DutyPayload, user=Depends(require_role("organizer", "admin"))):
    db = get_db()
    e = require_event(db, event_id)
    org_allowed(db, user, e)
    doc = payload.model_dump()
    doc.update(event_id=e["_id"], status="active", created_at=now(), updated_at=now())
    result = db.duties.insert_one(doc)
    return duty_out(db, db.duties.find_one({"_id": result.inserted_id}))

@router.put("/api/events/{event_id}/duties/{duty_id}")
def update_duty(event_id: str, duty_id: str, payload: DutyPayload, user=Depends(require_role("organizer", "admin"))):
    db = get_db()
    e = require_event(db, event_id)
    org_allowed(db, user, e)
    d = require_duty(db, event_id, duty_id)
    count = active_count(db, db.duty_registrations, {"duty_id": d["_id"]})
    if payload.capacity < count:
        raise HTTPException(400, f"Capacity cannot be lower than active registrations ({count}).")
    db.duties.update_one({"_id": d["_id"]}, {"$set": {**payload.model_dump(), "reserved_count": count, "updated_at": now()}})
    return duty_out(db, db.duties.find_one({"_id": d["_id"]}))

@router.delete("/api/events/{event_id}/duties/{duty_id}", status_code=204)
def delete_duty(event_id: str, duty_id: str, force: bool = False, user=Depends(require_role("organizer", "admin"))):
    db = get_db()
    e = require_event(db, event_id)
    org_allowed(db, user, e)
    d = require_duty(db, event_id, duty_id)
    db.duties.update_one({"_id": d["_id"]}, {"$set": {"status": "cancelled", "updated_at": now()}})
    db.duty_registrations.update_many({"duty_id": d["_id"], "status": "active"}, {"$set": {"status": "cancelled", "updated_at": now()}})
    return Response(status_code=204)

# --- Registration Endpoints ---

@router.get("/api/events/{event_id}/registrations")
def event_registrations(event_id: str, include_cancelled: bool = False, user=Depends(require_role("organizer", "admin"))):
    db = get_db()
    e = require_event(db, event_id)
    org_allowed(db, user, e)
    q = {"event_id": e["_id"]}
    if not include_cancelled:
        q["status"] = "active"
    return [{k: v for k, v in clean(x).items() if k not in ("student_sub",)} for x in db.event_registrations.find(q).sort("created_at", 1)]

@router.post("/api/events/{event_id}/register", status_code=201)
def register_event(event_id: str, payload: RegistrationPayload, user=Depends(current_user)):
    db = get_db()
    e = require_event(db, event_id)
    sub = user["sub"]

    # Validate open registration
    is_open, reason = is_event_open_for_registration(e)
    if not is_open:
        raise HTTPException(400, reason)

    # Check for existing active registration
    if db.event_registrations.find_one({"event_id": e["_id"], "student_sub": sub, "status": "active"}):
        raise HTTPException(400, "You are already registered for this event.")

    # Atomic capacity reservation
    reserved = db.events.find_one_and_update(
        {
            "_id": e["_id"],
            "status": "published",
            "$expr": {"$lt": [{"$ifNull": ["$reserved_count", 0]}, "$capacity"]},
        },
        {"$inc": {"reserved_count": 1}},
        return_document=ReturnDocument.AFTER,
    )
    if not reserved:
        raise HTTPException(400, "This event is full. No seats are left.")

    doc = {
        "event_id": e["_id"],
        "student_sub": sub,
        "student_id": sub,
        "student_name": user.get("name") or payload.student_name or "Volunteer",
        "student_email": user.get("email"),
        "status": "active",
        "attended": False,
        "hours_verified": 0.0,
        "created_at": now(),
        "updated_at": now(),
    }
    try:
        result = db.event_registrations.insert_one(doc)
    except DuplicateKeyError:
        db.events.update_one({"_id": e["_id"]}, {"$inc": {"reserved_count": -1}})
        raise HTTPException(400, "You are already registered for this event.")
    except Exception:
        db.events.update_one({"_id": e["_id"]}, {"$inc": {"reserved_count": -1}})
        raise

    reg = clean(db.event_registrations.find_one({"_id": result.inserted_id}))
    count = active_count(db, db.event_registrations, {"event_id": e["_id"]})

    # Optional confirmation email
    if user.get("email"):
        send_email(
            user["email"],
            f"Registration Confirmed: {e['title']}",
            f"<p>Hi {reg.get('student_name', 'Volunteer')},</p><p>You are successfully registered for <strong>{e['title']}</strong> at {e.get('location', '')}.</p>",
        )

    return {
        "message": "Registration confirmed.",
        "registration": reg,
        "registered_count": count,
        "remaining_seats": max(0, e["capacity"] - count),
    }

@router.delete("/api/events/{event_id}/register/{student_id}")
def cancel_event(event_id: str, student_id: str, user=Depends(current_user)):
    db = get_db()
    e = require_event(db, event_id)
    if student_id not in (user["sub"], user.get("email")) and "admin" not in user.get("roles", []):
        raise HTTPException(403, "You can only cancel your own registration.")

    r = db.event_registrations.find_one({"event_id": e["_id"], "student_sub": user["sub"], "status": "active"})
    if not r:
        raise HTTPException(404, "Active registration not found.")

    changed = db.event_registrations.update_one({"_id": r["_id"], "status": "active"}, {"$set": {"status": "cancelled", "updated_at": now()}})
    if changed.modified_count:
        db.events.update_one({"_id": e["_id"]}, {"$inc": {"reserved_count": -1}})

    active_duties = list(db.duty_registrations.find({"event_id": e["_id"], "student_sub": user["sub"], "status": "active"}))
    db.duty_registrations.update_many({"event_id": e["_id"], "student_sub": user["sub"], "status": "active"}, {"$set": {"status": "cancelled", "updated_at": now()}})
    for dr in active_duties:
        db.duties.update_one({"_id": dr["duty_id"]}, {"$inc": {"reserved_count": -1}})

    count = active_count(db, db.event_registrations, {"event_id": e["_id"]})
    return {
        "message": "Registration cancelled.",
        "registration": clean(db.event_registrations.find_one({"_id": r["_id"]})),
        "registered_count": count,
        "remaining_seats": max(0, e["capacity"] - count),
        "cancelled_duty_registrations": len(active_duties),
    }

@router.get("/api/events/{event_id}/duties/{duty_id}/registrations")
def duty_regs(event_id: str, duty_id: str, user=Depends(require_role("organizer", "admin"))):
    db = get_db()
    e = require_event(db, event_id)
    org_allowed(db, user, e)
    d = require_duty(db, event_id, duty_id)
    return [clean(x) for x in db.duty_registrations.find({"duty_id": d["_id"], "status": "active"}).sort("created_at", 1)]

@router.post("/api/events/{event_id}/duties/{duty_id}/register", status_code=201)
def register_duty(event_id: str, duty_id: str, payload: RegistrationPayload, user=Depends(current_user)):
    db = get_db()
    e = require_event(db, event_id)
    d = require_duty(db, event_id, duty_id)
    sub = user["sub"]

    is_open, reason = is_event_open_for_registration(e)
    if not is_open:
        raise HTTPException(400, reason)
    if d.get("status") == "cancelled":
        raise HTTPException(400, "This duty has been cancelled.")
    duty_start = ensure_utc(d.get("start_time"))
    if duty_start and isinstance(duty_start, datetime) and duty_start < now():
        raise HTTPException(400, "This duty is already in the past.")

    if not db.event_registrations.find_one({"event_id": e["_id"], "student_sub": sub, "status": "active"}):
        raise HTTPException(400, "You must register for the event before registering for one of its duties.")
    if db.duty_registrations.find_one({"duty_id": d["_id"], "student_sub": sub, "status": "active"}):
        raise HTTPException(400, "You are already registered for this duty.")

    reserved = db.duties.find_one_and_update(
        {
            "_id": d["_id"],
            "status": "active",
            "$expr": {"$lt": [{"$ifNull": ["$reserved_count", 0]}, "$capacity"]},
        },
        {"$inc": {"reserved_count": 1}},
        return_document=ReturnDocument.AFTER,
    )
    if not reserved:
        raise HTTPException(400, "This duty is full. No openings are left.")

    doc = {
        "event_id": e["_id"],
        "duty_id": d["_id"],
        "student_sub": sub,
        "student_id": sub,
        "student_name": user.get("name") or payload.student_name or "Volunteer",
        "student_email": user.get("email"),
        "status": "active",
        "attended": False,
        "hours_verified": 0.0,
        "created_at": now(),
        "updated_at": now(),
    }
    try:
        result = db.duty_registrations.insert_one(doc)
    except DuplicateKeyError:
        db.duties.update_one({"_id": d["_id"]}, {"$inc": {"reserved_count": -1}})
        raise HTTPException(400, "You are already registered for this duty.")
    except Exception:
        db.duties.update_one({"_id": d["_id"]}, {"$inc": {"reserved_count": -1}})
        raise

    reg = clean(db.duty_registrations.find_one({"_id": result.inserted_id}))
    count = active_count(db, db.duty_registrations, {"duty_id": d["_id"]})
    return {
        "message": "Duty registration confirmed.",
        "registration": reg,
        "registered_count": count,
        "remaining_openings": max(0, d["capacity"] - count),
    }

@router.delete("/api/events/{event_id}/duties/{duty_id}/register/{student_id}")
def cancel_duty(event_id: str, duty_id: str, student_id: str, user=Depends(current_user)):
    db = get_db()
    e = require_event(db, event_id)
    d = require_duty(db, event_id, duty_id)
    if student_id not in (user["sub"], user.get("email")) and "admin" not in user.get("roles", []):
        raise HTTPException(403, "You can only cancel your own registration.")

    r = db.duty_registrations.find_one({"duty_id": d["_id"], "student_sub": user["sub"], "status": "active"})
    if not r:
        raise HTTPException(404, "Active duty registration not found.")

    changed = db.duty_registrations.update_one({"_id": r["_id"], "status": "active"}, {"$set": {"status": "cancelled", "updated_at": now()}})
    if changed.modified_count:
        db.duties.update_one({"_id": d["_id"]}, {"$inc": {"reserved_count": -1}})

    count = active_count(db, db.duty_registrations, {"duty_id": d["_id"]})
    return {
        "message": "Duty registration cancelled.",
        "registration": clean(db.duty_registrations.find_one({"_id": r["_id"]})),
        "registered_count": count,
        "remaining_openings": max(0, d["capacity"] - count),
    }

# --- Attendance & Verified Hours ---

@router.patch("/api/events/{event_id}/registrations/{registration_id}/attendance")
def set_event_attendance(event_id: str, registration_id: str, payload: AttendancePayload, user=Depends(require_role("organizer", "admin"))):
    db = get_db()
    e = require_event(db, event_id)
    org_allowed(db, user, e)
    reg_oid = oid(registration_id)
    reg = db.event_registrations.find_one({"_id": reg_oid, "event_id": e["_id"]})
    if not reg:
        raise HTTPException(404, "Registration not found.")

    update_fields = {
        "attended": payload.attended,
        "hours_verified": round(payload.hours_verified, 2) if payload.attended else 0.0,
        "verified_at": now() if payload.attended else None,
        "verified_by": user["sub"] if payload.attended else None,
        "updated_at": now(),
    }
    db.event_registrations.update_one({"_id": reg_oid}, {"$set": update_fields})
    updated_reg = clean(db.event_registrations.find_one({"_id": reg_oid}))

    # Notify student of verified volunteering hours
    if payload.attended and payload.hours_verified > 0:
        key = f"hours-verified:{event_id}:{reg['student_sub']}:{payload.hours_verified}"
        msg = f"Your attendance for '{e['title']}' has been verified for {payload.hours_verified} hours."
        db.notifications.update_one(
            {"dedupe_key": key},
            {"$setOnInsert": {
                "user_sub": reg["student_sub"],
                "type": "hours_verified",
                "title": "Volunteering hours verified",
                "message": msg,
                "event_id": event_id,
                "created_at": now(),
                "read": False,
                "dedupe_key": key,
            }},
            upsert=True,
        )

    return {"message": "Attendance updated.", "registration": updated_reg}

@router.patch("/api/events/{event_id}/duties/{duty_id}/registrations/{registration_id}/attendance")
def set_duty_attendance(event_id: str, duty_id: str, registration_id: str, payload: AttendancePayload, user=Depends(require_role("organizer", "admin"))):
    db = get_db()
    e = require_event(db, event_id)
    d = require_duty(db, event_id, duty_id)
    org_allowed(db, user, e)
    reg_oid = oid(registration_id)
    reg = db.duty_registrations.find_one({"_id": reg_oid, "duty_id": d["_id"]})
    if not reg:
        raise HTTPException(404, "Duty registration not found.")

    update_fields = {
        "attended": payload.attended,
        "hours_verified": round(payload.hours_verified, 2) if payload.attended else 0.0,
        "verified_at": now() if payload.attended else None,
        "verified_by": user["sub"] if payload.attended else None,
        "updated_at": now(),
    }
    db.duty_registrations.update_one({"_id": reg_oid}, {"$set": update_fields})
    return {"message": "Duty attendance updated.", "registration": clean(db.duty_registrations.find_one({"_id": reg_oid}))}

@router.get("/api/students/{student_id}/hours")
def get_student_hours(student_id: str, user=Depends(current_user)):
    if student_id not in (user["sub"], user.get("email")) and "admin" not in user.get("roles", []):
        raise HTTPException(403, "You can only view your own volunteering hours.")
    db = get_db()
    sub = user["sub"]

    event_regs = list(db.event_registrations.find({"student_sub": sub, "attended": True}))
    duty_regs = list(db.duty_registrations.find({"student_sub": sub, "attended": True}))

    total_event_hours = sum(r.get("hours_verified", 0.0) for r in event_regs)
    total_duty_hours = sum(r.get("hours_verified", 0.0) for r in duty_regs)
    total_hours = round(total_event_hours + total_duty_hours, 2)

    records = []
    for r in event_regs:
        ev = db.events.find_one({"_id": r["event_id"]})
        records.append({
            "type": "event",
            "title": ev.get("title", "Event") if ev else "Event",
            "category": ev.get("category", "") if ev else "",
            "hours": r.get("hours_verified", 0.0),
            "date": r.get("verified_at", r.get("updated_at")),
        })
    for dr in duty_regs:
        d = db.duties.find_one({"_id": dr["duty_id"]})
        records.append({
            "type": "duty",
            "title": d.get("title", "Duty") if d else "Duty",
            "hours": dr.get("hours_verified", 0.0),
            "date": dr.get("verified_at", dr.get("updated_at")),
        })

    return {
        "student_id": sub,
        "student_name": user.get("name"),
        "total_hours": total_hours,
        "events_attended": len(event_regs),
        "duties_attended": len(duty_regs),
        "records": sorted(records, key=lambda x: str(x.get("date") or ""), reverse=True),
    }

# --- Student Registrations & Organizer Dashboard ---

@router.get("/api/students/{student_id}/registrations")
def student_registrations(student_id: str, user=Depends(current_user)):
    if student_id not in (user["sub"], user.get("email")) and "admin" not in user.get("roles", []):
        raise HTTPException(403, "You can only view your own registrations.")
    db = get_db()
    sub = user["sub"]
    regs = []
    for r in db.event_registrations.find({"student_sub": sub}).sort("created_at", -1):
        e = db.events.find_one({"_id": r["event_id"]})
        duties = []
        for dr in db.duty_registrations.find({"event_id": r["event_id"], "student_sub": sub}).sort("created_at", -1):
            d = db.duties.find_one({"_id": dr["duty_id"]})
            if d:
                duties.append({
                    "id": str(dr["_id"]),
                    "status": dr["status"],
                    "attended": dr.get("attended", False),
                    "hours_verified": dr.get("hours_verified", 0.0),
                    "created_at": dr["created_at"].isoformat().replace("+00:00", "Z"),
                    "duty": duty_out(db, d),
                })
        if e:
            regs.append({
                "id": str(r["_id"]),
                "status": r["status"],
                "attended": r.get("attended", False),
                "hours_verified": r.get("hours_verified", 0.0),
                "created_at": r["created_at"].isoformat().replace("+00:00", "Z"),
                "event": event_out(db, e),
                "duty_registrations": duties,
            })
    return {"student_id": sub, "student_name": user.get("name"), "event_registrations": regs}

@router.get("/api/organizer/events/{event_id}/summary")
def organizer_summary(event_id: str, user=Depends(require_role("organizer", "admin"))):
    db = get_db()
    e = require_event(db, event_id)
    org_allowed(db, user, e)
    participants = [clean(r) for r in db.event_registrations.find({"event_id": e["_id"], "status": "active"}).sort("created_at", 1)]
    duties = []
    for d in db.duties.find({"event_id": e["_id"], "status": {"$ne": "cancelled"}}).sort("created_at", 1):
        regs = [clean(r) for r in db.duty_registrations.find({"duty_id": d["_id"], "status": "active"}).sort("created_at", 1)]
        duties.append({**duty_out(db, d), "participants": regs})
    return {"event": event_out(db, e), "participants": participants, "duties": duties}

@router.get("/api/organizer/dashboard")
def organizer_dashboard(user=Depends(require_role("organizer", "admin"))):
    db = get_db()
    if "admin" in user.get("roles", []):
        organizations = []
        query = {"status": {"$ne": "cancelled"}}
        status = "admin"
    else:
        organizations = list(db.organizations.find({"owner_sub": user["sub"]}).sort("created_at", -1))
        authorized_ids = authorized_organization_ids(db, user)
        query = {
            "organization_id": {"$in": authorized_ids},
            "status": {"$ne": "cancelled"},
        }
        if authorized_ids:
            status = "approved"
        elif any(org.get("status") == "pending" for org in organizations):
            status = "pending"
        elif any(org.get("status") == "rejected" for org in organizations):
            status = "rejected"
        else:
            status = "not_submitted"

    events = [event_out(db, event) for event in db.events.find(query).sort("event_date", 1)]
    return {"status": status, "organizations": [clean(org) for org in organizations], "events": events}

# --- Profile, Organizations, Moderation, Notifications & Recommendations ---

@router.get("/api/me")
def me(user=Depends(current_user)):
    return {
        "id": user["sub"],
        "sub": user["sub"],
        "email": user.get("email"),
        "name": user.get("name"),
        "roles": user.get("roles", ["student"]),
        "interests": user.get("interests", []),
    }

@router.put("/api/me")
def update_me(payload: ProfilePayload, user=Depends(current_user)):
    db = get_db()
    db.users.update_one(
        {"auth0_sub": user["sub"]},
        {"$set": {"name": payload.name, "interests": payload.interests, "updated_at": now()}},
    )
    user["name"] = payload.name
    user["interests"] = payload.interests
    return me(user)

@router.post("/api/organizations", status_code=201)
def create_organization(payload: OrganizationPayload, user=Depends(current_user)):
    db = get_db()
    existing = db.organizations.find_one({"owner_sub": user["sub"], "status": {"$in": ["pending", "approved"]}})
    if existing:
        raise HTTPException(400, "You already have an organization application.")
    doc = {
        **payload.model_dump(),
        "owner_sub": user["sub"],
        "status": "pending",
        "created_at": now(),
        "updated_at": now(),
    }
    result = db.organizations.insert_one(doc)
    db.organization_memberships.insert_one({
        "organization_id": result.inserted_id,
        "user_sub": user["sub"],
        "role": "owner",
        "status": "active",
        "created_at": now(),
    })
    return clean(db.organizations.find_one({"_id": result.inserted_id}))

@router.get("/api/organizations/mine")
def my_organizations(user=Depends(current_user)):
    db = get_db()
    return [clean(o) for o in db.organizations.find({"owner_sub": user["sub"]}).sort("created_at", -1)]

@router.get("/api/admin/organizations")
def pending_organizations(user=Depends(require_role("admin"))):
    return [clean(o) for o in get_db().organizations.find({"status": "pending"}).sort("created_at", 1)]

@router.post("/api/admin/organizations/{organization_id}/decision")
def decide_organization(
    organization_id: str,
    decision: str = Query(..., pattern="^(approve|reject)$"),
    user=Depends(require_role("admin")),
):
    db = get_db()
    oidv = oid(organization_id)
    org = db.organizations.find_one({"_id": oidv})
    if not org:
        raise HTTPException(404, "Organization not found.")
    status = "approved" if decision == "approve" else "rejected"
    decision_time = now()
    db.organizations.update_one(
        {"_id": oidv},
        {"$set": {"status": status, "reviewed_by": user["sub"], "reviewed_at": decision_time}},
    )
    if status == "approved":
        db.users.update_one({"auth0_sub": org["owner_sub"]}, {"$addToSet": {"roles": "organizer"}})

    # Notify applicant about the decision
    key = f"org-decision:{organization_id}:{status}"
    if status == "approved":
        title = "Organization application approved"
        message = f"Congratulations! Your application for '{org['name']}' has been approved. You can now publish and manage events from the Organizer dashboard."
        notif_type = "organization_approved"
    else:
        title = "Organization application update"
        message = f"Your application for '{org['name']}' was not approved at this time. Please contact administrator for feedback."
        notif_type = "organization_rejected"

    db.notifications.update_one(
        {"dedupe_key": key},
        {"$setOnInsert": {
            "user_sub": org["owner_sub"],
            "type": notif_type,
            "title": title,
            "message": message,
            "created_at": decision_time,
            "read": False,
            "dedupe_key": key,
        }},
        upsert=True,
    )

    owner = db.users.find_one({"auth0_sub": org["owner_sub"]})
    if owner and owner.get("email"):
        send_email(
            owner["email"],
            title,
            f"<p>Hi {owner.get('name', 'Volunteer')},</p><p>{message}</p>",
        )

    return clean(db.organizations.find_one({"_id": oidv}))

# --- Notifications Endpoints ---

@router.get("/api/notifications")
def notifications(user=Depends(current_user)):
    return [clean(n) for n in get_db().notifications.find({"user_sub": user["sub"]}).sort("created_at", -1).limit(100)]

@router.get("/api/notifications/unread-count")
def unread_notifications_count(user=Depends(current_user)):
    count = get_db().notifications.count_documents({"user_sub": user["sub"], "read": False})
    return {"unread_count": count}

@router.post("/api/notifications/{notification_id}/read")
def read_notification(notification_id: str, user=Depends(current_user)):
    db = get_db()
    result = db.notifications.update_one({"_id": oid(notification_id), "user_sub": user["sub"]}, {"$set": {"read": True, "read_at": now()}})
    if not result.matched_count:
        raise HTTPException(404, "Notification not found.")
    return {"ok": True}

@router.post("/api/notifications/read-all")
def read_all_notifications(user=Depends(current_user)):
    db = get_db()
    result = db.notifications.update_many({"user_sub": user["sub"], "read": False}, {"$set": {"read": True, "read_at": now()}})
    return {"ok": True, "marked_count": result.modified_count}

# --- Recommendations ---

@router.get("/api/recommendations")
def recommendations(event_id: str | None = None, user=Depends(current_user)):
    db = get_db()
    sub = user["sub"]
    regs = list(db.event_registrations.find({"student_sub": sub, "status": "active"}))
    registered = {r["event_id"] for r in regs}

    cats = set(user.get("interests", []))
    target_location = None
    target_event_id = None

    if event_id:
        try:
            target_ev = db.events.find_one({"_id": oid(event_id)})
            if target_ev:
                target_event_id = target_ev["_id"]
                if target_ev.get("category"):
                    cats.add(target_ev["category"])
                target_location = target_ev.get("location")
        except Exception:
            pass

    for r in regs:
        e = db.events.find_one({"_id": r["event_id"]})
        if e and e.get("category"):
            cats.add(e["category"])

    query = {"status": "published", "event_date": {"$gte": now()}}
    # Check registration deadline if present
    query["$or"] = [
        {"registration_deadline": None},
        {"registration_deadline": {"$gte": now()}},
    ]

    out = []
    for e in db.events.find(query).sort("event_date", 1).limit(40):
        if e["_id"] in registered or (target_event_id and e["_id"] == target_event_id):
            continue
        x = event_out(db, e)
        if x["remaining_seats"] > 0:
            score = 0
            if cats and e.get("category") in cats:
                score += 10
            if target_location and e.get("location") == target_location:
                score += 5
            x["_score"] = score
            out.append(x)

    out.sort(key=lambda item: (-item.get("_score", 0), item.get("event_date", "")))
    for item in out:
        item.pop("_score", None)
    return out[:10]
