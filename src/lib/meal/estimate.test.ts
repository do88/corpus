import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { estimateMeal, MEAL_MODEL } from "./estimate";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

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

/** The lookup declining: generic food, so it never searched. */
const lookupDeclined = {
  candidates: [{ content: { parts: [{ text: "NONE" }] }, finishReason: "STOP" }],
  usageMetadata: { promptTokenCount: 106, candidatesTokenCount: 5 },
};

/** The lookup finding a real label, with the search that produced it. */
const lookupFound = {
  candidates: [
    {
      content: {
        parts: [{ text: "Jack Link's x MrBeast Beef Jerky. Pack 25g. Per pack: 64 kcal, 9g protein." }],
      },
      groundingMetadata: {
        webSearchQueries: ["mr beast beef jerky nutrition"],
        groundingChunks: [{ web: { domain: "jacklinks.com" } }, { web: { domain: "feastables.com" } }],
      },
      finishReason: "STOP",
    },
  ],
  usageMetadata: { promptTokenCount: 105, candidatesTokenCount: 200 },
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
    const request = vi
      .fn()
      .mockResolvedValueOnce(json(lookupDeclined))
      .mockResolvedValueOnce(json(apiResponse));
    vi.stubGlobal("fetch", request);

    const result = await estimateMeal({ note: "two slices of toast" });

    // Two calls now: the label lookup, then the estimate.
    expect(request).toHaveBeenCalledTimes(2);
    const [url, init] = request.mock.calls[1] as [string, RequestInit];
    expect(url).toContain(`/models/${MEAL_MODEL}:generateContent`);
    expect(new Headers(init.headers).get("X-goog-api-key")).toBe("test-key");

    const body = JSON.parse(String(init.body));
    expect(body.contents[0].parts).toEqual([
      { text: 'The user says: "two slices of toast"' },
    ]);
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingLevel: "MEDIUM" });
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.generationConfig.responseJsonSchema.required).toEqual([
      "items",
      "confidence",
      "assumptions",
    ]);
    expect(init.signal).toBeInstanceOf(AbortSignal);

    expect(result.model).toBe(MEAL_MODEL);
    expect(result.estimate).toMatchObject({ kcal: 200, protein_g: 8, carbs_g: 36, fat_g: 2 });
    expect(result.usage).toEqual({ input: 100, output: 50 });
    // A declined lookup leaves no trace on the result.
    expect(result.lookup).toBeNull();
  });

  it("puts a found label in front of the estimator", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(json(lookupFound))
      .mockResolvedValueOnce(json(apiResponse));
    vi.stubGlobal("fetch", request);

    const result = await estimateMeal({ note: "pack of mr beast beef jerky" });

    const body = JSON.parse(String((request.mock.calls[1] as [string, RequestInit])[1].body));
    // The label arrives as its own part, after what the user said.
    expect(body.contents[0].parts.at(-1).text).toContain("Jack Link's x MrBeast");
    expect(body.contents[0].parts.at(-1).text).toContain("Published nutrition information");
    expect(result.lookup?.sources).toEqual(["jacklinks.com", "feastables.com"]);
  });

  it("estimates as before when the lookup fails outright", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(json({ error: "boom" }, 500))
      .mockResolvedValueOnce(json(apiResponse));
    vi.stubGlobal("fetch", request);

    // The meal is still estimable without a label; losing the lookup must not
    // cost the meal.
    const result = await estimateMeal({ note: "pack of mr beast beef jerky" });
    expect(result.lookup).toBeNull();
    expect(result.estimate).toMatchObject({ kcal: 200 });
  });

  it("sends a resized meal photo as inline image data", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(apiResponse)));

    await estimateMeal({ imageBase64: "abc123", imageMediaType: "image/webp" });

    // No note, so nothing to look up: one call, as before.
    expect(vi.mocked(fetch)).toHaveBeenCalledOnce();
    const request = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(body.contents[0].parts).toEqual([
      { inlineData: { mimeType: "image/webp", data: "abc123" } },
      { text: "No description given — estimate from the photo alone." },
    ]);
  });

  it("turns a quota response into a retryable, non-secret error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(json({ error: "quota" }, 429))));

    await expect(estimateMeal({ note: "toast" })).rejects.toThrow(
      "Gemini quota exceeded; retry this meal shortly",
    );
  });
});
