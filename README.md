# VolunteerLoop local email authentication + admin role patch

This ZIP overlays selected files onto the existing VolunteerLoop project. It keeps the local MongoDB email/password flow, fixes the local login lookup for accounts with a valid password hash but missing `auth_provider`, adds admin-aware redirects/navigation, and adds a protected admin dashboard for reviewing organization applications.

See `ADMIN-SETUP.md` for installation and local admin promotion steps. Keep your existing `backend/.env` private and do not replace it with `.env.example`.
