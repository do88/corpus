#!/usr/bin/env bash
#
# Refresh every source of training data, once. The command the `sync` Railway
# service runs on its weekly schedule; see Dockerfile.sync.
#
# **Hevy first, deliberately.** It is a few dozen HTTP calls against a real API
# and it always works. Garmin is a scraper with an OAuth token that can expire,
# against a service that has no public API and no obligation to keep working.
# Running the reliable half first means a bad night for Garmin cannot cost you
# the half that would have succeeded — the same reasoning the laptop version
# used when a failed download skipped only its own load.
#
# Neither half stops the script. `set -e` is deliberately absent: the exit code
# is assembled at the end so one failure is reported rather than hiding whether
# the other half ran at all.
set -uo pipefail

cd "$(dirname "$0")/.."

# ---------------------------------------------------------------- Garmin setup
#
# HOME is the volume (see Dockerfile.sync), so everything written here survives
# to the next run: the token store GarminDB refreshes, and the FIT archive it
# imports from.
mkdir -p "$HOME/.GarminDb"

# Seeded once, then never touched again. Garmin's refresh tokens rotate on every
# use and GarminDB writes the new pair back here, so overwriting this file from
# the environment on each run would replay a spent token and lock you out.
if [ ! -f "$HOME/.GarminDb/garmin_tokens.json" ]; then
  if [ -n "${GARMIN_TOKENS:-}" ]; then
    printf '%s' "$GARMIN_TOKENS" > "$HOME/.GarminDb/garmin_tokens.json"
    chmod 600 "$HOME/.GarminDb/garmin_tokens.json"
    echo "seeded the Garmin token store from GARMIN_TOKENS"
  else
    echo "no token store and no GARMIN_TOKENS: Garmin will fall back to user/password" >&2
  fi
fi

# Regenerated every run, because it holds settings rather than state.
#
# The start dates are a rolling window, and that is the difference between this
# and the laptop script. Locally they reach back to 2021, which is why the
# archive is 638 MB across fifteen thousand FIT files and why an import spends
# twenty minutes walking files it has already read. The server does not need
# the history: Postgres already holds it, and `port-garmin` upserts by day, so
# a month is enough to catch anything new or revised.
WINDOW_DAYS="${GARMIN_WINDOW_DAYS:-30}"
START="$(date -u -d "${WINDOW_DAYS} days ago" +%m/%d/%Y)"

cat > "$HOME/.GarminDb/GarminConnectConfig.json" <<JSON
{
  "db": { "type": "sqlite" },
  "garmin": { "domain": "garmin.com" },
  "credentials": {
    "user": "${GARMIN_USER:-}",
    "secure_password": false,
    "password": "${GARMIN_PASSWORD:-}",
    "password_file": null
  },
  "data": {
    "weight_start_date": "${START}",
    "sleep_start_date": "${START}",
    "rhr_start_date": "${START}",
    "hrv_start_date": "${START}",
    "monitoring_start_date": "${START}",
    "download_latest_activities": 25,
    "download_all_activities": 25
  },
  "directories": {
    "relative_to_home": true,
    "base_dir": "HealthData",
    "mount_dir": "/Volumes/GARMIN"
  },
  "enabled_stats": {
    "monitoring": true, "steps": true, "itime": true, "sleep": true,
    "rhr": true, "hrv": true, "weight": true, "activities": true
  },
  "course_views": { "steps": [] },
  "modes": {},
  "activities": { "display": [] },
  "settings": { "metric": true, "default_display_activities": ["walking", "running", "cycling"] },
  "checkup": { "look_back_days": 90 }
}
JSON

# ------------------------------------------------------------------------ Hevy
hevy_ok=1
echo "==> hevy"
if pnpm exec tsx scripts/sync-hevy.mts; then
  echo "    hevy: done"
else
  hevy_ok=0
  echo "    hevy: FAILED" >&2
fi

# ---------------------------------------------------------------------- Garmin
garmin_ok=1
echo "==> garmin: download and import"
if "${GARMIN_VENV:-/opt/garmindb}/bin/python" "${GARMIN_VENV:-/opt/garmindb}/bin/garmindb_cli.py" \
     --all --download --import --analyze --latest; then
  echo "    garmin: downloaded"
  echo "==> garmin: load into Postgres"
  if pnpm exec tsx scripts/port-garmin.mts; then
    echo "    garmin: loaded"
  else
    garmin_ok=0
    echo "    garmin: load FAILED" >&2
  fi
else
  garmin_ok=0
  # A refused download is nearly always the token, and it is worth saying so
  # rather than leaving a stack trace to interpret at some later date.
  echo "    garmin: download FAILED — if this persists, re-authenticate on a" >&2
  echo "            machine that can prompt and replace GARMIN_TOKENS" >&2
fi

echo ""
echo "hevy=$([ $hevy_ok = 1 ] && echo ok || echo failed) garmin=$([ $garmin_ok = 1 ] && echo ok || echo failed)"
[ "$hevy_ok" = 1 ] && [ "$garmin_ok" = 1 ]
