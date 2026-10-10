#!/usr/bin/env bash
# Build frontend + apply local D1 migrations + start wrangler dev (0.0.0.0:8787)
set -e
cd "$(dirname "$0")/.."

if [ ! -f .dev.vars ]; then
  cp .dev.vars.example .dev.vars
  echo "[dev-preview] created .dev.vars from example"
fi

if [ ! -d dist ] || [ "$(find src/web public -newer dist/index.html -type f 2>/dev/null | head -1)" ]; then
  echo "[dev-preview] building frontend..."
  npx vite build
fi

echo "[dev-preview] applying local D1 migrations..."
npx wrangler d1 migrations apply DB --local --persist-to .wrangler/state 2>&1 | tail -2 || true

echo "[dev-preview] starting worker on 0.0.0.0:8787 ..."
exec npx wrangler dev --port 8787 --ip 0.0.0.0 --persist-to .wrangler/state
