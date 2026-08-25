import { fmtPace, longDate, longMonth, longQuarter, shortDay, shortMonth, weekOf } from "./format";
import {
  BMI_THRESHOLDS,
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
import { planDay, proteinDensityBudget } from "./nutrition";
import {
  MAIN_LIFTS,
  getBodyReadings,
  getHeadline,
  getKneeLoadByWeek,
  getLiftSummary,
  getMuscleBalance,
  getProfile,
  getRecentSessions,
  getRuns,
  getSessionsByMonth,
  getStrengthByQuarter,
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
 */
export async function getDashboardData() {
  // Every query below is independent, so they all go at once. Awaited one at a
  // time this took 1.9 s warm — fifteen sequential round trips to the database,
  // which is a page that feels broken rather than slow. Nothing here reads
  // another's result; the sequence was habit, not a dependency.
  const [
    profile,
    readings,
    headline,
    lifts,
    runs,
    months,
    knee,
    muscles,
    weightHistory,
    strengthSeries,
    recentSessions,
  ] = await Promise.all([
    getProfile(),
    getBodyReadings(),
    getHeadline(),
    getLiftSummary(),
    getRuns(),
    getSessionsByMonth(24),
    getKneeLoadByWeek(26),
    getMuscleBalance(12),
    getWeightHistory(),
    getStrengthByQuarter(),
    getRecentSessions(6),
  ]);

  const heightCm = Number(profile.height_cm ?? 193);
  const age = Number(profile.age_at_latest_reading ?? 37);
  const latest = readings[0];

  const energy = estimateEnergy(latest.weight_kg, heightCm, age);
  const leanIndex = ffmi(latest.fat_free_mass_kg, heightCm);
  const currentYear = String(new Date().getFullYear());
  const target = compositionTargets(latest.fat_free_mass_kg, latest.skeletal_muscle_kg);
  const round1 = (n: number) => Math.round(n * 10) / 10;

  const kneeSeries = knee.map((k) => ({
    week: shortDay(k.week_start),
    reps: k.knee_reps,
    fullLabel: weekOf(k.week_start),
    detail: k.breakdown ?? (k.run_km ? "no knee-loading lifts" : ""),
    runKm: k.run_km,
  }));

  return {
    profile: {
      name: profile.name ?? "Training",
      heightCm,
      age,
      readingDate: latest.date,
    },

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

    knee: (() => {
      const reps = kneeSeries.map((k) => k.reps).sort((a, b) => a - b);
      return {
        series: kneeSeries,
        peak: reps.at(-1) ?? 0,
        // Median, not mean — a couple of very heavy weeks skew the average.
        median: reps.length ? reps[Math.floor(reps.length / 2)] : 0,
      };
    })(),

    load: {
      sessions: months.map((m) => ({
        month: shortMonth(m.month),
        sessions: m.sessions,
        fullLabel: longMonth(m.month),
        detail: `${m.volume_t} t moved`,
      })),
      volume: months.map((m) => ({
        month: shortMonth(m.month),
        volume: m.volume_t,
        fullLabel: longMonth(m.month),
        detail: `${m.sessions} session${m.sessions === 1 ? "" : "s"}`,
      })),
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

    bmi: {
      series: weightHistory.map((w) => ({
        date: w.date,
        bmi: round1(bmi(w.weight_kg, heightCm)),
        fullLabel: longDate(w.date),
        detail: `${w.weight_kg} kg`,
      })),
      thresholds: [
        { value: BMI_THRESHOLDS.overweight, label: "overweight", tone: "warning" as const },
        { value: BMI_THRESHOLDS.obese, label: "obese", tone: "serious" as const },
      ],
      current: round1(bmi(latest.weight_kg, heightCm)),
      atTarget: round1(bmi(target.weightNear, heightCm)),
      atGoal: round1(bmi(target.weightLong, heightCm)),
    },

    nutrition: (() => {
      const kcal = energy.light - 500;
      const protein = proteinTarget(latest.fat_free_mass_kg).target;
      return {
        targets: { kcal, protein },
        plan: planDay(kcal, protein),
        budget: proteinDensityBudget(kcal, protein),
      };
    })(),

    running: {
      all: runs,
      recent: runs.slice(-12).map((r) => ({
        date: r.date,
        km: r.distance_km,
        fullLabel: longDate(r.date),
        detail: `${Math.round(r.duration_min)} min · ${fmtPace(r.pace)} · ${r.avg_hr} bpm · ${r.calories} kcal`,
      })),
      table: runs.slice(-6).reverse(),
      thisYear: runs.filter((r) => r.date >= `${currentYear}-01-01`).length,
    },

    sessions: recentSessions,
  };
}

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;
