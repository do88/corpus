import { unstable_cache } from "next/cache";
import { longDate, longQuarter, shortDay, weekOf } from "./format";
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
import {
  MAIN_LIFTS,
  getBodyReadings,
  getHeadline,
  getLiftSummary,
  getMuscleBalance,
  getProfile,
  getRecentSessions,
  getRestingHrByMonth,
  getStrengthByQuarter,
  getWatchSummary,
  getWeeklyMovement,
  getWeeklySleep,
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
 * Exported uncached as well as wrapped, because `unstable_cache` throws
 * outside a Next request — it needs an incremental cache that only exists
 * there. `check:dashboard` and `time-dashboard` run under tsx with no Next
 * around them, and they want the real queries anyway: a smoke check answered
 * from cache proves nothing about the database.
 */
export async function buildDashboardData() {
  // Every query below is independent, so they all go at once. Awaited one at a
  // time this took 1.9 s warm — fifteen sequential round trips to the database,
  // which is a page that feels broken rather than slow. Nothing here reads
  // another's result; the sequence was habit, not a dependency.
  const [
    profile,
    readings,
    headline,
    lifts,
    muscles,
    weightHistory,
    strengthSeries,
    recentSessions,
    movement,
    restingHr,
    sleep,
    watch,
  ] = await Promise.all([
    getProfile(),
    getBodyReadings(),
    getHeadline(),
    getLiftSummary(),
    getMuscleBalance(12),
    getWeightHistory(),
    getStrengthByQuarter(),
    getRecentSessions(6),
    getWeeklyMovement(12),
    getRestingHrByMonth(18),
    getWeeklySleep(12),
    getWatchSummary(),
  ]);

  const heightCm = Number(profile.height_cm ?? 195);
  const age = Number(profile.age_at_latest_reading ?? 37);
  const latest = readings[0];

  const energy = estimateEnergy(latest.weight_kg, heightCm, age);
  const leanIndex = ffmi(latest.fat_free_mass_kg, heightCm);
  const target = compositionTargets(latest.fat_free_mass_kg, latest.skeletal_muscle_kg);
  const round1 = (n: number) => Math.round(n * 10) / 10;

  return {
    headline,

    body: {
      latest,
      leanIndex,
      bodyFat: judgeBodyFat(latest.body_fat_pct),
      visceralFat: judgeVisceralFat(latest.visceral_fat),
      cadence: judgeCadence(headline.last_28, headline.prev_28),
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

    strength: {
      lifts,
      series: strengthSeries.map((p) => ({
        ...p,
        fullLabel: longQuarter(String(p.period)),
      })),
      definitions: MAIN_LIFTS,
    },

    muscles: {
      rows: muscles.slice(0, 10),
      max: muscles[0]?.sets ?? 1,
    },

    weight: {
      series: weightHistory.map((w) => ({
        date: w.date,
        kg: w.weight_kg,
        fullLabel: longDate(w.date),
      })),
      // Ideal weight falls out of holding lean mass — same arithmetic as the
      // composition targets, so the two panels can never disagree.
      targets: [
        { value: round1(target.weightNear), label: `${target.bodyFatNear}% BF`, tone: "warning" as const },
        { value: round1(target.weightLong), label: `${target.bodyFatLong}% BF`, tone: "good" as const },
      ],
    },

    // Only `current` — the Body section quotes it in its note. The series,
    // thresholds and projected values fed a BMI chart that no section renders.
    bmi: { current: round1(bmi(latest.weight_kg, heightCm)) },

    /*
      What the watch adds. Three series and a thirty-day summary, all
      calendar-keyed rather than workout-keyed, because a week you did not
      lift is still a week you moved, slept and had a pulse.

      Sleep is hours and minutes awake, deliberately not Garmin's score. With
      a baby in the house the score will read "poor" for the foreseeable, and
      a red panel every morning about something outside your control is
      noise; awake minutes coming back down over months is the number worth
      watching.
    */
    watch: {
      summary: watch,
      movement: movement.map((w) => ({
        week: shortDay(w.week_start),
        minutes: w.who_minutes,
        sessions: w.sessions,
        fullLabel: weekOf(w.week_start),
        detail: `${w.sessions} session${w.sessions === 1 ? "" : "s"} · ${w.moderate} moderate + ${w.vigorous} vigorous min · ${w.steps.toLocaleString("en-GB")} steps a day`,
      })),
      restingHr: restingHr.map((m) => ({
        month: m.month,
        bpm: m.rhr,
        fullLabel: longQuarter(m.month).replace(/^Q\d /, "") || m.month,
      })),
      sleep: sleep.map((w) => ({
        week: shortDay(w.week_start),
        hours: w.hours,
        awake: w.awake_min,
        fullLabel: weekOf(w.week_start),
        detail: `${w.awake_min} min awake · ${w.nights} nights`,
      })),
    },

    sessions: recentSessions,
  };
}

/**
 * Cached for an hour.
 *
 * The training tables are loaded by hand — `scripts/port-sqlite.mjs`, run once
 * against the hosted database — so these numbers change when someone
 * deliberately changes them, never while anyone is looking. Recomputing a
 * dozen multi-CTE queries per view to redraw figures that have not moved since
 * August is work for nothing, and on a pooled connection it is the slowest
 * thing either screen does.
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
