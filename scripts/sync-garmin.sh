#!/usr/bin/env bash
#
# Pull fresh data from Garmin, then load it into Postgres.
#
#     pnpm sync:garmin            # into local Postgres
#     pnpm sync:garmin --remote   # into the hosted project, via .env.hosted
#
# **This one still only runs on this Mac, and that is the whole reason it is a
# shell script rather than a route.** Garmin has no public API. GarminDB signs
# into Garmin Connect as you and downloads FIT files into ~/HealthData, which
# means a Python toolchain, your credentials, and 638 MB of archive that has to
# persist between runs. Hevy needed none of that and moved to the server; this
# has not, yet.
#
# Expect fifteen to twenty minutes, and know why: the download with `--latest`
# is seconds, but GarminDB's import then walks every FIT file it has ever
# fetched — about fifteen thousand of them — before reaching the new ones. It
# is CPU, not network, and it is GarminDB's design rather than ours.
#
# Additive: `port:garmin` upserts by day, so nothing else in the database is
# touched and a bad run is fixed by the next one.
#
# Fails loudly. A download that fails skips its load rather than loading stale
# data as though it were fresh.
set -euo pipefail

CORPUS="$(cd "$(dirname "$0")/.." && pwd)"
VENV="$(pipx environment --value PIPX_LOCAL_VENVS)/garmindb"
LOG="${TMPDIR:-/tmp}/sync-garmin.$$"
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

echo "==> downloading from Garmin (this is the slow part)"
if ! ( cd "$HOME" && "${GARMIN[@]}" --all --download --import --analyze --latest ) > "$LOG/garmin.log" 2>&1; then
  echo "    FAILED — see $LOG/garmin.log" >&2
  tail -n 5 "$LOG/garmin.log" | sed 's/^/      /' >&2
  exit 1
fi
echo "    downloaded and imported"

if [ "$REMOTE" = 1 ]; then
  echo "==> loading into the HOSTED database"
  ENV_FILE="--env-file=$CORPUS/.env.hosted"
  export CONFIRM_REMOTE_PORT=yes
else
  echo "==> loading into local Postgres"
  ENV_FILE="--env-file=/dev/null"
fi

cd "$CORPUS"
npx tsx "$ENV_FILE" scripts/port-garmin.mts

echo "==> done"
rm -rf "$LOG"
