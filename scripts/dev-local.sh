#!/usr/bin/env bash
# Develop against the local Supabase stack, with no login screen.
#
#     pnpm dev:local
#
# `pnpm dev` points at the **hosted** project, because that is what `.env.local`
# holds — which is why `test:recovery` has to override the URL to avoid writing
# invented meals into the real log, and why ordinary development meant signing
# in through Google against production data.
#
# This runs the same dev server against the Docker stack instead: local
# database, local auth, local storage. Nothing it does can reach the real food
# log. The login screen is skipped because the app signs itself in — see
# `src/lib/auth/dev.ts` for why that is a real sign-in rather than a bypass.
#
# Supabase coordinates are read from `supabase status` rather than a second env
# file, so there is nothing to keep in sync and nothing extra to gitignore.
# Everything else — `ANTHROPIC_API_KEY` in particular — is still inherited from
# `.env.local`.
set -euo pipefail

LOCAL_DB="postgresql://postgres:postgres@127.0.0.1:54322/postgres"

if ! supabase status >/dev/null 2>&1; then
  echo "Local Supabase is not running. Start it with:  pnpm db:start" >&2
  exit 1
fi

STATUS="$(supabase status --output json)"
read_key() {
  printf '%s' "$STATUS" | python3 -c "import sys,json;print(json.load(sys.stdin)['$1'])"
}

export NEXT_PUBLIC_SUPABASE_URL="$(read_key API_URL)"
export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$(read_key ANON_KEY)"
export SUPABASE_SECRET_KEY="$(read_key SERVICE_ROLE_KEY)"
export DATABASE_URL="$LOCAL_DB"
export NEXT_PUBLIC_DEV_AUTH="true"

# Idempotent, and cheap enough to run every time — it means a fresh clone or a
# reset database never presents a login screen nobody can get past.
tsx scripts/dev-user.mts

# A warning rather than a failure: the app runs fine against an empty database,
# /training just has nothing to draw.
if ! psql "$LOCAL_DB" -tAc "select 1 from workouts limit 1" >/dev/null 2>&1; then
  echo "note: no training data locally — run 'pnpm db:port' if /training looks empty"
fi

echo "→ ${NEXT_PUBLIC_SUPABASE_URL} · signed in as the owner, no login screen"
echo

exec next dev "$@"
