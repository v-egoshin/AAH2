#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$REPO_ROOT"

echo "Rebuilding backend and web images..."
docker compose build backend web

echo "Restarting backend and web containers..."
docker compose up -d backend web

echo "Done."
echo "Backend: http://localhost:8000"
echo "Web:     http://localhost:5173"
