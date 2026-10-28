"""Local email/password authentication for the VolunteerLoop development build."""
import base64
import hashlib
import hmac
import os
import re
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator
from pymongo.errors import DuplicateKeyError
from database import get_db

router = APIRouter(prefix="/api/auth", tags=["authentication"])
TOKEN_ISSUER = "volunteerloop-local"
TOKEN_SECRET = os.getenv("VOLUNTEERLOOP_SECRET_KEY", "local-development-only-change-before-deploy")

class SignupPayload(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    email: str
    password: str = Field(min_length=8, max_length=128)
    role: str = "student"

    @field_validator("name")
    @classmethod
    def clean_name(cls, value):
        value = value.strip()
        if len(value) < 2:
            raise ValueError("Enter your full name.")
        return value

    @field_validator("role")
    @classmethod
    def valid_role(cls, value):
        if value not in {"student", "organizer"}:
            raise ValueError("Choose Student / Volunteer or Event Organizer.")
        return value

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value):
        value = value.lower().strip()
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value):
            raise ValueError("Enter a valid email address.")
        return value

class LoginPayload(BaseModel):
    email: str
    password: str = Field(min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value):
        value = value.lower().strip()
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value):
            raise ValueError("Enter a valid email address.")
        return value

def _hash_password(password: str, salt: bytes | None = None) -> str:
    salt = salt or os.urandom(16)
    derived = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1, dklen=64)
    return f"scrypt${base64.b64encode(salt).decode()}${base64.b64encode(derived).decode()}"

def _verify_password(password: str, stored: str) -> bool:
    try:
        scheme, salt_text, hash_text = stored.split("$", 2)
        if scheme != "scrypt":
            return False
        salt = base64.b64decode(salt_text)
        expected = base64.b64decode(hash_text)
        actual = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1, dklen=len(expected))
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False

def _token_for(user: dict) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode({
        "sub": user["auth0_sub"],
        "email": user["email"],
        "iss": TOKEN_ISSUER,
        "iat": now,
        "exp": now + timedelta(hours=12),
    }, TOKEN_SECRET, algorithm="HS256")

def _user_response(user: dict) -> dict:
    return {
        "access_token": _token_for(user),
        "token_type": "bearer",
        "user": {
            "id": user["auth0_sub"],
            "sub": user["auth0_sub"],
            "name": user.get("name", "Volunteer"),
            "email": user["email"],
            "roles": user.get("roles", ["student"]),
            "interests": user.get("interests", []),
        },
    }

@router.post("/signup", status_code=201)
def signup(payload: SignupPayload):
    db = get_db()
    email = payload.email.lower()
    if db.users.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="An account with this email already exists. Please log in.")
    now = datetime.now(timezone.utc)
    # The existing app uses auth0_sub as its stable user key; retain that field name
    # internally to avoid rewriting every event and registration relationship.
    from bson import ObjectId
    user_sub = f"local:{ObjectId()}"
    user = {
        "auth0_sub": user_sub,
        "email": email,
        "name": payload.name,
        "roles": [payload.role],
        "interests": [],
        "password_hash": _hash_password(payload.password),
        "created_at": now,
        "updated_at": now,
        "auth_provider": "local",
    }
    try:
        db.users.insert_one(user)
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail="An account with this email already exists. Please log in.")
    return _user_response(user)

@router.post("/login")
def login(payload: LoginPayload):
    db = get_db()
    # Some local-development accounts created by earlier builds may have a password_hash
    # but no auth_provider field. Look up by normalized email, then still require a valid
    # password hash; never treat an Auth0-only account as a password account.
    user = db.users.find_one({"email": payload.email.lower()})
    stored_hash = user.get("password_hash", "") if user else ""
    if not user or not stored_hash or not _verify_password(payload.password, stored_hash):
        raise HTTPException(status_code=401, detail="Incorrect email or password.")
    if user.get("auth_provider") != "local":
        db.users.update_one({"_id": user["_id"]}, {"$set": {"auth_provider": "local", "updated_at": datetime.now(timezone.utc)}})
        user["auth_provider"] = "local"
    # Roles are always read from MongoDB at login time, so a Compass role update
    # takes effect on the next successful login.
    user["roles"] = user.get("roles") or ["student"]
    return _user_response(user)
