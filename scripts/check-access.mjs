/**
 * Check what the signed-in role can actually do, against whichever database
 * DATABASE_URL points at.
 *
 *     pnpm check:access                 # local
 *     DATABASE_URL=<hosted> pnpm check:access
 *
 * This exists because a production outage got past every check I had. Postgres
 * gates access twice — a GRANT decides whether a role may touch a table, RLS
 * decides which rows it sees — and only the second was being tested. The grants
 * were present locally and absent on the hosted project, because the two apply
 * different default privileges, so the difference was invisible until a real
 * sign-in hit "permission denied for table meal_log".
 *
 * Every assertion here runs as `authenticated` with the owner's email in the
 * JWT claims, which is exactly what the app is at runtime.
 */
import postgres from "postgres";

const CONNECTION =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const OWNER = "dmitryosipchuk@gmail.com";

const sql = postgres(CONNECTION, {
  prepare: !CONNECTION.includes("pooler.supabase.com:6543"),
  max: 1,
});

const READABLE = [
  "workouts", "workout_exercises", "sets", "exercise_templates",
  "routines", "routine_folders", "body_measurements",
  "activities", "body_composition", "profile",
  "v_sets", "v_workouts", "meal_log",
];

const target = CONNECTION.includes("127.0.0.1") ? "local" : "remote";
console.log(`checking ${target}\n`);

let failures = 0;

/** Run a statement as the signed-in owner, exactly as the app would. */
async function asOwner(run) {
  return sql.begin(async (tx) => {
    await tx`set local role authenticated`;
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ email: OWNER })}, true)`;
    return run(tx);
  });
}

for (const table of READABLE) {
  try {
    await asOwner((tx) => tx`select 1 from ${tx(table)} limit 1`);
    console.log(`  ok    select ${table}`);
  } catch (error) {
    failures += 1;
    console.log(`  FAIL  select ${table} — ${error.message}`);
  }
}

// The app writes exactly one table. Rolled back, so nothing is left behind.
try {
  await asOwner(async (tx) => {
    const [row] = await tx`
      insert into meal_log (local_date, status, note)
      values (current_date, 'pending', 'access check')
      returning id`;
    await tx`update meal_log set note = 'access check 2' where id = ${row.id}`;
    await tx`delete from meal_log where id = ${row.id}`;
    throw new Rollback();
  });
} catch (error) {
  if (error instanceof Rollback) {
    console.log("  ok    insert/update/delete meal_log");
  } else {
    failures += 1;
    console.log(`  FAIL  write meal_log — ${error.message}`);
  }
}

// An unauthenticated caller must be refused, not quietly handed nothing.
try {
  await sql.begin(async (tx) => {
    await tx`set local role anon`;
    await tx`select 1 from meal_log limit 1`;
  });
  failures += 1;
  console.log("  FAIL  anon could read meal_log");
} catch {
  console.log("  ok    anon refused");
}

function Rollback() {
  this.message = "rollback";
}
Rollback.prototype = Object.create(Error.prototype);

console.log(failures === 0 ? "\naccess is correct" : `\n${failures} problem(s)`);
await sql.end();
process.exit(failures === 0 ? 0 : 1);
