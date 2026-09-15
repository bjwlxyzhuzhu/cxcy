#!/bin/sh
set -eu

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${SESSION_SECRET:?SESSION_SECRET is required}"

if [ "${#SESSION_SECRET}" -lt 32 ]; then
  echo "SESSION_SECRET must be at least 32 characters" >&2
  exit 1
fi

exec "$@"
