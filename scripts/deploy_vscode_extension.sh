#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
EXT_DIR="$REPO_ROOT/vscode-extension"

if [[ ! -d "$EXT_DIR" ]]; then
  echo "vscode-extension directory not found: $EXT_DIR" >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required" >&2
  exit 1
fi

EXT_NAME="$(node -p "require('$EXT_DIR/package.json').name")"
EXT_VERSION="$(node -p "require('$EXT_DIR/package.json').version")"
TARGET_ROOT="${VSCODE_EXTENSIONS_DIR:-$HOME/.vscode/extensions}"
TARGET_DIR="$TARGET_ROOT/$EXT_NAME-$EXT_VERSION"

echo "Building VS Code extension..."
if [[ ! -d "$EXT_DIR/node_modules" ]]; then
  (cd "$EXT_DIR" && npm ci)
fi
(cd "$EXT_DIR" && npm run build:all)

echo "Deploying to $TARGET_DIR"
mkdir -p "$TARGET_ROOT"
rm -rf "$TARGET_DIR"
mkdir -p "$TARGET_DIR"

cp "$EXT_DIR/package.json" "$TARGET_DIR/package.json"
if [[ -d "$EXT_DIR/dist" ]]; then
  cp -R "$EXT_DIR/dist" "$TARGET_DIR/dist"
fi
if [[ -d "$EXT_DIR/media" ]]; then
  cp -R "$EXT_DIR/media" "$TARGET_DIR/media"
fi

echo "Extension deployed."
echo "Target: $TARGET_DIR"
echo "Next: reload VS Code window or restart the Extension Host."
