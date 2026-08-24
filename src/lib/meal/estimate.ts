import Anthropic from "@anthropic-ai/sdk";
import { MEAL_SYSTEM_PROMPT } from "./prompt";
import { mealResponseSchema, totalsFor, type MealEstimate } from "./schema";
import { toStructuredOutputSchema } from "../anthropic/schema";

const client = new Anthropic();

export const MEAL_MODEL = "claude-opus-5";

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
  latencyMs: number;
  usage: { input: number; output: number };
};

/**
 * One Claude call, one meal estimate.
 *
 * `effort: low` on purpose — this is estimation against known reference values,
 * not a reasoning problem, and low effort keeps output tokens (and latency) down
 * without measurably hurting the guess.
 */
export async function estimateMeal(
  input: EstimateInput,
): Promise<EstimateResult> {
  if (!input.imageBase64 && !input.note?.trim()) {
    throw new Error("Need at least a photo or a description");
  }

  const content: Anthropic.ContentBlockParam[] = [];
  if (input.imageBase64) {
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: input.imageMediaType ?? "image/jpeg",
        data: input.imageBase64,
      },
    });
  }
  content.push({
    type: "text",
    text: input.note?.trim()
      ? `The user says: "${input.note.trim()}"`
      : "No description given — estimate from the photo alone.",
  });

  const startedAt = Date.now();
  const response = await client.messages.create({
    model: MEAL_MODEL,
    max_tokens: 2000,
    system: MEAL_SYSTEM_PROMPT,
    output_config: {
      effort: "low",
      format: {
        type: "json_schema",
        schema: toStructuredOutputSchema(mealResponseSchema),
      },
    },
    messages: [{ role: "user", content }],
  });
  const latencyMs = Date.now() - startedAt;

  if (response.stop_reason === "refusal") {
    throw new Error("Model declined to estimate this meal");
  }

  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") {
    throw new Error("No text block in response");
  }

  // Parse, never string-match — structured outputs still returns JSON as text.
  const parsed = mealResponseSchema.parse(JSON.parse(text.text));
  const estimate: MealEstimate = { ...parsed, ...totalsFor(parsed.items) };

  return {
    estimate,
    model: response.model,
    latencyMs,
    usage: {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
    },
  };
}
