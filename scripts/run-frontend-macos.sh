#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/frontend"
if [[ ! -x node_modules/.bin/vite ]]; then
  echo "Frontend dependencies are missing. Run ../scripts/setup-macos.sh first."
  exit 1
fi
exec npm run dev
