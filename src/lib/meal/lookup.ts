import { GoogleGenAI, ThinkingLevel } from "@google/genai";

/**
 * Look up a branded product's published nutrition label, before estimating it.
 *
 * The problem this solves: the estimator has no web access, so a brand name
 * reaches it as a word rather than as a product. Asked for "a pack of mr beast
 * beef jerky" it returned a generic 50g snack pack — the brand landed in the
 * item's name and contributed nothing to the numbers. Asked twice it gave 64
 * kcal and 210 kcal, which is the tell: it was inventing a plausible pack, and
 * a different one each time.
 *
 * Grounding cannot simply be switched on in the main call. Gemini accepts
 * `tools: [{ googleSearch: {} }]` alongside `responseJsonSchema` without
 * complaint and then silently does not search — no queries, no sources, no
 * error. Since the structured contract is what keeps the estimate parseable,
 * the search has to be a separate call, and this is it.
 *
 * It gates itself. The prompt tells the model to answer NONE for generic food,
 * and a model that decides NONE does not issue a search — measured at 65 output
 * tokens and no query for "2 eggs and a slice of toast", against a real search
 * for the same text with a brand in it. That matters because Google Search
 * grounding is billed per search, not per token: the cheap path has to be the
 * common one, and the common meal is not branded.
 */

export const LOOKUP_MODEL = "gemini-3.7-flash";

export const PRODUCT_LOOKUP_PROMPT = `You look up published nutrition information for BRANDED PACKAGED products.

If the text names a specific branded, own-brand or restaurant product, search for
its published nutrition information and report:
- the full product name as sold
- the pack or serving size it is sold in
- energy (kcal), protein, carbohydrate and fat, per 100g AND per pack
- where the figures came from

The user is in the UK. Prefer UK listings and UK pack sizes; say so if the only
figures you can find are for another market, because pack sizes differ.

If the text is generic food with no brand — eggs, toast, a chicken breast, a pint
of lager, "a handful of almonds" — do NOT search. Reply with exactly: NONE

If you search but cannot find reliable published figures, reply with exactly: NONE
Do not fall back on your own recollection of a label. A remembered label is worth
less than no label, because it cannot be told apart from a real one.`;

export type ProductFacts = {
  /** The model's write-up of the label, pasted into the estimate prompt. */
  facts: string;
  /** What it actually searched for. Empty means it did not search. */
  queries: string[];
  /** Domains behind the answer, for the audit trail. */
  sources: string[];
};

/** `MEAL_PRODUCT_LOOKUP=off` disables the extra call and its search billing. */
function enabled(): boolean {
  const flag = process.env.MEAL_PRODUCT_LOOKUP?.trim().toLowerCase();
  return !(flag === "off" || flag === "0" || flag === "false");
}

/**
 * Returns the label facts, or `null` for anything that is not a confident hit.
 *
 * Never throws. This is an enrichment: if the lookup is disabled, declines,
 * times out or fails outright, the caller estimates exactly as it did before.
 * Losing a lookup should cost a little accuracy on one meal, not the meal.
 */
export async function lookUpProduct(
  ai: GoogleGenAI,
  note: string,
): Promise<ProductFacts | null> {
  if (!enabled() || !note.trim()) return null;

  try {
    const response = await ai.models.generateContent({
      model: LOOKUP_MODEL,
      contents: [{ role: "user", parts: [{ text: note.trim() }] }],
      config: {
        systemInstruction: PRODUCT_LOOKUP_PROMPT,
        tools: [{ googleSearch: {} }],
        // Low thinking: this is retrieval and transcription, not reasoning, and
        // the tokens here are pure overhead on every generic meal.
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        maxOutputTokens: 1200,
        httpOptions: { timeout: 20_000 },
      },
    });

    const grounding = response.candidates?.[0]?.groundingMetadata;
    const queries = grounding?.webSearchQueries ?? [];

    // No search means no evidence. This is the load-bearing check, and it
    // covers more than the NONE reply: a model that answers about a product
    // *without* searching is doing the remembering this call exists to
    // replace, and its answer has to be discarded rather than trusted.
    if (queries.length === 0) return null;

    const facts = response.text?.trim();
    if (!facts || facts === "NONE") return null;

    const sources = [
      ...new Set(
        (grounding?.groundingChunks ?? [])
          .map((chunk) => chunk.web?.domain ?? chunk.web?.title)
          .filter((source): source is string => Boolean(source)),
      ),
    ];

    return { facts, queries: [...queries], sources };
  } catch {
    // Deliberately swallowed, including timeouts and quota errors. The meal is
    // still estimable without this.
    return null;
  }
}
