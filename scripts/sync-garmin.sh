#!/usr/bin/env bash
#
# Pull fresh data from Garmin, then load it into Postgres.
#
#     pnpm sync:garmin            # into local Postgres
#     pnpm sync:garmin --remote   # into the hosted project, via .env.hosted
#
# **The server owns Garmin now, so this refuses to run by default.**
#
# Garmin's refresh token rotates on every use and whoever used it last holds the
# only valid one. The `sync` Railway service uses it weekly, which makes the
# token single-homed: running this as well would hand the Mac a fresh pair and
# leave the server holding a spent one, silently, until the next Monday failed.
#
# There is exactly one good reason to run it anyway, and it is the reason this
# is a guard rather than a deletion: when Garmin eventually rejects the token,
# re-authenticating needs a machine that can answer a prompt, and this is that
# machine. See the message below for what to do with the new token afterwards.
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

if [ "${CONFIRM_GARMIN_TAKEOVER:-}" != "yes" ]; then
  cat >&2 <<'WHY'
Refusing to run: the Railway `sync` service owns the Garmin token.

Garmin's refresh token rotates on use, so running this here would invalidate the
server's copy and the Monday sync would start failing with a 429 that looks like
rate limiting rather than what it is.

The one time you should override this is to re-authenticate after Garmin has
rejected the token. Then:

  CONFIRM_GARMIN_TAKEOVER=yes pnpm sync:garmin

and afterwards put the refreshed token back on the server, or the next run will
still be using the dead one:

  railway variable set GARMIN_TOKENS --stdin --service sync \
    < ~/.GarminDb/garmin_tokens.json

The volume keeps whichever token it already has, so also delete
/data/.GarminDb/garmin_tokens.json on the volume, or clear the volume, so the
new value is seeded on the next run.
WHY
  exit 1
fi

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
