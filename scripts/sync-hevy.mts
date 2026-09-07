/**
 * Run the Hevy sync by hand.
 *
 *     pnpm sync:hevy          # into local Postgres
 *
 * The scheduled path is `app/api/cron/sync-hevy`, woken weekly by the
 * `hevy-sync` service. Both call the same `syncHevy`, which is what makes them
 * equivalent rather than merely similar — the same reason `processMeal` is
 * shared by the estimate job and the sweep.
 *
 * This is the lever for when you want the numbers now: a workout logged this
 * morning that the weekly run has not reached yet.
 */
import postgres from "postgres";
import { syncHevy } from "../src/lib/hevy/sync";

const key = process.env.HEVY_API_KEY;
if (!key) {
  console.error("HEVY_API_KEY is not set. It lives in .env.local and .env.hosted.");
  process.exit(1);
}

const LOCAL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const url = process.env.DATABASE_URL ?? LOCAL;
const isLocal = url.includes("127.0.0.1") || url.includes("localhost");

// Upserting is safe against production, but a run started by hand against the
// real database should be a decision rather than an accident of which env file
// was loaded. The scheduled route needs no such prompt: it can only ever be
// woken by something holding the cron secret.
if (!isLocal && process.env.CONFIRM_REMOTE_PORT !== "yes") {
  console.error(
    "Refusing to sync into a remote database without confirmation.\n" +
      "This replaces the Hevy tables with what the API returns. If that is what you want:\n" +
      "  CONFIRM_REMOTE_PORT=yes pnpm sync:hevy",
  );
  process.exit(1);
}

console.log(`target: ${isLocal ? "local Postgres" : "REMOTE database"}\n`);

const sql = postgres(url, {
  transform: { undefined: null },
  prepare: !url.includes("pooler.supabase.com:6543"),
});

const counts = await syncHevy(sql, key);

if (counts.keptOrphans) {
  console.warn("the API returned far fewer workouts than are stored — nothing was deleted\n");
}
for (const [table, count] of Object.entries(counts)) {
  if (table !== "keptOrphans") console.log(`${table.padEnd(20)} ${String(count).padStart(6)}`);
}

await sql.end();
