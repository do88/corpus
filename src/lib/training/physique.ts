/**
 * Sets per muscle, as the proportions of a figure.
 *
 * The Body page's 3D figure grows each muscle with how much it has been
 * trained. Everything that decides a size lives here, as plain arithmetic with
 * tests, so the three.js component only draws what it is handed — the same
 * split as the rest of this dashboard, where no component decides what a
 * number means.
 *
 * ## Sets, not tonnage
 *
 * A set is the unit, not kilograms moved. Tonnage would make the legs enormous
 * whatever the programme was — a squat moves several times the weight of a
 * curl — and the figure would be a picture of which lifts are heavy rather than
 * of where the work went. Sets per muscle is also the measure the
 * hypertrophy literature actually uses.
 *
 * ## Radius from the square root
 *
 * Treating sets as a muscle's cross-sectional area makes its radius the square
 * root of its share, which is both defensible and legible: a muscle with a
 * quarter of the top muscle's sets is drawn at half its extra girth, not a
 * quarter. Linear scaling left everything outside the top three looking
 * absent; the cube root (sets as volume) flattened the differences until the
 * figure stopped saying anything.
 *
 * Bounded to 0.5–1.9 of each muscle's resting size. A muscle never trained is
 * still drawn, small, because a figure with a hole where the calves should be
 * says "missing data" when the true statement is "never trained".
 *
 * The top end is a homunculus on purpose. At 1.5 the figure was a plausible
 * body with some muscles a little larger, and a plausible body is the thing
 * you read as a person rather than as a chart — the eye forgives the
 * differences. Pushed to nearly double, the most-trained muscles are
 * grotesque in exactly the way the cortical homunculus is, and that is what
 * makes the proportions impossible to miss.
 *
 * ## What is not on the figure
 *
 * Hevy files some exercises under `full_body`, `cardio` and `other`. None of
 * those is a place on a body, and spreading them across every muscle would be
 * inventing where the work went. They stay in the list and stay off the
 * figure — and they do not set the scale either, or a heavy month of burpees
 * would shrink every real muscle.
 *
 * Only the primary muscle counts. Hevy has a secondary-muscle field, but in
 * this data it is empty on every template, so half-credit for secondaries
 * would be a rule with nothing to apply to.
 */

export type MuscleSets = { muscle: string; sets: number; pct?: number };

/** Hevy's muscle groups that are a place on a body, head to foot. */
export const BODY_MUSCLES = [
  "neck",
  "traps",
  "shoulders",
  "chest",
  "lats",
  "upper_back",
  "lower_back",
  "abdominals",
  "biceps",
  "triceps",
  "forearms",
  "glutes",
  "abductors",
  "adductors",
  "quadriceps",
  "hamstrings",
  "calves",
] as const;

export type BodyMuscle = (typeof BODY_MUSCLES)[number];

export const MIN_SCALE = 0.5;
export const MAX_SCALE = 1.9;

/** Canvas height, here rather than in the model so the lazy placeholder can
 *  hold the same space without importing three.js to learn a number. */
export const FIGURE_HEIGHT = 400;

export type MuscleShape = {
  sets: number;
  /** 0 to 1: the square root of this muscle's share of the top muscle. */
  share: number;
  /** MIN_SCALE to MAX_SCALE: the multiplier on the muscle's resting size. */
  scale: number;
};

export type Physique = Record<BodyMuscle, MuscleShape>;

function isBodyMuscle(muscle: string): muscle is BodyMuscle {
  return (BODY_MUSCLES as readonly string[]).includes(muscle);
}

export function physique(rows: readonly MuscleSets[]): Physique {
  const sets = new Map<BodyMuscle, number>();
  for (const row of rows) {
    if (isBodyMuscle(row.muscle)) sets.set(row.muscle, (sets.get(row.muscle) ?? 0) + row.sets);
  }
  // Zero when nothing has been logged, and the share guard below turns that
  // into a figure at resting size rather than a figure made of NaN.
  const max = Math.max(0, ...sets.values());

  const shape = {} as Physique;
  for (const muscle of BODY_MUSCLES) {
    const n = sets.get(muscle) ?? 0;
    const share = max > 0 ? Math.sqrt(n / max) : 0;
    shape[muscle] = { sets: n, share, scale: MIN_SCALE + (MAX_SCALE - MIN_SCALE) * share };
  }
  return shape;
}

/** The rows the figure leaves out, for the sentence that says so. */
export function offFigure(rows: readonly MuscleSets[]): MuscleSets[] {
  return rows.filter((row) => !isBodyMuscle(row.muscle) && row.sets > 0);
}

export function muscleName(muscle: string): string {
  return muscle.replaceAll("_", " ");
}

/**
 * The figure in words, for anyone who cannot see it turn. The ranked list
 * below it is the full table; this is the one-line summary a screen reader
 * gets when it reaches the canvas.
 */
export function describePhysique(shape: Physique, count = 3): { largest: string[]; smallest: string[] } {
  const ranked = BODY_MUSCLES.map((muscle) => ({ muscle, sets: shape[muscle].sets })).sort(
    (a, b) => b.sets - a.sets || a.muscle.localeCompare(b.muscle),
  );
  return {
    largest: ranked.filter((m) => m.sets > 0).slice(0, count).map((m) => muscleName(m.muscle)),
    smallest: ranked.slice(-count).reverse().map((m) => muscleName(m.muscle)),
  };
}
