#!/bin/sh
set -eu

: "${SUPABASE_PUBLIC_URL:?SUPABASE_PUBLIC_URL is required}"
: "${SUPABASE_ANON_KEY:?SUPABASE_ANON_KEY is required}"

APP_DIR=${APP_DIR:-/app}
mkdir -p "$APP_DIR/public"

APP_DIR="$APP_DIR" node <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const config = {
  supabaseUrl: process.env.SUPABASE_PUBLIC_URL,
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
};
const target = path.join(process.env.APP_DIR, "public", "runtime-config.js");
fs.writeFileSync(
  target,
  `window.__CXCY_RUNTIME_CONFIG__ = ${JSON.stringify(config)};\n`,
  "utf8"
);
NODE

exec "$@"
