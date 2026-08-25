export type GlossaryEntry = {
  term: string;
  body: string;
  /** Rendered as a list — use when the definition is a set of bands or ranges. */
  bullets?: readonly string[];
  footer?: string;
};

/**
 * Plain-English definitions for the jargon on the dashboard. Kept beside the
 * domain rules rather than inline in components, so a term is defined once and
 * every place that shows it stays consistent.
 *
 * `satisfies` rather than an annotation, so each key stays a literal and
 * GlossaryKey can't silently widen to string.
 */
export const GLOSSARY = {
  e1rm: {
    term: "Estimated 1RM",
    body:
      "The heaviest single rep you could probably do, worked out from a set you actually did. Uses the Epley formula: weight × (1 + reps ÷ 30). It lets a 3×8 and a 5×3 be compared on one scale without ever testing a true max.",
  },
  ffmi: {
    term: "FFMI",
    body:
      "Fat-Free Mass Index — lean mass divided by height in metres squared. It answers 'how much muscle for my frame?' independently of how much fat sits on top.",
    bullets: [
      "18–20 — average for an untrained man",
      "20–22 — well trained",
      "Above 25 — rarely reached naturally",
    ],
  },
  visceralFat: {
    term: "Visceral fat",
    body:
      "Fat stored around the organs rather than under the skin. It matters most for health and responds early to a deficit — usually the first number to move.",
    bullets: ["1–9 — normal", "10–14 — high", "15+ — very high"],
  },
  skeletalMuscle: {
    term: "Skeletal muscle",
    body:
      "The muscle you can actually train — separate from heart and gut muscle, which are included in the broader 'muscle mass' figure. This is the number to protect while losing fat.",
  },
  leanMass: {
    term: "Lean mass",
    body:
      "Everything that isn't fat: muscle, bone, organs and water. Also called fat-free mass. Target bodyweights on this dashboard assume it stays constant, which is what the strength sessions are for.",
  },
  bmr: {
    term: "BMR",
    body:
      "Basal Metabolic Rate — calories burned doing nothing at all for 24 hours. Calculated here with the Mifflin–St Jeor equation and cross-checked against the scale's own estimate. Maintenance is BMR multiplied by an activity factor.",
  },
  tonnage: {
    term: "Tonnage",
    body:
      "Total weight moved: every set's weight × reps, added up. A rough measure of how much work a month contained. Assisted machine work is excluded, since its logged weight is the assistance rather than the load.",
  },
  kneeReps: {
    term: "Knee-flexion reps",
    body:
      "Total reps from exercises that bend the knee under load — squats, lunges, leg press, step-ups. It is a rep count, not a weight, because your right knee tolerates heavy load fine but flares when reps accumulate.",
  },
  assisted: {
    term: "Assisted",
    body:
      "On an assisted pull-up or dip machine, the logged weight is how much help the machine gives — so a lower number means a harder set. Yours has fallen from 59 kg to 28 kg. It is excluded from all volume and strength figures, where it would read backwards.",
  },
  pctOfPeak: {
    term: "% of peak",
    body:
      "Your best estimated 1RM in the last 120 days, as a share of your best ever. 100% means you are at an all-time high; anything under 90% is flagged as a lift that has slipped.",
  },
  aerobicZone: {
    term: "Heart-rate zone",
    body:
      "Which effort band a run sat in, from average heart rate against an estimated max of 183 bpm.",
    bullets: [
      "Z1 easy — under 60%",
      "Z2 aerobic — 60–70%",
      "Z3 tempo — 70–80%",
      "Z4 threshold — 80–90%",
      "Z5 max — over 90%",
    ],
    footer: "Most useful training sits in Z2–Z3.",
  },
  proteinTarget: {
    term: "Protein target",
    body:
      "Set per kg of lean mass rather than bodyweight — fat tissue has no protein requirement, so bodyweight rules of thumb overshoot at 30% body fat. In a deficit this is the single number that decides whether you lose fat or lose muscle.",
    bullets: [
      "2.0 g/kg lean — floor",
      "2.2 g/kg lean — the target here",
      "2.4 g/kg lean — no benefit above this",
    ],
  },
  budgetLine: {
    term: "Protein budget line",
    body:
      "Your target is 175 g of protein inside 2,490 kcal. Divide one by the other and every 100 kcal you eat has to carry about 7 g of protein on average. That average is the line.",
    bullets: [
      "Above it — the food pays for itself and buys room elsewhere",
      "Below it — you spend calories faster than you bank protein",
      "Chicken breast at 19 g pays for a lot of olive oil at 2 g",
    ],
    footer: "You don't need every food above the line, only the average.",
  },
  bioimpedance: {
    term: "Bioimpedance",
    body:
      "How the scale estimates body composition — it passes a tiny current through you and infers fat and muscle from the resistance. Hydration, food and time of day all shift it, so treat single readings as approximate and watch the trend instead.",
  },
} as const satisfies Record<string, GlossaryEntry>;

export type GlossaryKey = keyof typeof GLOSSARY;
