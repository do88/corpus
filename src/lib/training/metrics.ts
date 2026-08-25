/**
 * Domain rules — the thresholds and formulas that decide what a number *means*.
 * Deliberately free of SQL and of JSX so both the page and any future export can
 * share one definition of "high", "holding", "off peak".
 */

export type Status = "good" | "warning" | "serious" | "critical" | "neutral";

export type Judged<T = number> = {
  value: T;
  status: Status;
  label: string;
};

/* --------------------------------------------------------------- formulas */

/** Fat-free mass index — bodyweight-independent read on how much lean mass. */
export const ffmi = (fatFreeMassKg: number, heightCm: number) =>
  fatFreeMassKg / (heightCm / 100) ** 2;

/** Body Mass Index. A poor read at 193 cm with real muscle — see the caveat in the UI. */
export const bmi = (weightKg: number, heightCm: number) =>
  weightKg / (heightCm / 100) ** 2;

/** WHO BMI thresholds. Included because they are the conventional reference. */
export const BMI_THRESHOLDS = { overweight: 25, obese: 30 } as const;

/** Epley. Only meaningful for a loaded set with a rep count. */
export const epley1rm = (weightKg: number, reps: number) =>
  weightKg * (1 + reps / 30);

/** Mifflin–St Jeor, male. Independent check on the scale's own BMR estimate. */
export function estimateEnergy(weightKg: number, heightCm: number, age: number) {
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
  return {
    bmr: Math.round(bmr),
    sedentary: Math.round(bmr * 1.2),
    light: Math.round(bmr * 1.375),
    moderate: Math.round(bmr * 1.55),
  };
}

/* -------------------------------------------------------------- judgements */

/** Body-fat bands for men aged 20–39 (ACE / ACSM style ranges). */
export function judgeBodyFat(pct: number): Judged {
  if (pct < 8) return { value: pct, status: "warning", label: "Very lean" };
  if (pct <= 20) return { value: pct, status: "good", label: "In range" };
  if (pct <= 25) return { value: pct, status: "warning", label: "Above range" };
  return { value: pct, status: "serious", label: "Above range" };
}

/** RENPHO's visceral index: 1–9 normal, 10–14 high, 15+ very high. */
export function judgeVisceralFat(index: number): Judged {
  if (index <= 9) return { value: index, status: "good", label: "Normal" };
  if (index <= 14) return { value: index, status: "warning", label: "High" };
  return { value: index, status: "critical", label: "Very high" };
}

/** Training cadence, this 28 days against the previous 28. */
export function judgeCadence(current: number, previous: number): Judged {
  if (current >= previous) return { value: current, status: "good", label: "Holding" };
  if (current >= previous - 1) return { value: current, status: "neutral", label: "Steady" };
  return { value: current, status: "warning", label: "Down" };
}

/** How close a lift sits to its own all-time best. */
export function judgePctOfPeak(pct: number | null): Status {
  if (pct == null) return "neutral";
  if (pct >= 98) return "good";
  if (pct >= 90) return "neutral";
  return "serious";
}

/**
 * Heart-rate zone for a run. Ordinal, so it gets the sequential ramp rather
 * than status colours — and the zone label always travels with the colour.
 * Default max is the highest HR actually recorded, falling back to 220 − age.
 */
export function hrZone(avgHr: number | null, maxHr = 183) {
  if (!avgHr) return null;
  const pct = avgHr / maxHr;
  if (pct < 0.6) return { zone: 1, label: "Z1 easy", step: "var(--seq-250)" };
  if (pct < 0.7) return { zone: 2, label: "Z2 aerobic", step: "var(--seq-400)" };
  if (pct < 0.8) return { zone: 3, label: "Z3 tempo", step: "var(--seq-450)" };
  if (pct < 0.9) return { zone: 4, label: "Z4 threshold", step: "var(--seq-550)" };
  return { zone: 5, label: "Z5 max", step: "var(--seq-650)" };
}

/* ----------------------------------------------------------------- targets */

/**
 * Where the numbers should be heading.
 *
 * Body-fat targets are expressed as a bodyweight by holding fat-free mass
 * constant — which is the whole point of keeping two strength sessions a week.
 * Lose fat, hold the 79 kg lean frame, and the target weight falls out of the
 * arithmetic rather than being a number picked off a chart.
 */
export function compositionTargets(fatFreeMassKg: number, skeletalMuscleKg: number) {
  const weightAt = (bodyFatPct: number) => fatFreeMassKg / (1 - bodyFatPct / 100);
  return {
    /** Top of the "above range" band — the first meaningful milestone. */
    bodyFatNear: 25,
    /** Top of the healthy range for a man under 40. */
    bodyFatLong: 20,
    weightNear: weightAt(25),
    weightLong: weightAt(20),
    /** Back inside the normal 1–9 band. Visceral fat moves early and fast. */
    visceralFat: 9,
    /** Hold, do not grow. Losing this is the failure mode of a deficit. */
    skeletalMuscleKg,
    /** Rises on its own as fat mass falls; not something to chase directly. */
    bodyWaterPct: 55,
  };
}

export type CompositionTargets = ReturnType<typeof compositionTargets>;

/**
 * Protein is set per kg of *lean* mass, not bodyweight. At 30% body fat the
 * bodyweight-based rules of thumb overshoot badly — fat tissue has no protein
 * requirement. 2.0–2.4 g/kg of fat-free mass is the range that holds muscle
 * through a deficit; the midpoint is the number to aim at.
 */
export const PROTEIN_G_PER_KG_LEAN = { low: 2.0, target: 2.2, high: 2.4 } as const;

/** Protein contributes 4 kcal per gram. */
export const KCAL_PER_G_PROTEIN = 4;

export function proteinTarget(fatFreeMassKg: number) {
  const grams = (perKg: number) => Math.round(fatFreeMassKg * perKg);
  const target = grams(PROTEIN_G_PER_KG_LEAN.target);
  return {
    low: grams(PROTEIN_G_PER_KG_LEAN.low),
    target,
    high: grams(PROTEIN_G_PER_KG_LEAN.high),
    kcal: target * KCAL_PER_G_PROTEIN,
    perKgLean: PROTEIN_G_PER_KG_LEAN.target,
  };
}

/** Weeks to a target weight at a given rate. 0.5 kg/week preserves muscle. */
export const weeksToTarget = (current: number, target: number, perWeek = 0.5) =>
  Math.max(0, Math.round((current - target) / perWeek));

/* ------------------------------------------------------------- references */

/** Reference ranges shown as meter captions, kept beside the thresholds. */
export const REFERENCE = {
  bodyFat: { max: 40, caption: "Healthy range for a 37-year-old man is roughly 11–22%." },
  visceralFat: { max: 20, caption: "1–9 is normal. This is the number worth moving first." },
  skeletalMuscle: { max: 70 },
  bodyWater: { max: 70, caption: "Normal range 50–65%. Reads low when dehydrated." },
} as const;

