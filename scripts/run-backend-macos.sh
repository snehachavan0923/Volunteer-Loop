#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/backend"
if [[ ! -x .venv/bin/uvicorn ]]; then
  echo "Backend dependencies are missing. Run ../scripts/setup-macos.sh first."
  exit 1
fi
exec .venv/bin/uvicorn main:app --reload --host 127.0.0.1 --port 8000
