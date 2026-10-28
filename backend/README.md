# VolunteerLoop Backend

FastAPI + PyMongo REST API with local MongoDB and email/password authentication for development.

## Local setup

1. Install Python 3.11+.
2. Create and activate a virtual environment.
3. Install dependencies with `pip install -r requirements.txt`.
4. Ensure `backend/.env` contains:

   ```env
   MONGODB_URI=mongodb://127.0.0.1:27017
   MONGODB_DATABASE=volunteerloop
   VOLUNTEERLOOP_SECRET_KEY=replace-with-a-long-random-secret
   CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
   ```

5. Start MongoDB Community Server.
6. Run `uvicorn main:app --reload --host 127.0.0.1 --port 8000` from this directory.
7. Check `http://127.0.0.1:8000/docs`.

Endpoints: `POST /api/auth/signup`, `POST /api/auth/login`. Passwords are hashed with scrypt; the API returns a signed, expiring JWT. The local auth flow is intended for development/demo use and should be reviewed before any public deployment.
