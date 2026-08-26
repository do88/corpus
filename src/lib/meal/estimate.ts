import { MEAL_SYSTEM_PROMPT } from "./prompt";
import { mealResponseSchema, totalsFor, type MealEstimate } from "./schema";
import { GEMINI_MEAL_SCHEMA } from "./gemini-schema";

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
  latencyMs: number;
  usage: { input: number; output: number };
};

/**
 * One Gemini call, one meal estimate.
 *
 * Low thinking on purpose — this is estimation against known reference values,
 * not a reasoning problem, and the benchmark measured this exact setting.
 */
export async function estimateMeal(
  input: EstimateInput,
): Promise<EstimateResult> {
  if (!input.imageBase64 && !input.note?.trim()) {
    throw new Error("Need at least a photo or a description");
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");

  const parts: Array<
    | { inlineData: { mimeType: NonNullable<EstimateInput["imageMediaType"]>; data: string } }
    | { text: string }
  > = [];
  if (input.imageBase64) {
    parts.push({
      inlineData: {
        mimeType: input.imageMediaType ?? "image/jpeg",
        data: input.imageBase64,
      },
    });
  }
  parts.push({
    text: input.note?.trim()
      ? `The user says: "${input.note.trim()}"`
      : "No description given — estimate from the photo alone.",
  });

  const startedAt = Date.now();
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MEAL_MODEL}:generateContent`,
    {
      method: "POST",
      signal: AbortSignal.timeout(30_000),
      headers: {
        "Content-Type": "application/json",
        "X-goog-api-key": key,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: MEAL_SYSTEM_PROMPT }] },
        contents: [{ parts }],
        generationConfig: {
          thinkingConfig: { thinkingLevel: "low" },
          maxOutputTokens: 2000,
          responseMimeType: "application/json",
          responseSchema: GEMINI_MEAL_SCHEMA,
        },
      }),
    },
  );
  const latencyMs = Date.now() - startedAt;

  const responseText = await response.text();
  if (!response.ok) {
    if (response.status === 429) {
      throw new Error("Gemini quota exceeded; retry this meal shortly");
    }
    throw new Error(
      `Gemini request failed (${response.status}): ${responseText.replace(/\s+/g, " ").slice(0, 160)}`,
    );
  }

  const body = JSON.parse(responseText);
  const candidate = body.candidates?.[0];
  const text = candidate?.content?.parts?.find((part: { text?: string }) => part.text)?.text;
  if (!text) {
    const reason = candidate?.finishReason ?? body.promptFeedback?.blockReason ?? "unknown reason";
    throw new Error(`Gemini returned no estimate (${reason})`);
  }

  // The API constrains generation; zod remains the authority at our boundary.
  const parsed = mealResponseSchema.parse(JSON.parse(text));
  const estimate: MealEstimate = { ...parsed, ...totalsFor(parsed.items) };

  return {
    estimate,
    model: body.modelVersion ?? MEAL_MODEL,
    latencyMs,
    usage: {
      input: body.usageMetadata?.promptTokenCount ?? 0,
      // Thinking tokens are billed as output tokens and reported separately.
      output:
        (body.usageMetadata?.candidatesTokenCount ?? 0) +
        (body.usageMetadata?.thoughtsTokenCount ?? 0),
    },
  };
}
