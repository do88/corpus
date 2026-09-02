#!/usr/bin/env bash
#
# Pull fresh data from Garmin and Hevy, then load both into Postgres.
#
#     pnpm sync:all            # into local Postgres
#     pnpm sync:all --remote   # into the hosted project, via .env.hosted
#
# The two downloads run at the same time — they talk to different services and
# neither waits on the other — and the two loads run one after the other, since
# both write to the same database. On a normal day this is a couple of minutes,
# nearly all of it Garmin.
#
# What each half does:
#
#   Garmin  `garmindb_cli.py --latest` fetches only what is new since the last
#           run, then `port:garmin` upserts by day. Additive; nothing else in
#           the database is touched.
#
#   Hevy    `hevy_sync.py` re-pulls the whole account into its SQLite (it is
#           idempotent, and the API pages at ten rows, so "whole" is fine),
#           then `db:port` TRUNCATES every training table and reloads it. That
#           is the existing behaviour of the Hevy port and it is deliberate —
#           the verification gate depends on the two databases being identical
#           — but it means anything edited by hand in those tables is lost.
#           Re-check `profile` after a run.
#
# Fails loudly. A download that fails skips its load rather than loading stale
# data as though it were fresh, and the exit code says which half failed.
set -euo pipefail

CORPUS="$(cd "$(dirname "$0")/.." && pwd)"
HEVY="${HEVY_PROJECT:-$CORPUS/../hevy}"
VENV="$(pipx environment --value PIPX_LOCAL_VENVS)/garmindb"
LOG="${TMPDIR:-/tmp}/sync-all.$$"
mkdir -p "$LOG"

REMOTE=0
for arg in "$@"; do
  case "$arg" in
    --remote) REMOTE=1 ;;
    *) echo "unknown argument: $arg" >&2; exit 64 ;;
  esac
done

# The pipx shim cannot be executed directly: its shebang points into
# "~/Library/Application Support/…", and a shebang with a space in it is a
# "bad interpreter". The venv's own Python runs the script fine.
GARMIN=("$VENV/bin/python" "$VENV/bin/garmindb_cli.py")

if [ ! -x "$VENV/bin/python" ]; then
  echo "GarminDB is not installed (pipx install garmindb)" >&2
  exit 69
fi
if [ ! -f "$HEVY/scripts/hevy_sync.py" ]; then
  echo "Hevy project not found at $HEVY (set HEVY_PROJECT)" >&2
  exit 69
fi

echo "==> downloading from Garmin and Hevy in parallel"
(
  cd "$HOME"
  "${GARMIN[@]}" --all --download --import --analyze --latest
) > "$LOG/garmin.log" 2>&1 &
GARMIN_PID=$!

(
  cd "$HEVY"
  python3 scripts/hevy_sync.py
) > "$LOG/hevy.log" 2>&1 &
HEVY_PID=$!

garmin_ok=1; hevy_ok=1
wait "$GARMIN_PID" || garmin_ok=0
wait "$HEVY_PID" || hevy_ok=0

if [ "$garmin_ok" = 1 ]; then
  echo "    garmin: downloaded and imported"
else
  echo "    garmin: FAILED — see $LOG/garmin.log" >&2
  tail -n 5 "$LOG/garmin.log" | sed 's/^/      /' >&2
fi
if [ "$hevy_ok" = 1 ]; then
  echo "    hevy:   synced"
else
  echo "    hevy:   FAILED — see $LOG/hevy.log" >&2
  tail -n 5 "$LOG/hevy.log" | sed 's/^/      /' >&2
fi

# Loads. Each only runs if its download succeeded — a failed pull must not
# reload yesterday's file as though it were today's.
if [ "$REMOTE" = 1 ]; then
  echo "==> loading into the HOSTED database"
  ENV_FILE="--env-file=$CORPUS/.env.hosted"
  export CONFIRM_REMOTE_PORT=yes
else
  echo "==> loading into local Postgres"
  ENV_FILE="--env-file=/dev/null"
fi

cd "$CORPUS"
if [ "$garmin_ok" = 1 ]; then
  npx tsx "$ENV_FILE" scripts/port-garmin.mts
fi
if [ "$hevy_ok" = 1 ]; then
  node "$ENV_FILE" --disable-warning=ExperimentalWarning scripts/port-sqlite.mjs "$HEVY/data/hevy.db"
fi

if [ "$garmin_ok" = 1 ] && [ "$hevy_ok" = 1 ]; then
  echo "==> done"
  rm -rf "$LOG"
else
  echo "==> finished with failures (logs kept in $LOG)" >&2
  exit 1
fi
