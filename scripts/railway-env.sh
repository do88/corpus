#!/usr/bin/env bash
#
# Push the hosted configuration into the Railway service.
#
# Reads `.env.hosted` — the file Next never loads, holding the *hosted* Supabase
# coordinates — and sets each value on the service. Values go in over stdin
# rather than as command arguments, so they never reach the process list, the
# shell history or this script's output. Nothing here ever echoes a secret.
#
# Every write passes `--skip-deploys`, so setting eight variables costs one
# build at the end rather than eight. The script does not deploy; it prints the
# command to run when you are ready.
#
# Safe to re-run. CRON_SECRET is generated once and then left alone: rotating it
# on every run would silently break the reconciler, which authenticates on that
# value and nothing else.

set -euo pipefail

PROJECT="${RAILWAY_PROJECT:-2d851508-eb2b-4d77-b5ec-4e332e2a452a}"
ENVIRONMENT="${RAILWAY_ENV:-production}"
SERVICE="${RAILWAY_SVC:-corpus}"
ENV_FILE=".env.hosted"

# The installer puts the CLI here and only a login shell has it on PATH; this
# script is meant to be runnable from anywhere, including a non-interactive one.
if ! command -v railway >/dev/null 2>&1; then
  if [ -x "$HOME/.railway/bin/railway" ]; then
    PATH="$HOME/.railway/bin:$PATH"
  else
    echo "railway CLI not found. Install it, or add it to PATH." >&2
    exit 1
  fi
fi

cd "$(dirname "$0")/.."

[ -f "$ENV_FILE" ] || { echo "$ENV_FILE not found in $(pwd)" >&2; exit 1; }

rail() { railway "$@" --project "$PROJECT" --environment "$ENVIRONMENT" --service "$SERVICE"; }

# Read one value without sourcing the file. `source` would execute whatever is
# in there, and would also mangle values containing spaces or '#'.
value_of() {
  local line
  line=$(grep -m1 -E "^[[:space:]]*(export[[:space:]]+)?$1=" "$ENV_FILE") || return 1
  line=${line#*=}
  line=${line%$'\r'}
  case "$line" in
    \"*\") line=${line#\"}; line=${line%\"} ;;
    \'*\') line=${line#\'}; line=${line%\'} ;;
  esac
  printf '%s' "$line"
}

set_var() {
  printf '%s' "$2" | rail variable set "$1" --stdin --skip-deploys >/dev/null
  echo "  set $1 (${#2} chars)"
}

echo "Service $SERVICE in $ENVIRONMENT"
echo

for key in NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY \
           SUPABASE_SECRET_KEY DATABASE_URL GEMINI_API_KEY; do
  if ! value=$(value_of "$key") || [ -z "$value" ]; then
    echo "  $key missing or empty in $ENV_FILE" >&2
    exit 1
  fi
  set_var "$key" "$value"
done

# Transaction pooling breaks this app's dashboard queries — see the README's
# note on prepared statements and describeFirst. Worth catching here rather
# than as a seven-minute hang in production.
case "$(value_of DATABASE_URL)" in
  *:6543/*) echo "  WARNING: DATABASE_URL is on port 6543 (transaction pooler). Use 5432." >&2 ;;
esac

# A generated domain if there is not one yet. APP_URL has to match it, and so
# does the redirect allow-list in Supabase Auth and the Google OAuth client.
domain=$(rail domain list --json | python3 -c 'import json,sys; d=json.load(sys.stdin).get("domains") or []; print(("" if not d else (d[0]["domain"] if isinstance(d[0],dict) else d[0])))')
if [ -z "$domain" ]; then
  echo "  no domain yet, generating one"
  rail domain >/dev/null
  domain=$(rail domain list --json | python3 -c 'import json,sys; d=json.load(sys.stdin).get("domains") or []; print(("" if not d else (d[0]["domain"] if isinstance(d[0],dict) else d[0])))')
fi
[ -n "$domain" ] || { echo "  could not resolve a domain" >&2; exit 1; }
set_var APP_URL "https://$domain"
echo "  domain is https://$domain"

# Generated only when absent or obviously a placeholder, so re-running does not
# rotate a secret the scheduler is already using.
needs_secret=$(rail variable list --json | python3 -c 'import json,sys; v=json.load(sys.stdin).get("CRON_SECRET",""); print("yes" if len(str(v))<32 else "no")')
if [ "$needs_secret" = "yes" ]; then
  set_var CRON_SECRET "$(openssl rand -hex 32)"
else
  echo "  kept existing CRON_SECRET"
fi

# Only honoured when NODE_ENV is development, so it is inert in a production
# build — but it has no business being defined here at all.
if rail variable delete NEXT_PUBLIC_DEV_AUTH >/dev/null 2>&1; then
  echo "  removed NEXT_PUBLIC_DEV_AUTH"
fi

echo
echo "Done. Nothing has been deployed yet. When ready:"
echo "  railway redeploy --from-source --yes --project $PROJECT --environment $ENVIRONMENT --service $SERVICE"
