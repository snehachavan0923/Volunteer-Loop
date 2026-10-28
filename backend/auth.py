"""JWT authentication for VolunteerLoop's local email/password development flow."""
import os
from datetime import datetime, timezone
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import jwt
from database import get_db

bearer = HTTPBearer(auto_error=False)
TOKEN_ISSUER = "volunteerloop-local"
TOKEN_SECRET = os.getenv("VOLUNTEERLOOP_SECRET_KEY", "local-development-only-change-before-deploy")

def current_user(credentials: HTTPAuthorizationCredentials = Depends(bearer)):
    if credentials is None:
        raise HTTPException(401, "Please log in to continue.", headers={"WWW-Authenticate": "Bearer"})
    try:
        claims = jwt.decode(
            credentials.credentials,
            TOKEN_SECRET,
            algorithms=["HS256"],
            issuer=TOKEN_ISSUER,
            options={"require": ["sub", "exp", "iat", "iss"]},
        )
        sub = claims.get("sub")
        if not sub or not str(sub).startswith("local:"):
            raise ValueError("Invalid local user")
    except Exception:
        raise HTTPException(401, "Your session is invalid or expired. Please log in again.")
    db = get_db()
    profile = db.users.find_one({"auth0_sub": sub, "auth_provider": "local"})
    if not profile:
        raise HTTPException(401, "Account not found. Please log in again.")
    profile["sub"] = sub
    return profile

def require_role(*roles):
    def dependency(user=Depends(current_user)):
        if not set(roles).intersection(user.get("roles", [])):
            raise HTTPException(403, "You do not have permission to perform this action.")
        return user
    return dependency
