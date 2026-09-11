import { unstable_cache } from "next/cache";
import { longDate } from "./format";
import {
  REFERENCE,
  bmi,
  compositionTargets,
  estimateEnergy,
  ffmi,
  proteinTarget,
  judgeBodyFat,
  judgeCadence,
  judgeVisceralFat,
  weeksToTarget,
} from "./metrics";
import { strengthMeter } from "./strength";
import { weightChange } from "./weight";
import {
  getBodyReadings,
  getCadence,
  getLiftSummary,
  getMuscleBalance,
  getProfile,
  getWatchSummary,
  getWeightHistory,
} from "../queries";

/**
 * Assembles one typed view model for the dashboard. Everything the page needs
 * is computed here — the section components receive plain props and render.
 *
 * Ported from Alpha 1 with one change: the queries are async now, because
 * Postgres is over a socket where SQLite was a file. The arithmetic below is
 * untouched, which is the point — `metrics.ts` and its 49 tests came across
 * unmodified, so the numbers on this dashboard are the same numbers.
 *
 * It asks only for what the page draws. The quarterly strength series, the
 * recent-sessions list and the watch's weekly series all went with the
 * sections that drew them, and so did the lifetime headline, which no
 * section quoted any more. Their queries stay in `queries.ts`: several are
 * in db:gate's diff against Alpha 1, and the advisor reads recent sessions.
 *
 * Exported uncached as well as wrapped, because `unstable_cache` throws
 * outside a Next request — it needs an incremental cache that only exists
 * there. `check:dashboard` runs under tsx with no Next around it, and it
 * wants the real queries anyway: a smoke check answered from cache proves
 * nothing about the database.
 */
/**
 * "All time" for the muscle figure. A hundred years rather than a special
 * case, so the query is the same query with a wider window — the log starts
 * in 2021, and nothing about this app will outlive the constant.
 */
const ALL_TIME_MONTHS = 1200;

export async function buildDashboardData() {
  // Every query below is independent, so they all go at once. Awaited one at a
  // time this took 1.9 s warm — sequential round trips to the database, which
  // is a page that feels broken rather than slow. Nothing here reads another's
  // result; the sequence was habit, not a dependency.
  const [profile, readings, cadence, lifts, muscles, musclesAll, weightHistory, watch] = await Promise.all([
    getProfile(),
    getBodyReadings(),
    getCadence(),
    getLiftSummary(),
    getMuscleBalance(12),
    getMuscleBalance(ALL_TIME_MONTHS),
    getWeightHistory(),
    getWatchSummary(),
  ]);

  const heightCm = Number(profile.height_cm ?? 195);
  const age = Number(profile.age_at_latest_reading ?? 37);
  const latest = readings[0];

  const energy = estimateEnergy(latest.weight_kg, heightCm, age);
  const leanIndex = ffmi(latest.fat_free_mass_kg, heightCm);
  const target = compositionTargets(latest.fat_free_mass_kg, latest.skeletal_muscle_kg);
  const round1 = (n: number) => Math.round(n * 10) / 10;

  const weightSeries = weightHistory.map((w) => ({
    date: w.date,
    kg: w.weight_kg,
    fullLabel: longDate(w.date),
  }));

  return {
    // Sessions against the four weeks before, both ending on the last synced
    // day — see `getCadence` for why neither today nor the last workout.
    cadence: {
      ...cadence,
      judged: judgeCadence(cadence.last_28, cadence.prev_28),
    },

    body: {
      latest,
      leanIndex,
      bodyFat: judgeBodyFat(latest.body_fat_pct),
      visceralFat: judgeVisceralFat(latest.visceral_fat),
      targets: {
        ...target,
        weeksToNear: weeksToTarget(latest.weight_kg, target.weightNear),
        weeksToLong: weeksToTarget(latest.weight_kg, target.weightLong),
      },
      meters: [
        {
          label: "Body fat",
          value: latest.body_fat_pct,
          max: REFERENCE.bodyFat.max,
          display: `${latest.body_fat_pct}%`,
          caption: `${(latest.body_fat_pct - target.bodyFatNear).toFixed(1)} pts over`,
          tone: judgeBodyFat(latest.body_fat_pct).status,
          target: target.bodyFatNear,
          targetLabel: `target ${target.bodyFatNear}%`,
        },
        {
          label: "Visceral fat",
          value: latest.visceral_fat,
          max: REFERENCE.visceralFat.max,
          display: String(latest.visceral_fat),
          caption: "normal is 1–9",
          tone: judgeVisceralFat(latest.visceral_fat).status,
          target: target.visceralFat,
          targetLabel: `target under ${target.visceralFat + 1}`,
        },
        {
          label: "Skeletal muscle",
          value: latest.skeletal_muscle_kg,
          max: REFERENCE.skeletalMuscle.max,
          display: `${latest.skeletal_muscle_kg} kg`,
          caption: `FFMI ${leanIndex.toFixed(1)}`,
          tone: "good" as const,
          target: target.skeletalMuscleKg,
          targetLabel: "hold",
        },
        {
          label: "Body water",
          value: latest.body_water_pct,
          max: REFERENCE.bodyWater.max,
          display: `${latest.body_water_pct}%`,
          caption: "rises as fat falls",
          tone: "good" as const,
          target: target.bodyWaterPct,
          targetLabel: `target ~${target.bodyWaterPct}%`,
        },
      ],
    },

    energy: {
      calculatedBmr: energy.bmr,
      scaleBmr: latest.bmr_kcal,
      maintenance: energy.light,
      deficitTarget: energy.light - 500,
      protein: proteinTarget(latest.fat_free_mass_kg),
    },

    // The four lifts, and the one number they add up to.
    strength: {
      lifts,
      meter: strengthMeter(lifts, latest.weight_kg),
    },

    // Both windows, every row. The figure needs all of them — a muscle ranked
    // eleventh still has a size — and the list does its own trimming. Two
    // calls rather than one wider query because getMuscleBalance is one of
    // the functions db:gate diffs against Alpha 1's own code, and changing its
    // shape would take it out of the gate for a feature that does not need it.
    muscles: {
      recent: muscles,
      all: musclesAll,
    },

    weight: {
      series: weightSeries,
      change: weightChange(weightSeries, 90),
      // Ideal weight falls out of holding lean mass — same arithmetic as the
      // composition targets, so the two panels can never disagree.
      targets: [
        { value: round1(target.weightNear), label: `${target.bodyFatNear}% BF`, tone: "warning" as const },
        { value: round1(target.weightLong), label: `${target.bodyFatLong}% BF`, tone: "good" as const },
      ],
    },

    // Only `current` — the Weight section quotes it in its note. The series,
    // thresholds and projected values fed a BMI chart that no section renders.
    bmi: { current: round1(bmi(latest.weight_kg, heightCm)) },

    /*
      What the watch adds: one thirty-day row, ending on the last day it
      synced. Sleep is hours, deliberately not Garmin's score. With a baby in
      the house the score will read "poor" for the foreseeable, and a red
      number every morning about something outside your control is noise.
    */
    watch: {
      summary: watch,
    },
  };
}

/**
 * Cached for an hour.
 *
 * The training tables change once a week, when the Monday sync runs, never
 * while anyone is looking. Recomputing a set of multi-CTE queries per view to
 * redraw figures that have not moved since Monday is work for nothing, and on
 * a pooled connection it is the slowest thing either screen does.
 *
 * Cached at the data layer rather than with route-segment `revalidate`, which
 * would prerender the page at build time — where there is no database to
 * reach. This keeps the build independent of it.
 *
 * Tagged so a re-port can drop the cache immediately with
 * `revalidateTag("training")` rather than waiting the hour out.
 */
export const getDashboardData = unstable_cache(buildDashboardData, ["training-dashboard"], {
  tags: ["training"],
  revalidate: 3600,
});

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;
