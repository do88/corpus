import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GoogleGenAI } from "@google/genai";
import { lookUpProduct } from "./lookup";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const reply = (text: string, grounding?: Record<string, unknown>) => ({
  candidates: [
    {
      content: { parts: [{ text }] },
      ...(grounding ? { groundingMetadata: grounding } : {}),
      finishReason: "STOP",
    },
  ],
  usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20 },
});

const ai = () => new GoogleGenAI({ apiKey: "test-key" });

describe("lookUpProduct", () => {
  beforeEach(() => vi.stubEnv("MEAL_PRODUCT_LOOKUP", ""));
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("asks for search and does NOT constrain the response", async () => {
    // The reason this is a separate call at all. Gemini accepts a response
    // schema alongside the search tool and then silently never searches, so a
    // schema appearing here would disable grounding without failing anything.
    const request = vi.fn().mockResolvedValue(json(reply("NONE")));
    vi.stubGlobal("fetch", request);

    await lookUpProduct(ai(), "anything");

    const body = JSON.parse(String((request.mock.calls[0] as [string, RequestInit])[1].body));
    expect(body.tools).toEqual([{ googleSearch: {} }]);
    expect(body.generationConfig?.responseJsonSchema).toBeUndefined();
    expect(body.generationConfig?.responseMimeType).toBeUndefined();
  });

  it("returns the label and its sources when it actually searched", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        json(
          reply("Aldi Egg Fried Rice, 250g pouch. 144 kcal per 100g.", {
            webSearchQueries: ["aldi egg fried rice nutrition"],
            groundingChunks: [
              { web: { domain: "aldi.co.uk" } },
              { web: { domain: "aldi.co.uk" } },
              { web: { domain: "tesco.com" } },
            ],
          }),
        ),
      ),
    );

    const found = await lookUpProduct(ai(), "aldi egg fried rice pouch");
    expect(found?.facts).toContain("250g pouch");
    expect(found?.queries).toEqual(["aldi egg fried rice nutrition"]);
    // Deduplicated: three chunks, two distinct domains.
    expect(found?.sources).toEqual(["aldi.co.uk", "tesco.com"]);
  });

  it("declines generic food without searching", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(reply("NONE"))));
    expect(await lookUpProduct(ai(), "2 eggs and a slice of toast")).toBeNull();
  });

  it("discards a confident answer that came with no search behind it", async () => {
    // The failure this guard exists for. A model that describes a product
    // without searching is doing the remembering this call was added to
    // replace, and a remembered label is indistinguishable from a real one.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(json(reply("MrBeast jerky, 50g pack, 145 kcal."))),
    );
    expect(await lookUpProduct(ai(), "mr beast jerky")).toBeNull();
  });

  it("returns null rather than throwing when the API fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ error: "nope" }, 500)));
    expect(await lookUpProduct(ai(), "some brand")).toBeNull();
  });

  it("makes no request at all when switched off", async () => {
    vi.stubEnv("MEAL_PRODUCT_LOOKUP", "off");
    const request = vi.fn();
    vi.stubGlobal("fetch", request);

    expect(await lookUpProduct(ai(), "mr beast jerky")).toBeNull();
    // Grounding is billed per search, so "off" has to mean no call, not a
    // discarded result.
    expect(request).not.toHaveBeenCalled();
  });
});
