/**
 * Port GarminDB's SQLite into Postgres.
 *
 *     pnpm port:garmin [path/to/garmin.db]
 *
 * Reads the `garmin.db` that `garmindb_cli.py` writes under ~/HealthData/DBs
 * and upserts two tables: `garmin_daily` from its `daily_summary`, and
 * `garmin_sleep` from its `sleep`. The column mapping lives in
 * src/lib/garmin/convert.ts, which is tested; this file is the plumbing.
 *
 * Additive, unlike the Hevy port. Rows are replaced by day, so running it
 * after `garmindb_cli.py --latest` adds the new days and rewrites any Garmin
 * has revised, and nothing else in the database is touched. That is also why
 * it is safe to point at the hosted project: the worst a bad run can do is
 * write wrong Garmin days, which the next run overwrites.
 *
 * Reads SQLite through Node's built-in `node:sqlite`, for the same reason the
 * Hevy port does — no native driver in the hosted build for a script that
 * only ever runs on this machine.
 */
import { DatabaseSync } from "node:sqlite";
import postgres from "postgres";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { toDaily, toSleep } from "../src/lib/garmin/convert";

const SQLITE = process.argv[2] ?? path.join(os.homedir(), "HealthData", "DBs", "garmin.db");

const LOCAL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const PG = process.env.DATABASE_URL ?? LOCAL;
const isLocal = PG.includes("127.0.0.1") || PG.includes("localhost");

if (!isLocal && process.env.CONFIRM_REMOTE_PORT !== "yes") {
  console.error(
    "Refusing to write to a remote database without confirmation.\n" +
      "This upserts Garmin days and touches nothing else. If that is what you want:\n" +
      "  CONFIRM_REMOTE_PORT=yes DATABASE_URL=... pnpm port:garmin",
  );
  process.exit(1);
}

if (!fs.existsSync(SQLITE)) {
  console.error(
    `No GarminDB database at ${SQLITE}\n` +
      "Run `garmindb_cli.py --all --download --import --analyze` first, or pass the path.",
  );
  process.exit(1);
}

console.log(`source: ${SQLITE}\ntarget: ${isLocal ? "local Postgres" : "REMOTE database"}\n`);

const sqlite = new DatabaseSync(SQLITE, { readOnly: true });
const sql = postgres(PG, {
  transform: { undefined: null },
  prepare: !PG.includes("pooler.supabase.com:6543"),
});

type Row = Record<string, unknown>;

async function port<T extends { day: string }>(
  source: string,
  target: string,
  convert: (row: Row) => T | null,
) {
  const rows = sqlite.prepare(`SELECT * FROM "${source}"`).all() as Row[];
  const converted = rows.map(convert).filter((r): r is T => r !== null);
  const skipped = rows.length - converted.length;

  if (converted.length === 0) {
    console.log(`${target.padEnd(14)} ${"0".padStart(6)}  (nothing in ${source})`);
    return 0;
  }

  // Widened for postgres.js's helper, whose row typing does not survive a
  // generic T; the shape is checked where the rows are built, in convert.ts.
  const payload = converted as unknown as Record<string, string | number | null>[];
  const columns = Object.keys(payload[0]);
  const days = converted.map((r) => r.day);

  // Replace-by-day inside one transaction: the delete and the insert land
  // together or not at all, so a failure mid-way cannot leave a day missing.
  await sql.begin(async (tx) => {
    await tx`delete from ${tx(target)} where day = any(${days}::date[])`;
    for (let i = 0; i < payload.length; i += 500) {
      await tx`insert into ${tx(target)} ${tx(payload.slice(i, i + 500), columns)}`;
    }
  });

  const [{ count }] = await sql`select count(*)::int as count from ${sql(target)}`;
  const note = skipped ? `  (${skipped} source rows had no usable day)` : "";
  console.log(`${target.padEnd(14)} ${String(converted.length).padStart(6)} upserted, ${count} total${note}`);
  return converted.length;
}

let total = 0;
total += await port("daily_summary", "garmin_daily", toDaily);
total += await port("sleep", "garmin_sleep", toSleep);

console.log(`\n${total} rows from ${path.basename(SQLITE)} -> ${isLocal ? "local Postgres" : "the remote database"}`);
sqlite.close();
await sql.end();
