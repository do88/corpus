import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { estimateMeal, MEAL_MODEL } from "./estimate";

const apiResponse = {
  candidates: [
    {
      content: {
        parts: [
          {
            text: JSON.stringify({
              items: [
                {
                  name: "Toast",
                  qty: "2 slices",
                  kcal: 200,
                  protein_g: 8,
                  carbs_g: 36,
                  fat_g: 2,
                },
              ],
              confidence: "high",
              assumptions: "Two standard large-loaf slices.",
            }),
          },
        ],
      },
      finishReason: "STOP",
    },
  ],
  usageMetadata: {
    promptTokenCount: 100,
    candidatesTokenCount: 40,
    thoughtsTokenCount: 10,
  },
  modelVersion: MEAL_MODEL,
};

describe("estimateMeal", () => {
  beforeEach(() => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("sends the production model, prompt and structured-output configuration", async () => {
    const request = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(apiResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", request);

    const result = await estimateMeal({ note: "two slices of toast" });

    expect(request).toHaveBeenCalledOnce();
    const [url, init] = request.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(`/models/${MEAL_MODEL}:generateContent`);
    expect(new Headers(init.headers).get("X-goog-api-key")).toBe("test-key");

    const body = JSON.parse(String(init.body));
    expect(body.contents[0].parts).toEqual([
      { text: 'The user says: "two slices of toast"' },
    ]);
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingLevel: "low" });
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.generationConfig.responseSchema.required).toEqual([
      "items",
      "confidence",
      "assumptions",
    ]);

    expect(result.model).toBe(MEAL_MODEL);
    expect(result.estimate).toMatchObject({ kcal: 200, protein_g: 8, carbs_g: 36, fat_g: 2 });
    expect(result.usage).toEqual({ input: 100, output: 50 });
  });

  it("sends a resized meal photo as inline image data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify(apiResponse), { status: 200 })),
    );

    await estimateMeal({ imageBase64: "abc123", imageMediaType: "image/webp" });

    const request = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(body.contents[0].parts).toEqual([
      { inlineData: { mimeType: "image/webp", data: "abc123" } },
      { text: "No description given — estimate from the photo alone." },
    ]);
  });

  it("turns a quota response into a retryable, non-secret error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response('{"error":"quota"}', { status: 429 })),
    );

    await expect(estimateMeal({ note: "toast" })).rejects.toThrow(
      "Gemini quota exceeded; retry this meal shortly",
    );
  });
});
