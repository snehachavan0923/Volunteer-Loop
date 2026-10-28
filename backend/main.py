"""VolunteerLoop API. Configure local MongoDB in backend/.env."""
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from database import ensure_indexes, get_db
from email_service import send_email
from mongo_api import router
from local_auth import router as local_auth_router

logger = logging.getLogger("volunteerloop")
DEFAULT_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173"

def create_reminders():
    """Idempotently enqueue in-app reminders and send optional email reminders."""
    db = get_db(required=False)
    if db is None:
        return
    now = datetime.now(timezone.utc)
    low = now + timedelta(hours=23)
    high = now + timedelta(hours=25)

    # 1. Event reminders ~24 hours ahead
    for event in db.events.find({"status": {"$ne": "cancelled"}, "event_date": {"$gte": low, "$lt": high}}):
        for reg in db.event_registrations.find({"event_id": event["_id"], "status": "active"}):
            key = f"event-reminder-24h:{event['_id']}:{reg['student_sub']}"
            msg = f"{event['title']} is scheduled for tomorrow at {event.get('location', 'the listed location')}."
            result = db.notifications.update_one(
                {"dedupe_key": key},
                {"$setOnInsert": {
                    "user_sub": reg["student_sub"],
                    "type": "event_reminder",
                    "title": "Your volunteering event is tomorrow",
                    "message": msg,
                    "event_id": str(event["_id"]),
                    "created_at": now,
                    "read": False,
                    "dedupe_key": key,
                }},
                upsert=True,
            )
            if result.upserted_id:
                user = db.users.find_one({"auth0_sub": reg["student_sub"]})
                if user and user.get("email"):
                    send_email(
                        user["email"],
                        f"Reminder: {event['title']} is tomorrow",
                        f"<p>Hi {user.get('name', 'Volunteer')},</p><p>{msg}</p>",
                    )

    # 2. Duty reminders ~24 hours ahead
    for duty in db.duties.find({"status": "active", "start_time": {"$gte": low, "$lt": high}}):
        event = db.events.find_one({"_id": duty["event_id"]})
        for reg in db.duty_registrations.find({"duty_id": duty["_id"], "status": "active"}):
            key = f"duty-reminder-24h:{duty['_id']}:{reg['student_sub']}"
            event_title = (event or {}).get("title", "your event")
            msg = f"{duty['title']} for {event_title} is coming up tomorrow."
            result = db.notifications.update_one(
                {"dedupe_key": key},
                {"$setOnInsert": {
                    "user_sub": reg["student_sub"],
                    "type": "duty_reminder",
                    "title": "Your volunteer duty is tomorrow",
                    "message": msg,
                    "event_id": str(duty["event_id"]),
                    "created_at": now,
                    "read": False,
                    "dedupe_key": key,
                }},
                upsert=True,
            )
            if result.upserted_id:
                user = db.users.find_one({"auth0_sub": reg["student_sub"]})
                if user and user.get("email"):
                    send_email(
                        user["email"],
                        f"Duty reminder: {duty['title']}",
                        f"<p>Hi {user.get('name', 'Volunteer')},</p><p>{msg}</p>",
                    )

    # 3. Registration deadline reminders ~24 hours ahead
    for event in db.events.find({"status": "published", "registration_deadline": {"$gte": low, "$lt": high}}):
        active_regs = {r["student_sub"] for r in db.event_registrations.find({"event_id": event["_id"], "status": "active"})}
        for user in db.users.find({}):
            student_sub = user.get("auth0_sub")
            if not student_sub or student_sub in active_regs:
                continue
            # Remind users whose interests match the category or all students
            user_interests = user.get("interests", [])
            if not user_interests or event.get("category") in user_interests:
                key = f"deadline-reminder-24h:{event['_id']}:{student_sub}"
                msg = f"Registration for '{event['title']}' closes in 24 hours. Sign up now before seats fill up!"
                db.notifications.update_one(
                    {"dedupe_key": key},
                    {"$setOnInsert": {
                        "user_sub": student_sub,
                        "type": "registration_deadline",
                        "title": "Registration deadline approaching",
                        "message": msg,
                        "event_id": str(event["_id"]),
                        "created_at": now,
                        "read": False,
                        "dedupe_key": key,
                    }},
                    upsert=True,
                )

    # 4. Post-event suggestion ~30-60 min after event
    ended_low = now - timedelta(minutes=60)
    ended_high = now - timedelta(minutes=30)
    for event in db.events.find({"status": {"$ne": "cancelled"}, "event_date": {"$gte": ended_low, "$lt": ended_high}}):
        for reg in db.event_registrations.find({"event_id": event["_id"]}):
            key = f"after-event:{event['_id']}:{reg['student_sub']}"
            db.notifications.update_one(
                {"dedupe_key": key},
                {"$setOnInsert": {
                    "user_sub": reg["student_sub"],
                    "type": "recommendation",
                    "title": "Find your next volunteering opportunity",
                    "message": f"Thanks for being part of {event['title']}. Open Account to explore upcoming opportunities matched to your interests.",
                    "event_id": str(event["_id"]),
                    "created_at": now,
                    "read": False,
                    "dedupe_key": key,
                }},
                upsert=True,
            )

@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        ensure_indexes()
    except Exception:
        logger.exception("MongoDB index setup failed; check MongoDB configuration.")
    scheduler = None
    try:
        from apscheduler.schedulers.background import BackgroundScheduler
        scheduler = BackgroundScheduler(timezone="UTC")
        scheduler.add_job(create_reminders, "interval", minutes=30, id="event-reminders", replace_existing=True)
        scheduler.start()
    except Exception:
        logger.exception("Reminder scheduler could not start.")
    app.state.scheduler = scheduler
    yield
    if scheduler:
        scheduler.shutdown(wait=False)

app = FastAPI(
    title="VolunteerLoop API",
    description="College volunteering events, duties, Auth0 identity, organizations and notifications.",
    version="2.0.0",
    lifespan=lifespan,
)

origins = [o.strip() for o in os.getenv("CORS_ORIGINS", DEFAULT_ORIGINS).split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

@app.exception_handler(Exception)
async def unexpected_error_handler(_request: Request, exc: Exception):
    logger.exception("Unhandled error", exc_info=exc)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error. Check backend logs for configuration details."},
    )

app.include_router(local_auth_router)
app.include_router(router)
