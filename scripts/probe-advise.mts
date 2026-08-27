/**
 * Does the advisor answer the question that was asked?
 *
 * The prompt has always been able to compare macros. What it could not
 * reliably do was hear "I fancy something sweet" as a constraint — it would
 * take the highest-protein option and describe it as sweet, which reads as not
 * having listened. That failure is invisible to the type checker and to the
 * unit tests, because it is a property of the answer's *sense*, not its shape.
 *
 * So it is checked here, against the real model, and deliberately not in
 * `vitest run`: it costs money, it needs a key, and a model call is not a
 * thing a test suite should depend on to go green.
 *
 * Known limitation, stated so nobody reads more into a green run than is
 * there. Case 1 can only check that the answer *mentions* what was asked for,
 * and the failure worth catching is subtler than that: the old prompt wrote
 * "25g of protein … while still satisfying your sweet craving", which contains
 * the word and is still an assertion with no argument behind it. What replaced
 * it argues the point — the yoghurt is flavoured, the mango is sugar with no
 * protein — and no regex tells those two apart. Read the printed answers;
 * do not just count the ticks.
 *
 *   pnpm probe:advice
 */
import { adviseMeal, type DayState, type Turn } from "../src/lib/meal/advise.ts";

const DAY: DayState = {
  consumed: { kcal: 694, protein_g: 58, carbs_g: 61, fat_g: 27 },
  targets: {
    kcal: 2294,
    protein_g: 191,
    carbs_g: 229,
    fat_g: 76,
    basis: {
      bmr: 1783,
      bmrFormula: "katch-mcardle",
      tdee: 2694,
      activityFactor: 1.51,
      deficit: 400,
    },
  } as DayState["targets"],
  time: "20:15",
};

type Case = {
  name: string;
  turns: string[];
  /** What a good answer picks. An empty list means: anything, but honestly. */
  wants: string[];
  /** Words that mean it engaged with the request rather than the macros. */
  engages?: RegExp;
  /** An answer must not claim the request was met when it was not. */
  mustAdmit?: boolean;
};

const CASES: Case[] = [
  {
    name: "the reported failure — a sweet option is on the table",
    turns: [
      "a tin of mackerel, two crumpets, or a protein yoghurt",
      "but i fancy something sweet, i've also got a bag of dried mango",
    ],
    wants: ["mango", "yoghurt"],
    engages: /sweet|sugar|fruit|mango/i,
  },
  {
    name: "nothing on the table is sweet — it has to say so",
    turns: ["a tin of tuna, two boiled eggs, or some cottage cheese", "something sweet?"],
    wants: [],
    mustAdmit: true,
  },
  {
    name: "a preference does not license inventing food",
    turns: ["a chicken breast or a bag of ready salted crisps", "something sweet"],
    wants: ["chicken", "crisps"],
  },
  {
    name: "no preference stated — still decides on the numbers",
    turns: ["a tin of mackerel, two crumpets, or a protein yoghurt"],
    wants: ["mackerel", "yoghurt"],
    engages: /protein|kcal|calorie|\d/i,
  },
  {
    name: "ruled out, and light — two constraints at once",
    turns: [
      "leftover chilli, a protein yoghurt, or four crackers with cheese",
      "not the chilli, and nothing heavy",
    ],
    wants: ["yoghurt", "cracker"],
    engages: /light|heavy|small|little/i,
  },
];

let failures = 0;

for (const [index, testCase] of CASES.entries()) {
  const turns: Turn[] = testCase.turns.map((text) => ({ role: "user", text }));
  // Each user turn after the first needs the model's own turn between them, and
  // the only honest way to get one is to actually run the earlier turns.
  const built: Turn[] = [];
  let advice;
  for (const turn of turns) {
    built.push(turn);
    advice = await adviseMeal([...built], DAY);
    built.push({ role: "model", text: JSON.stringify(advice) });
  }
  if (!advice) throw new Error("no advice");

  const problems: string[] = [];
  const pick = advice.pick.toLowerCase();
  if (testCase.wants.length && !testCase.wants.some((want) => pick.includes(want))) {
    problems.push(`picked "${advice.pick}", wanted one of ${testCase.wants.join(" / ")}`);
  }
  if (testCase.engages && !testCase.engages.test(advice.why)) {
    problems.push(`the reason never mentions what was asked for: "${advice.why}"`);
  }
  if (testCase.mustAdmit) {
    const admits = /\bno\b|none|nothing|not |isn't|aren't|closest|lack/i.test(advice.why);
    if (!admits) {
      problems.push(`claims the request was met when nothing meets it: "${advice.why}"`);
    }
  }

  const mark = problems.length ? "✗" : "✓";
  console.log(`\n${mark} ${index + 1}. ${testCase.name}`);
  console.log(`   pick: ${advice.pick} — ${advice.kcal} kcal, ${advice.protein_g}g protein`);
  console.log(`   why:  ${advice.why}`);
  if (advice.instead) console.log(`   over: ${advice.instead}`);
  for (const problem of problems) console.log(`   ↳ ${problem}`);
  failures += problems.length ? 1 : 0;
}

console.log(`\n${CASES.length - failures}/${CASES.length} answered the question that was asked.`);
process.exit(failures ? 1 : 0);
