/**
 * The verification gate: every dashboard query must return the same numbers
 * from Postgres as it did from SQLite.
 *
 *     pnpm db:gate
 *
 * Alpha 1's side is produced by running *its* code, not a copy of its SQL —
 * scripts/dump-queries.ts in the old repo, executed through tsx. That is the
 * whole point: a transcription that agrees with itself proves nothing.
 *
 * A silent off-by-one in a date bucket is close to invisible once the dashboard
 * is rebuilt on top of it, so this runs before any of Phase 2.
 */
import diff from "microdiff";
import { execFileSync } from "node:child_process";
import path from "node:path";
import * as q from "../src/lib/queries";

const ALPHA1 = process.env.ALPHA1_DIR ?? "/Users/dmitryosipchuk/Sites DO/hevy";

/** Floats that survived two different engines rarely match to the last bit. */
const TOLERANCE = 0.05;

function alpha1Dump(): Record<string, unknown> {
  const out = execFileSync(
    path.join(process.cwd(), "node_modules/.bin/tsx"),
    ["--tsconfig", "scripts/tsconfig.dump.json", "scripts/dump-queries.ts"],
    { cwd: ALPHA1, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  return JSON.parse(out);
}

async function corpusDump(): Promise<Record<string, unknown>> {
  return {
    profile: await q.getProfile(),
    bodyReadings: await q.getBodyReadings(),
    weightHistory: await q.getWeightHistory(),
    headline: await q.getHeadline(),
    strengthByQuarter: await q.getStrengthByQuarter(),
    liftSummary: await q.getLiftSummary(),
    sessionsByMonth: await q.getSessionsByMonth(),
    kneeLoadByWeek: await q.getKneeLoadByWeek(),
    muscleBalance: await q.getMuscleBalance(),
    runs: await q.getRuns(),
    recentSessions: await q.getRecentSessions(),
  };
}

/**
 * postgres.js returns rows as a Result array with extra properties, and both
 * sides carry `undefined` where the other carries `null`. Round-tripping
 * through JSON flattens all of that so the diff is about values, not shapes.
 */
const plain = (value: unknown) => JSON.parse(JSON.stringify(value));

const negligible = (a: unknown, b: unknown) =>
  typeof a === "number" && typeof b === "number" && Math.abs(a - b) <= TOLERANCE;

const at = (p: (string | number)[]) => p.join(".");

const alpha1 = plain(alpha1Dump());
const corpus = plain(await corpusDump());

let failed = 0;
// Counted and reported rather than silently swallowed — a tolerance that hides
// a hundred near-misses is indistinguishable from a bug.
let tolerated = 0;
let worst = 0;

for (const key of Object.keys(alpha1)) {
  const changes = diff(alpha1[key], corpus[key]).filter((c) => {
    if (c.type === "CHANGE" && negligible(c.oldValue, c.value)) {
      tolerated += 1;
      worst = Math.max(worst, Math.abs((c.oldValue as number) - (c.value as number)));
      return false;
    }
    return true;
  });

  if (changes.length === 0) {
    console.log(`  ok    ${key}`);
    continue;
  }

  failed += changes.length;
  console.log(`  FAIL  ${key}  (${changes.length} difference(s))`);
  for (const c of changes.slice(0, 8)) {
    if (c.type === "CHANGE") {
      console.log(`          ${at(c.path)}: sqlite ${JSON.stringify(c.oldValue)} -> postgres ${JSON.stringify(c.value)}`);
    } else {
      console.log(`          ${c.type} at ${at(c.path)}: ${JSON.stringify(c.type === "CREATE" ? c.value : c.oldValue)}`);
    }
  }
  if (changes.length > 8) console.log(`          … ${changes.length - 8} more`);
}

const rounding =
  tolerated === 0
    ? "every value identical"
    : `${tolerated} value(s) differed by at most ${worst.toFixed(4)}, within the ±${TOLERANCE} tolerance`;

console.log(
  failed === 0
    ? `\nEvery query matches — ${rounding}.`
    : `\n${failed} difference(s). The port is not done. (${rounding}.)`,
);
// Exits rather than closing the pool: the connection is the only thing holding
// the event loop open, and there is nothing left to do either way.
process.exit(failed === 0 ? 0 : 1);
