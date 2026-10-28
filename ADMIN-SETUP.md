# VolunteerLoop local admin setup

This is a patch for an existing VolunteerLoop checkout. Extract the ZIP into the project root (`VolunteerLoop 3`) and allow it to merge/replace the included files. Do not replace your `.env` file.

## 1. Verify the local account can use password login

A local email/password account must have `password_hash` in `volunteerloop.users`. The patch still verifies the password; it does not bypass authentication. Auth0-only accounts without `password_hash` cannot use local password login. Create a new account through `/signup` if needed.

## 2. Promote a local account to admin

From the project root, run:

```bash
cd "$HOME/Downloads/VolunteerLoop 3/backend"
source .venv/bin/activate
cd ..
python scripts/promote_admin.py --email YOUR_TEST_EMAIL@example.com --confirm
```

The script updates only the selected existing account to `roles: ["admin"]`. It does not change the password or touch other users. It reads the existing `backend/.env` and uses its MongoDB URI/database.

## 3. Restart backend and frontend

Backend terminal:

```bash
cd "$HOME/Downloads/VolunteerLoop 3/backend"
source .venv/bin/activate
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Frontend terminal:

```bash
cd "$HOME/Downloads/VolunteerLoop 3/frontend"
npm run dev
```

Then log out and log in again. Admins should be redirected to `/admin` and see pending organization applications. Approve/reject actions call the existing protected backend endpoints and create the existing decision notifications.

## If login still returns 401

Check the account in Compass under `volunteerloop` → `users`. Confirm the email is correct and the document has a `password_hash` field. Changing `roles` alone does not change or recover a password. If you don't know the password or the account has no password hash, create a new local account, then promote that account with the script above.

The local JWT secret is for development only. Do not deploy this development authentication configuration publicly without a security review and a strong secret.
