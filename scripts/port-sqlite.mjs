/**
 * One-time port of Alpha 1's SQLite database into local Postgres.
 *
 *     node scripts/port-sqlite.mjs [path/to/hevy.db]
 *
 * Row-for-row and column-for-column: nothing is recomputed, filtered or
 * renamed. That is the point — the verification gate compares query output
 * between the two databases, and it can only attribute a difference to the SQL
 * port if the data underneath is known to be identical.
 *
 * SQLite is read through Node's built-in `node:sqlite` rather than a driver.
 * The app never touches SQLite — this is the one place that reads the old file
 * — so pulling in a native binding for it would put a node-gyp compile in the
 * Netlify build for the sake of a script that only ever runs on this machine.
 *
 * **It truncates every training table first, `profile` included.** Anything
 * edited in Postgres since the last port — a corrected height, say — is
 * overwritten by whatever Alpha 1's file still says. Re-check `profile` after
 * running it.
 *
 * The only transformations are the ones the types force:
 *
 *   TEXT date          -> date          ('' and NULL both become NULL)
 *   TEXT timestamp     -> timestamptz   (Hevy sends ISO 8601)
 *   TEXT holding JSON  -> jsonb
 *   INTEGER 0/1        -> boolean
 */
import { DatabaseSync } from "node:sqlite";
import postgres from "postgres";
import path from "node:path";
import fs from "node:fs";

const SQLITE = process.argv[2] ?? "/Users/dmitryosipchuk/Sites DO/hevy/data/hevy.db";

// Local unless DATABASE_URL says otherwise. This TRUNCATEs before loading, so
// pointing it somewhere by accident is destructive — hence the explicit
// acknowledgement below rather than a silent default to whatever is in the env.
const LOCAL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const PG = process.env.DATABASE_URL ?? LOCAL;
const isLocal = PG.includes("127.0.0.1") || PG.includes("localhost");

if (!isLocal && process.env.CONFIRM_REMOTE_PORT !== "yes") {
  console.error(
    "Refusing to load into a remote database without confirmation.\n" +
      "This truncates every training table before loading. If that is what you want:\n" +
      "  CONFIRM_REMOTE_PORT=yes DATABASE_URL=... node scripts/port-sqlite.mjs",
  );
  process.exit(1);
}
console.log(`target: ${isLocal ? "local Postgres" : "REMOTE database"}\n`);

if (!fs.existsSync(SQLITE)) {
  console.error(`No SQLite database at ${SQLITE}`);
  process.exit(1);
}

/** Column-level coercions, keyed by table. Anything unlisted is passed through. */
const JSON_COLUMNS = {
  exercise_templates: ["secondary_muscle_groups"],
  routines: ["raw"],
  routine_folders: ["raw"],
  body_measurements: ["raw"],
};
const BOOL_COLUMNS = { exercise_templates: ["is_custom"] };
const EMPTY_IS_NULL = ["date", "start_time", "end_time", "created_at", "updated_at"];

// Order matters only for readability — there are no foreign keys to satisfy.
const TABLES = [
  "workouts", "workout_exercises", "sets", "exercise_templates",
  "routines", "routine_folders", "body_measurements",
  "activities", "body_composition", "profile",
];

const sqlite = new DatabaseSync(SQLITE, { readOnly: true });
// Same pooler caveat as src/lib/db.ts: statements prepared on one connection
// may execute on another, so prepared statements have to be off.
const sql = postgres(PG, {
  transform: { undefined: null },
  prepare: !PG.includes("pooler.supabase.com:6543"),
});

function coerce(table, column, value) {
  if (value === null || value === undefined) return null;
  if (EMPTY_IS_NULL.includes(column) && value === "") return null;
  if (JSON_COLUMNS[table]?.includes(column)) {
    // Stored as a JSON string in SQLite; hand postgres.js a real object so it
    // binds as jsonb rather than a quoted string.
    try {
      return sql.json(JSON.parse(value));
    } catch {
      return sql.json(value);
    }
  }
  if (BOOL_COLUMNS[table]?.includes(column)) return Boolean(value);
  return value;
}

let total = 0;
for (const table of TABLES) {
  const rows = sqlite.prepare(`SELECT * FROM "${table}"`).all();
  if (rows.length === 0) {
    console.log(`${table.padEnd(20)} ${"0".padStart(6)}`);
    continue;
  }
  const columns = Object.keys(rows[0]);
  const payload = rows.map((row) =>
    Object.fromEntries(columns.map((c) => [c, coerce(table, c, row[c])])),
  );

  await sql`truncate table ${sql(table)}`;
  // postgres.js builds a multi-row INSERT from the array; chunked so a large
  // table doesn't blow past the parameter limit.
  for (let i = 0; i < payload.length; i += 500) {
    await sql`insert into ${sql(table)} ${sql(payload.slice(i, i + 500), columns)}`;
  }

  const [{ count }] = await sql`select count(*)::int as count from ${sql(table)}`;
  const match = count === rows.length ? "" : `  MISMATCH (sqlite had ${rows.length})`;
  console.log(`${table.padEnd(20)} ${String(count).padStart(6)}${match}`);
  total += count;
}

console.log(`\n${total} rows in ${path.basename(SQLITE)} -> ${isLocal ? "local Postgres" : "the remote database"}`);
sqlite.close();
await sql.end();
