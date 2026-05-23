#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$REPO_ROOT"

echo "Stopping app stack and removing database volume..."
docker compose down -v

echo "Starting database service..."
docker compose up -d db

echo "Waiting for database to become healthy..."
docker compose up -d backend

echo "Starting web service..."
docker compose up -d web

echo "Database reset complete."
echo "Backend: http://localhost:8000"
echo "Web:     http://localhost:5173"
