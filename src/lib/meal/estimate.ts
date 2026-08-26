import { ApiError, GoogleGenAI, ThinkingLevel, type Part } from "@google/genai";
import { MEAL_SYSTEM_PROMPT } from "./prompt";
import { mealResponseSchema, totalsFor, type MealEstimate } from "./schema";
import { GEMINI_MEAL_SCHEMA } from "./gemini-schema";
import { lookUpProduct, type ProductFacts } from "./lookup";

export const MEAL_MODEL = "gemini-3.7-flash";

export type EstimateInput = {
  /** Base64 image data, already resized client-side. */
  imageBase64?: string;
  imageMediaType?: "image/jpeg" | "image/png" | "image/webp";
  /** Typed or voice-transcribed description. */
  note?: string;
};

export type EstimateResult = {
  estimate: MealEstimate;
  model: string;
  /** Wall-clock for the whole operation, including any product lookup. */
  latencyMs: number;
  usage: { input: number; output: number };
  /** What the label lookup found, or null if it did not run or declined. */
  lookup: ProductFacts | null;
};

/**
 * One Gemini call, one meal estimate.
 *
 * Medium thinking is a deliberate quality-first production choice. The
 * published comparison remains the lower-cost, low-thinking baseline.
 */
export async function estimateMeal(
  input: EstimateInput,
): Promise<EstimateResult> {
  if (!input.imageBase64 && !input.note?.trim()) {
    throw new Error("Need at least a photo or a description");
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");

  const ai = new GoogleGenAI({ apiKey: key });
  const note = input.note?.trim();

  // Timed from here, not from the estimate call: the lookup is time the user
  // spends watching "analysing…", so a latency that excluded it would be
  // measuring the wrong thing.
  const startedAt = Date.now();

  // A branded product gets its label read before it gets estimated. Returns
  // null for generic food, for a failed search, and for a lookup that is
  // switched off — in every one of those cases this behaves as it always did.
  const lookup = note ? await lookUpProduct(ai, note) : null;

  const parts: Part[] = [];
  if (input.imageBase64) {
    parts.push({
      inlineData: {
        mimeType: input.imageMediaType ?? "image/jpeg",
        data: input.imageBase64,
      },
    });
  }
  parts.push({
    text: note
      ? `The user says: "${note}"`
      : "No description given — estimate from the photo alone.",
  });
  if (lookup) {
    parts.push({
      text: `Published nutrition information found online for this product:\n\n${lookup.facts}`,
    });
  }

  let response;
  try {
    response = await ai.models.generateContent({
      model: MEAL_MODEL,
      contents: [{ role: "user", parts }],
      config: {
        systemInstruction: MEAL_SYSTEM_PROMPT,
        thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
        maxOutputTokens: 2000,
        responseMimeType: "application/json",
        responseJsonSchema: GEMINI_MEAL_SCHEMA,
        // The job itself has durable retries. Bound one API attempt instead of
        // letting a hung provider call occupy a worker indefinitely.
        httpOptions: { timeout: 30_000 },
      },
    });
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 429) {
        throw new Error("Gemini quota exceeded; retry this meal shortly");
      }
      const detail = error.message.replace(/\s+/g, " ").slice(0, 160);
      throw new Error(`Gemini request failed (${error.status}): ${detail}`);
    }
    throw error;
  }
  const latencyMs = Date.now() - startedAt;

  const text = response.text;
  if (!text) {
    const candidate = response.candidates?.[0];
    const reason =
      candidate?.finishReason ?? response.promptFeedback?.blockReason ?? "unknown reason";
    throw new Error(`Gemini returned no estimate (${reason})`);
  }

  // The API constrains generation; zod remains the authority at our boundary.
  const parsed = mealResponseSchema.parse(JSON.parse(text));
  const estimate: MealEstimate = { ...parsed, ...totalsFor(parsed.items) };

  return {
    estimate,
    lookup,
    model: response.modelVersion ?? MEAL_MODEL,
    latencyMs,
    usage: {
      input: response.usageMetadata?.promptTokenCount ?? 0,
      // Thinking tokens are billed as output tokens and reported separately.
      output:
        (response.usageMetadata?.candidatesTokenCount ?? 0) +
        (response.usageMetadata?.thoughtsTokenCount ?? 0),
    },
  };
}
