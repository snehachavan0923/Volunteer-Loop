# VolunteerLoop

VolunteerLoop is a web-based platform that connects students with volunteering opportunities and helps organizations manage events, volunteers, and participation. It supports event discovery, registrations, duty management, and tracking volunteer hours.

## Tech Stack

- **Frontend:** React, Vite
- **Backend:** FastAPI (Python)
- **Database:** MongoDB
- **Authentication:** Auth0

## Main Features

- **Authentication & Profiles:** Secure login and student profile management.
- **Organizations:** Students can apply to join organizations, and administrators can approve or reject applications.
- **Events & Duties:** Organizers can create and manage volunteering events and duties.
- **Registrations:** Students can register for events and duties, subject to capacity and deadlines.
- **Attendance & Volunteer Hours:** Track attendance and verify volunteering hours.
- **Notifications & Recommendations:** Provide reminders and personalized volunteering recommendations.
- **Role-Based Access:** Supports student, organizer, and administrator roles.

## Application Flow

1. **Login:** Users authenticate through Auth0.
2. **Explore:** Students browse volunteering events and recommendations.
3. **Join Organizations:** Students apply to organizations; administrators review applications.
4. **Create Events:** Authorized organizers create events and manage duties.
5. **Register:** Students register for available events or duties.
6. **Participate:** Attendance and volunteering hours are recorded and verified.
7. **Manage:** Organizers and administrators oversee activities based on their roles.

## Project Structure

```text
VolunteerLoop/
├── backend/       # FastAPI backend, authentication, database and APIs
├── frontend/      # React frontend
├── tests/         # Backend tests
└── README.md
```
```bash
backend/.venv/bin/python -m pytest -v
```
