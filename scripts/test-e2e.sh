#!/usr/bin/env bash
# Full end-to-end test cycle: fresh DB → run smoke suite.
# NOTE: stop the dev server first if it is running (it holds the DB open).
set -e
cd "$(dirname "$0")/.."
rm -rf .wrangler/state
npx wrangler d1 migrations apply DB --local --persist-to .wrangler/state >/dev/null 2>&1
echo "[e2e] fresh local database ready — start 'npm run dev' in another terminal, then:"
echo "      node scripts/smoke.mjs"
