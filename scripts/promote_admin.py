"""Promote one existing VolunteerLoop local account to admin for local development only."""
import argparse
import os
from pathlib import Path
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv(Path(__file__).resolve().parents[1] / "backend" / ".env")

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--email", required=True, help="Email of the existing account to promote")
    parser.add_argument("--confirm", action="store_true", help="Confirm the role change")
    args = parser.parse_args()
    if not args.confirm:
        parser.error("Role change not applied. Re-run with --confirm after checking the target email.")
    uri = os.getenv("MONGODB_URI", "").strip()
    database = os.getenv("MONGODB_DATABASE", "volunteerloop").strip() or "volunteerloop"
    if not uri:
        raise SystemExit("MONGODB_URI is missing from backend/.env")
    client = MongoClient(uri, serverSelectionTimeoutMS=5000)
    try:
        db = client[database]
        email = args.email.strip().lower()
        user = db.users.find_one({"email": email})
        if not user:
            raise SystemExit(f"No account found for {email}. Sign up first.")
        if not user.get("password_hash"):
            raise SystemExit("This account has no local password. Sign up/login with a local-auth account first.")
        db.users.update_one({"_id": user["_id"]}, {"$set": {"roles": ["admin"], "auth_provider": "local"}})
        print(f"Promoted {email} to admin in database '{database}'. Log out and log in again.")
    finally:
        client.close()

if __name__ == "__main__":
    main()
