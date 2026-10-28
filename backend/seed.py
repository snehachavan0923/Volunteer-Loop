"""Seed a few sample events in MongoDB Atlas. Run only after configuring .env."""
from datetime import datetime, timedelta, timezone
from database import get_db, ensure_indexes

def main():
    db=get_db(); ensure_indexes()
    if db.events.count_documents({})>0:
        print("Events already exist; skipping seed to avoid duplicate sample data."); return
    now=datetime.now(timezone.utc)
    examples=[
      {"title":"Campus Clean-up Drive","description":"Help make campus greener with a community clean-up and waste segregation activity.","location":"Main campus","event_date":now+timedelta(days=7),"capacity":40,"organizer_name":"Green Campus Club","category":"Environment"},
      {"title":"Weekend Learning Circle","description":"Volunteer to support school students with reading, basic maths and learning activities.","location":"Community Learning Centre","event_date":now+timedelta(days=12),"capacity":25,"organizer_name":"Community Outreach","category":"Education"},
      {"title":"Community Health Awareness","description":"Support the event desk and help visitors find health awareness resources.","location":"Student Activity Centre","event_date":now+timedelta(days=18),"capacity":30,"organizer_name":"Health Volunteers","category":"Health"},
    ]
    for e in examples: e.update(status="published",organization_id=None,created_by="seed",created_at=now,updated_at=now)
    db.events.insert_many(examples); print(f"Inserted {len(examples)} sample events.")
if __name__=="__main__": main()
