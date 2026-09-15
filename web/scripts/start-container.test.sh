#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT
mkdir -p "$TEMP_DIR/public"

SUPABASE_PUBLIC_URL='https://example.test/supabase?x="quoted"' \
SUPABASE_ANON_KEY='key-with-$-and-"quotes"' \
APP_DIR="$TEMP_DIR" \
  "$ROOT_DIR/scripts/start-container.sh" true

CONFIG=$(cat "$TEMP_DIR/public/runtime-config.js")
printf '%s' "$CONFIG" | grep -F 'https://example.test/supabase?x=\"quoted\"' >/dev/null
printf '%s' "$CONFIG" | grep -F 'key-with-$-and-\"quotes\"' >/dev/null

if APP_DIR="$TEMP_DIR" "$ROOT_DIR/scripts/start-container.sh" true 2>/dev/null; then
  echo "expected missing Supabase variables to fail" >&2
  exit 1
fi

echo "startup runtime config test passed"
