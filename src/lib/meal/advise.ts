import { z } from "zod";

/**
 * The shape of a recommendation, and the check that it was a real one.
 *
 * The model call that produces it lives in advisor/run.ts; what is left here
 * is the part worth testing without a network — what a recommendation must
 * contain, and whether the thing recommended was actually on offer.
 *
 * That check is the feature's one hard guarantee. Advice that reaches for the
 * yoghurt-and-berries nobody mentioned is the advice everybody already has
 * and nobody wants: it answers a question about an ideal diet when the
 * question was about a cupboard. The prompt asks for it, and this is what
 * makes it true, because a prompt is not a guarantee.
 */


export const adviceSchema = z.object({
  pick: z
    .string()
    .describe("The option chosen, in the user's own words, short enough to be a heading"),
  kcal: z.number().int().min(0).describe("Estimated calories for the chosen option"),
  protein_g: z.number().int().min(0).describe("Estimated protein for the chosen option"),
  why: z
    .string()
    .describe(
      "Why this one, in at most two sentences, leading with whatever decided it — what they asked for if they asked for something, the deciding number otherwise",
    ),
  instead: z
    .string()
    .describe(
      "What was passed over and why, in one short clause. Empty string if only one option was offered.",
    ),
  /*
    Only for something assembled. A single food is its own ingredient and
    repeating it here would say nothing.
  */
  ingredients: z
    .array(z.string())
    .optional()
    .describe(
      "When the pick is a dish made from several things, the foods it is made from, each in the person's own words. Omit for a single food.",
    ),
});

export type Advice = z.infer<typeof adviceSchema>;

/**
 * What has to have come from the options: the ingredients, or the pick itself.
 *
 * A recipe names itself. "Chicken thigh and broccoli stir-fry" happens to
 * share enough words with the ingredients to pass the test below, and
 * "Thai-style traybake" made from exactly the same food does not — so
 * checking the title is checking the wrong string. What must be theirs is what
 * goes in it.
 *
 * Checked as one block rather than ingredient by ingredient, so a pinch of
 * something unmentioned does not fail an otherwise honest dish, while a
 * wholly invented one still has nowhere to hide.
 */
export function claimedFood(advice: Pick<Advice, "pick" | "ingredients">): string {
  return advice.ingredients?.length ? advice.ingredients.join(" ") : advice.pick;
}

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
