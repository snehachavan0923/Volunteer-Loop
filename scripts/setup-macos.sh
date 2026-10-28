#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

command -v python3 >/dev/null 2>&1 || { echo "ERROR: Install Python 3.12 first."; exit 1; }
command -v node >/dev/null 2>&1 || { echo "ERROR: Install Node.js 22.14.0 or newer first."; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "ERROR: npm was not found. Reinstall Node.js 22.14.0 or newer."; exit 1; }

NODE_VERSION="$(node -p 'process.versions.node')"
if ! NODE_VERSION="$NODE_VERSION" python3 - <<'PY'
import os, sys
v=tuple(int(x) for x in os.environ['NODE_VERSION'].split('.')[:3])
sys.exit(0 if v >= (22,14,0) else 1)
PY
then
  echo "ERROR: Node.js $NODE_VERSION detected. This project needs Node.js 22.14.0 or newer."
  echo "Upgrade Node.js, open a new Terminal, and run this script again."
  exit 1
fi

if [[ ! -d backend/.venv ]]; then
  python3 -m venv backend/.venv
fi
backend/.venv/bin/python -m pip install --upgrade pip
backend/.venv/bin/python -m pip install -r backend/requirements-dev.txt

if [[ ! -f backend/.env ]]; then
  cp backend/.env.example backend/.env
  echo "Created backend/.env from the example. Edit it with your Atlas/Auth0 settings."
else
  echo "Kept existing backend/.env (not overwritten)."
fi

if [[ ! -f frontend/.env ]]; then
  cp frontend/.env.example frontend/.env
  echo "Created frontend/.env from the example. Edit it with your Auth0 SPA settings."
else
  echo "Kept existing frontend/.env (not overwritten)."
fi

(cd frontend && npm install)
echo
echo "Setup completed. Before starting, edit backend/.env and frontend/.env with your own values."
echo "Start backend: cd '$ROOT/backend' && source .venv/bin/activate && uvicorn main:app --reload --host 127.0.0.1 --port 8000"
echo "Start frontend in a second Terminal: cd '$ROOT/frontend' && npm run dev"
