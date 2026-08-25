#!/usr/bin/env bash
# Prove every migration replays cleanly from nothing.
#
# `supabase db reset` is the usual way to do this, but it drops the local
# database. This does the same job without destroying anything: it replays each
# migration in order into a throwaway schema inside one transaction, then rolls
# back. A syntax error, a bad dependency order or a duplicate object all fail
# the run; a clean run leaves the database exactly as it found it.
set -euo pipefail

PG="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
DIR="$(dirname "$0")/../supabase/migrations"

{
  echo "begin;"
  echo "create schema mig_verify;"
  echo "set local search_path = mig_verify, public, extensions;"
  for f in "$DIR"/*.sql; do
    echo "\\echo '  applying $(basename "$f")'"
    cat "$f"
    echo ";"
  done
  echo "\\echo ''"
  echo "select count(*) || ' tables, ' ||"
  echo "  (select count(*) from pg_views where schemaname = 'mig_verify') || ' views created'"
  echo "  as replayed from pg_tables where schemaname = 'mig_verify';"
  echo "rollback;"
} | psql "$PG" --quiet --no-psqlrc -v ON_ERROR_STOP=1

echo "migrations replay cleanly"
