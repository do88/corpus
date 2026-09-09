/**
 * What a model call cost.
 *
 * The app already counted tokens — `estimate.ts` has read Gemini's usage since
 * the meal estimator was written — and then dropped them on the floor. Nothing
 * consumed the figure. So this is less "add cost tracking" than "attach a price
 * to a number already in hand".
 *
 * It matters because AGENTS.md makes a costed argument for the whole design:
 * eight models compared, `$0.013` a meal, `£2.10/month`. Those were measured
 * once, by a benchmark script that has since been deleted. The advisor arrived
 * afterwards and can make eight model calls with a growing transcript behind
 * each one, which is plausibly several times a meal estimate — and nothing
 * anywhere would say so.
 *
 * ## Two rates, chosen by date
 *
 * Gemini 3.7 Flash is on introductory pricing that **doubles on 1 January
 * 2027**. A table holding only today's price is a table that silently halves
 * every figure that morning, and nobody would notice: the numbers would still
 * look plausible. So both rates are written down and the date picks between
 * them, which turns a thing someone has to remember into a thing that happens.
 *
 * ## Unpriced is null, never zero
 *
 * A model missing from the table returns `null`, not `0`. A zero would be
 * indistinguishable from a free call and would quietly understate the total —
 * the same failure as the analytics row cap, where exceeding it dropped the
 * oldest days and said nothing.
 *
 * Rates are USD per million tokens, from ai.google.dev/gemini-api/docs/pricing
 * (read 2026-09-09). Held in USD because that is what Google bills in;
 * converting to sterling here would bake in an exchange rate that moves.
 */

export type TokenUsage = {
  /** Prompt tokens billed at the full rate — cached tokens already removed. */
  input: number;
  /** Prompt tokens served from cache, billed at a tenth of the rate. */
  cachedInput: number;
  /** Visible output plus thinking, which Google bills at the same rate. */
  output: number;
};

export const NO_USAGE: TokenUsage = { input: 0, cachedInput: 0, output: 0 };

type Rates = { input: number; cachedInput: number; output: number };

type Pricing = {
  /** The last day the introductory rates apply, inclusive, as YYYY-MM-DD. */
  introductoryUntil: string;
  introductory: Rates;
  standard: Rates;
};

const PRICING: Record<string, Pricing> = {
  "gemini-3.7-flash": {
    introductoryUntil: "2026-12-31",
    introductory: { input: 0.75, cachedInput: 0.075, output: 3.75 },
    standard: { input: 1.5, cachedInput: 0.15, output: 7.5 },
  },
};

/**
 * Gemini's usage metadata, in the shape this file wants.
 *
 * Two provider details are load-bearing here, and both are the opposite of
 * what the equivalent Anthropic code assumes:
 *
 * - `promptTokenCount` **includes** the cached tokens, so the full-rate input
 *   is the difference. Adding them instead would bill the cached portion twice
 *   and at ten times its rate.
 * - `candidatesTokenCount` **excludes** thinking, and thinking is billed as
 *   output, so the two are summed. This is the same correction `estimate.ts`
 *   already makes, and the comment there is what led me to check.
 */
export function usageFromGemini(meta: {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
  cachedContentTokenCount?: number;
} | undefined): TokenUsage {
  if (!meta) return NO_USAGE;
  const cachedInput = meta.cachedContentTokenCount ?? 0;
  return {
    input: Math.max(0, (meta.promptTokenCount ?? 0) - cachedInput),
    cachedInput,
    output: (meta.candidatesTokenCount ?? 0) + (meta.thoughtsTokenCount ?? 0),
  };
}

export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    input: a.input + b.input,
    cachedInput: a.cachedInput + b.cachedInput,
    output: a.output + b.output,
  };
}

/**
 * Cost in microdollars — millionths of a dollar, as a whole number.
 *
 * Integers because a single answer costs a few thousandths of a cent, and
 * accumulating that in floating point across calls is how a total ends up
 * ending in 0.30000000000000004. Null when the model has no price on file.
 */
export function costMicros(
  model: string,
  usage: TokenUsage,
  at: Date = new Date(),
): number | null {
  const pricing = PRICING[model];
  if (!pricing) return null;
  const day = at.toISOString().slice(0, 10);
  const rates = day <= pricing.introductoryUntil ? pricing.introductory : pricing.standard;
  const usd =
    (usage.input * rates.input +
      usage.cachedInput * rates.cachedInput +
      usage.output * rates.output) /
    1_000_000;
  return Math.round(usd * 1_000_000);
}

/**
 * For a log line or a screen.
 *
 * Sub-cent amounts are the normal case here, so cents carry three decimals
 * rather than rounding a real cost to "0.00¢" and reading as free.
 */
export function formatCost(micros: number | null): string {
  if (micros === null) return "unpriced";
  const usd = micros / 1_000_000;
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  const cents = usd * 100;
  return `${cents.toFixed(cents >= 1 ? 2 : 3)}¢`;
}
