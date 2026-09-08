import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adviseMeal, looksLikeAnOption, offeredIn, type Turn } from "./advise";
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

describe("offeredIn", () => {
  it("gathers every user turn, not just the last", () => {
    const turns: Turn[] = [
      { role: "user", text: "mackerel or toast with peanut butter" },
      { role: "model", text: "{}" },
      { role: "user", text: "actually I have eggs too" },
    ];
    // "not the fish" and "I've also got eggs" both change what is on the table,
    // so the check has to see the whole exchange.
    expect(offeredIn(turns)).toContain("mackerel");
    expect(offeredIn(turns)).toContain("eggs");
    expect(offeredIn(turns)).not.toContain("{}");
  });
});

describe("adviseMeal", () => {
  beforeEach(() => vi.stubEnv("GEMINI_API_KEY", "test-key"));
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const ask = (text: string): Turn[] => [{ role: "user", text }];

  it("returns the advice and never takes the day's numbers from the caller", async () => {
    const request = vi.fn().mockResolvedValue(answer(good));
    vi.stubGlobal("fetch", request);

    const advice = await adviseMeal(ask(OPTIONS), day);
    expect(advice.pick).toBe("A tin of mackerel");

    const body = JSON.parse(String((request.mock.calls[0] as [string, RequestInit])[1].body));
    const prompt = body.contents[0].parts[0].text;
    // The gap is what the answer turns on, so it has to be in the prompt.
    expect(prompt).toContain("1211 of 2300 kcal");
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
    await expect(adviseMeal(ask(OPTIONS), day)).rejects.toThrow(
      "Could not choose from those options",
    );
  });

  it("carries the exchange, and puts only the newest turn with the day's numbers", async () => {
    const request = vi.fn().mockResolvedValue(answer({ ...good, pick: "the protein yoghurt" }));
    vi.stubGlobal("fetch", request);

    await adviseMeal(
      [
        { role: "user", text: OPTIONS },
        { role: "model", text: JSON.stringify(good) },
        { role: "user", text: "not the fish" },
      ],
      day,
    );

    const body = JSON.parse(String((request.mock.calls[0] as [string, RequestInit])[1].body));
    expect(body.contents).toHaveLength(3);
    expect(body.contents[0].role).toBe("user");
    expect(body.contents[1].role).toBe("model");
    // Earlier turns go back as they were said; only the latest carries totals,
    // so a mid-conversation set of numbers can never go stale.
    expect(body.contents[0].parts[0].text).toBe(OPTIONS);
    expect(body.contents[0].parts[0].text).not.toContain("kcal");
    expect(body.contents[2].parts[0].text).toContain("1211 of 2300 kcal");
    expect(body.contents[2].parts[0].text).toContain("They now say");
  });

  it("lets a follow-up widen what may be picked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(answer({ ...good, pick: "three scrambled eggs" })),
    );

    // Eggs were not in the opening list, but they were offered a turn later,
    // so picking them is answering the question rather than inventing food.
    const advice = await adviseMeal(
      [
        { role: "user", text: OPTIONS },
        { role: "model", text: JSON.stringify(good) },
        { role: "user", text: "gone off that idea, I have three eggs as well" },
      ],
      day,
    );
    expect(advice.pick).toBe("three scrambled eggs");
  });

  it("still refuses food nobody mentioned, mid-conversation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(answer({ ...good, pick: "grilled chicken breast and broccoli" })),
    );

    await expect(
      adviseMeal(
        [
          { role: "user", text: OPTIONS },
          { role: "model", text: JSON.stringify(good) },
          { role: "user", text: "not the fish" },
        ],
        day,
      ),
    ).rejects.toThrow("Could not choose from those options");
  });

  it("asks for something before calling anything", async () => {
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    await expect(adviseMeal(ask("   "), day)).rejects.toThrow("Say what you have");
    await expect(adviseMeal([], day)).rejects.toThrow("Say what you have");
    expect(request).not.toHaveBeenCalled();
  });
});
