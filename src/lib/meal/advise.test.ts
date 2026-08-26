import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adviseMeal, looksLikeAnOption } from "./advise";
import { FALLBACK_TARGETS } from "../meals/targets";

const OPTIONS = "a tin of mackerel, two bits of toast with peanut butter, or a protein yoghurt";

const day = {
  consumed: { kcal: 1211, protein_g: 96, carbs_g: 101, fat_g: 44 },
  targets: FALLBACK_TARGETS,
  time: "20:15",
};

const answer = (advice: Record<string, unknown>) =>
  new Response(
    JSON.stringify({
      candidates: [
        { content: { parts: [{ text: JSON.stringify(advice) }] }, finishReason: "STOP" },
      ],
      usageMetadata: { promptTokenCount: 200, candidatesTokenCount: 60 },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );

const good = {
  pick: "A tin of mackerel",
  kcal: 260,
  protein_g: 22,
  why: "22g of protein against a 95g shortfall.",
  instead: "Toast and peanut butter is mostly fat.",
};

describe("looksLikeAnOption", () => {
  it("accepts a pick taken from the list", () => {
    expect(looksLikeAnOption("A tin of mackerel", OPTIONS)).toBe(true);
    expect(looksLikeAnOption("the protein yoghurt", OPTIONS)).toBe(true);
    expect(looksLikeAnOption("two bits of toast with peanut butter", OPTIONS)).toBe(true);
  });

  it("rejects a food that was never offered", () => {
    // The failure mode this whole guard exists for: the advice everybody
    // already has, about food that is not in the house.
    expect(looksLikeAnOption("Greek yoghurt with berries and a handful of almonds", OPTIONS)).toBe(
      false,
    );
    expect(looksLikeAnOption("grilled chicken breast and broccoli", OPTIONS)).toBe(false);
  });

  it("survives a single distinctive word", () => {
    // "the mackerel" is a legitimate pick even though only one word carries.
    expect(looksLikeAnOption("the mackerel", OPTIONS)).toBe(true);
  });

  it("does not accept an empty pick", () => {
    expect(looksLikeAnOption("", OPTIONS)).toBe(false);
  });
});

describe("adviseMeal", () => {
  beforeEach(() => vi.stubEnv("GEMINI_API_KEY", "test-key"));
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("returns the advice and never sends the day's numbers from the caller", async () => {
    const request = vi.fn().mockResolvedValue(answer(good));
    vi.stubGlobal("fetch", request);

    const advice = await adviseMeal(OPTIONS, day);
    expect(advice.pick).toBe("A tin of mackerel");

    const body = JSON.parse(String((request.mock.calls[0] as [string, RequestInit])[1].body));
    const prompt = body.contents[0].parts[0].text;
    // The gap is what the answer turns on, so it has to be in the prompt.
    expect(prompt).toContain("1211 of 2294 kcal");
    expect(prompt).toContain("95 short");
    expect(prompt).toContain("20:15");
    expect(body.generationConfig.responseJsonSchema.required).toContain("pick");
  });

  it("refuses an answer that invented a food", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        answer({ ...good, pick: "Greek yoghurt with berries and some smoked salmon" }),
      ),
    );

    // A prompt is not a guarantee, so the containment check is the thing that
    // actually keeps the promise.
    await expect(adviseMeal(OPTIONS, day)).rejects.toThrow("Could not choose from those options");
  });

  it("asks for something before calling anything", async () => {
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    await expect(adviseMeal("   ", day)).rejects.toThrow("Say what you have");
    expect(request).not.toHaveBeenCalled();
  });
});
