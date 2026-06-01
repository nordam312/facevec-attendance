#!/bin/sh
# Apply any pending database migrations, then start the gateway.
# `migrate deploy` is idempotent and never resets data, so it is safe to run on
# every boot. DATABASE_URL is provided by the environment (docker-compose).
set -e

echo "[entrypoint] applying database migrations…"
node_modules/.bin/prisma migrate deploy

echo "[entrypoint] starting gateway…"
exec "$@"
