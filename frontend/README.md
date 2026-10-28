# VolunteerLoop Frontend

React + Vite frontend for VolunteerLoop.

## Local setup

1. Install Node.js 22 or newer.
2. Run `npm install`.
3. Ensure `frontend/.env` contains `VITE_API_BASE_URL=http://127.0.0.1:8000`.
4. Start the FastAPI backend, then run `npm run dev`.
5. Open `http://localhost:5173`.

Authentication is currently handled by the local FastAPI email/password endpoints. Signup collects a name, email, password, and role (Student / Volunteer or Event Organizer). This is a development flow, not production-grade authentication.
