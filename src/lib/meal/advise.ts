import { ApiError, GoogleGenAI, ThinkingLevel } from "@google/genai";
import { z } from "zod";
import type { DailyTargets } from "../meals/targets";

/**
 * Pick one of the things you already have.
 *
 * Not a chat and not a diet planner. The question it answers is the narrow one
 * that actually gets asked at nine at night: *of these three things in my
 * kitchen, which one?* That question has a real answer, because the gap between
 * what has been eaten and what was targeted is a number.
 *
 * The single most important rule is that it may only choose from the options
 * given. Advice that reaches for the yoghurt-and-berries you did not mention is
 * the advice everybody already has and nobody wants; it answers a question
 * about an ideal diet when the question was about a cupboard. Enforced in the
 * prompt and, because a prompt is not a guarantee, checked again on the way
 * out — see `looksLikeAnOption`.
 */

export const ADVISE_MODEL = "gemini-3.7-flash";

export const ADVISE_SYSTEM_PROMPT = `You help someone decide what to eat next, from food they already have.

The rules, in the order they matter:

- Choose ONE of the options they list. Never suggest a food they did not
  mention. Never tell them what they should be eating instead, or what would be
  better if they had it. They asked which of these — not what a good diet looks
  like. Ignoring this makes the answer useless to them.
- This may run on as a short back-and-forth. They may add options, rule one
  out, or say they do not fancy something. Weigh everything they have said they
  have across the whole conversation, minus whatever they have ruled out, and
  do not re-offer something they have just turned down. The rule above still
  holds at every turn: nothing they have not mentioned.
- Decide on the numbers. Protein is the priority: they are eating at a deficit
  and protein is the target they most often fall short of. Calories are a
  ceiling, protein is a floor.
- If an option would take them over the calorie ceiling, say so plainly and
  pick one that does not. If every option would, pick the least bad and say
  that is what you have done.
- Late in the day and well short on protein, favour the highest-protein option
  even when it is not the lowest in calories. Early in the day, leave room.
- Estimate the chosen option's calories and protein the way you would estimate
  any meal. UK portions and UK supermarket products.
- Be brief and lead with the number that decided it. Two sentences at most.
  No encouragement, no "consider speaking to a professional", no praise for
  what they have eaten so far. They want a decision, not a coach.`;

export const adviceSchema = z.object({
  pick: z
    .string()
    .describe("The option chosen, in the user's own words, short enough to be a heading"),
  kcal: z.number().int().min(0).describe("Estimated calories for the chosen option"),
  protein_g: z.number().int().min(0).describe("Estimated protein for the chosen option"),
  why: z
    .string()
    .describe("Why this one, in at most two sentences, leading with the deciding number"),
  instead: z
    .string()
    .describe(
      "What was passed over and why, in one short clause. Empty string if only one option was offered.",
    ),
});

export type Advice = z.infer<typeof adviceSchema>;

const GEMINI_ADVICE_SCHEMA = Object.fromEntries(
  Object.entries(z.toJSONSchema(adviceSchema)).filter(([key]) => key !== "$schema"),
);

export type Turn = { role: "user" | "model"; text: string };

export type DayState = {
  consumed: { kcal: number; protein_g: number; carbs_g: number; fat_g: number };
  targets: DailyTargets;
  /** The local clock, "20:15", so it can weigh how much day is left. */
  time: string;
};

/**
 * Whether the pick actually came from the options.
 *
 * A containment test, not a parser. The model echoes the user's own wording —
 * "A tin of mackerel", "three scrambled eggs on toast" — so a genuine pick is
 * made almost entirely of words that were on offer, and an invented one is not.
 *
 * The measure is the *proportion* of the pick that is foreign, not the count of
 * words it shares. Counting shared words fails on exactly the case this exists
 * to catch: "Greek yoghurt with berries and a handful of almonds" shares
 * "yoghurt" and "with" with a list containing a protein yoghurt, which clears
 * any small threshold while being a suggestion for food that is not in the
 * house. By proportion it is one word in five, and it fails.
 */
const FILLER = new Set([
  "with", "some", "just", "from", "that", "this", "than", "then", "plus", "also",
  "only", "into", "more", "your", "have", "them", "they", "made", "each", "both",
  "other", "another", "either",
]);

function distinctive(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3 && !FILLER.has(word));
}

export function looksLikeAnOption(pick: string, options: string): boolean {
  const offered = new Set(distinctive(options));
  if (offered.size === 0) return true;

  const chosen = distinctive(pick);
  if (chosen.length === 0) return false;

  const shared = chosen.filter((word) => offered.has(word)).length;
  // Half, so a pick may carry a word or two of its own — "the mackerel tin" —
  // without a wholly invented dish getting through on one coincidence.
  return shared / chosen.length >= 0.5;
}

function describeDay(day: DayState): string {
  const { consumed, targets } = day;
  const left = (had: number, target: number) => Math.max(0, target - had);
  return [
    `The time is ${day.time}.`,
    "",
    "Today so far, against target:",
    `- Energy: ${consumed.kcal} of ${targets.kcal} kcal (${left(consumed.kcal, targets.kcal)} left)`,
    `- Protein: ${consumed.protein_g} of ${targets.protein_g} g (${left(consumed.protein_g, targets.protein_g)} short)`,
    `- Carbs: ${consumed.carbs_g} of ${targets.carbs_g} g`,
    `- Fat: ${consumed.fat_g} of ${targets.fat_g} g`,
  ].join("\n");
}

/**
 * The words the person has offered, across the whole exchange.
 *
 * Every user turn, not just the latest, because "actually I've got eggs too"
 * and "not the fish" are both legitimate turns and both change what is on the
 * table. Checking the pick against only the last thing said would reject a
 * perfectly good answer to the first question.
 */
export function offeredIn(turns: Turn[]): string {
  return turns
    .filter((turn) => turn.role === "user")
    .map((turn) => turn.text)
    .join(" ");
}

export async function adviseMeal(turns: Turn[], day: DayState): Promise<Advice> {
  const latest = turns.at(-1);
  if (!latest || latest.role !== "user" || !latest.text.trim()) {
    throw new Error("Say what you have");
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");

  const ai = new GoogleGenAI({ apiKey: key });

  // Earlier turns go in as they were said. Only the newest carries the day's
  // numbers, so the model is never reading a stale set from halfway through
  // the conversation — the totals move as meals get logged mid-session.
  const history = turns.slice(0, -1).map((turn) => ({
    role: turn.role,
    parts: [{ text: turn.text }],
  }));
  const opening = turns.length > 1 ? "They now say" : "They have available";

  let response;
  try {
    response = await ai.models.generateContent({
      model: ADVISE_MODEL,
      contents: [
        ...history,
        {
          role: "user",
          parts: [
            {
              text: `${describeDay(day)}\n\n${opening}: "${latest.text.trim()}"\n\nWhich one?`,
            },
          ],
        },
      ],
      config: {
        systemInstruction: ADVISE_SYSTEM_PROMPT,
        // Low thinking: this is a comparison of a few numbers against two
        // targets, not a problem. Medium bought nothing here but latency, and
        // this is the one call in the app a person waits on in real time.
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        maxOutputTokens: 900,
        responseMimeType: "application/json",
        responseJsonSchema: GEMINI_ADVICE_SCHEMA,
        httpOptions: { timeout: 20_000 },
      },
    });
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 429) throw new Error("Gemini quota exceeded; try again shortly");
      throw new Error(`Gemini request failed (${error.status})`);
    }
    throw error;
  }

  const text = response.text;
  if (!text) throw new Error("No answer came back");

  const advice = adviceSchema.parse(JSON.parse(text));

  // The prompt is asked not to invent food; this is what makes it true. A
  // suggestion from outside the list is worse than no answer, because it is
  // the exact failure that makes this kind of feature irritating.
  if (!looksLikeAnOption(advice.pick, offeredIn(turns))) {
    throw new Error("Could not choose from those options — try naming them more plainly");
  }

  return advice;
}
