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

/**
 * The photo bucket needs all four verbs, and UPDATE is the one that was
 * missing — `outbox/sync.ts` uploads with `upsert: true`, which Storage
 * implements as an UPDATE on `storage.objects`. Without a policy for it the
 * *first* upload of a photo worked and only a retry failed, so nothing noticed
 * until a connection dropped a response.
 *
 * Checked as SQL rather than through the Storage API because that is the layer
 * the policy lives at, and it needs no running Storage service to test.
 *
 * DELETE is not exercised here: Supabase puts a trigger on `storage.objects`
 * that refuses direct deletion regardless of policy, so a raw statement tests
 * the trigger rather than the grant. The delete policy is asserted below by
 * reading the catalogue instead.
 */
try {
  await asOwner(async (tx) => {
    const [row] = await tx`
      insert into storage.objects (bucket_id, name, owner)
      values ('meal-photos', 'access-check/probe.jpg', null)
      returning id`;
    // The upsert path: the same object, written a second time.
    //
    // The row count is asserted, not just the absence of an error. A missing
    // UPDATE policy does not raise — RLS simply makes no row visible to update,
    // so the statement succeeds having done nothing. Checking only for a thrown
    // error is what would let this regress silently a second time.
    const updated = await tx`
      update storage.objects set updated_at = now() where id = ${row.id} returning id`;
    if (updated.length !== 1) throw new Error("update matched no row (no UPDATE policy?)");

    const readBack = await tx`select 1 from storage.objects where id = ${row.id}`;
    if (readBack.length !== 1) throw new Error("insert is not readable back (no SELECT policy?)");

    throw new Rollback();
  });
} catch (error) {
  if (error instanceof Rollback) {
    console.log("  ok    insert/update/select meal-photos");
  } else {
    failures += 1;
    console.log(`  FAIL  meal-photos storage — ${error.message}`);
  }
}

// All four verbs must have a policy. The three above are proven by doing them;
// this catches a missing DELETE, which no statement here can reach.
try {
  const rows = await sql`
    select cmd from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and (qual like '%meal-photos%' or with_check like '%meal-photos%')`;
  const found = new Set(rows.map((r) => r.cmd));
  const missing = ["SELECT", "INSERT", "UPDATE", "DELETE"].filter((c) => !found.has(c));
  if (missing.length) {
    failures += 1;
    console.log(`  FAIL  meal-photos has no ${missing.join("/")} policy`);
  } else {
    console.log("  ok    meal-photos policies complete");
  }
} catch (error) {
  failures += 1;
  console.log(`  FAIL  could not read storage policies — ${error.message}`);
}

// The avatar bucket, same four verbs. An avatar is always an overwrite after
// the first one, so a missing UPDATE policy here would break the feature on its
// second use — the `meal-photos` bug, one bucket over.
try {
  const rows = await sql`
    select cmd from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and (qual like '%avatars%' or with_check like '%avatars%')`;
  const found = new Set(rows.map((r) => r.cmd));
  const missing = ["SELECT", "INSERT", "UPDATE", "DELETE"].filter((c) => !found.has(c));
  if (missing.length) {
    failures += 1;
    console.log(`  FAIL  avatars has no ${missing.join("/")} policy`);
  } else {
    console.log("  ok    avatars policies complete");
  }
} catch (error) {
  failures += 1;
  console.log(`  FAIL  could not read avatar policies — ${error.message}`);
}

// Both photo buckets must stay private: the paths are guessable by design.
try {
  const rows = await sql`
    select id, public from storage.buckets where id in ('meal-photos', 'avatars')`;
  const publicOnes = rows.filter((r) => r.public).map((r) => r.id);
  if (publicOnes.length) {
    failures += 1;
    console.log(`  FAIL  bucket(s) are public: ${publicOnes.join(", ")}`);
  } else {
    console.log(`  ok    ${rows.length} bucket(s) private`);
  }
} catch (error) {
  failures += 1;
  console.log(`  FAIL  could not read buckets — ${error.message}`);
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
