#!/bin/sh
set -eu

BUN_BIN=${BUN_BIN:-bun}
HELPER_NAME="extract-codex-openai-credentials.ts"

if [ -f "$PWD/scripts/$HELPER_NAME" ]; then
  HELPER_PATH="$PWD/scripts/$HELPER_NAME"
else
  SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
  HELPER_PATH="$SCRIPT_DIR/$HELPER_NAME"
fi

if ! command -v "$BUN_BIN" >/dev/null 2>&1; then
  echo "[codex-auth] bun not found in PATH. Install Bun or set BUN_BIN." >&2
  exit 1
fi

exec "$BUN_BIN" "$HELPER_PATH" --format shell "$@"
