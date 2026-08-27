import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isSupportedAudioType,
  productVocabulary,
  transcribeAudio,
  transcriptOf,
} from "./transcribe";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const flashSaid = (text: string) =>
  json({
    candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }],
    usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
  });

describe("isSupportedAudioType", () => {
  it("accepts what a browser actually reports, codec and all", () => {
    // The value comes from `MediaRecorder.mimeType`, which is never the bare
    // container — rejecting the codec suffix would reject every real recording.
    expect(isSupportedAudioType("audio/webm;codecs=opus")).toBe(true);
    expect(isSupportedAudioType("audio/mp4")).toBe(true);
    expect(isSupportedAudioType("AUDIO/WEBM")).toBe(true);
  });

  it("refuses anything that is not audio", () => {
    expect(isSupportedAudioType("video/mp4")).toBe(false);
    expect(isSupportedAudioType("image/jpeg")).toBe(false);
    expect(isSupportedAudioType("")).toBe(false);
  });
});

describe("productVocabulary", () => {
  it("keeps a multi-word brand together", () => {
    const terms = productVocabulary([
      { note: "two Mr Kipling birthday cake slices", items: null },
    ]);
    expect(terms).toContain("Mr Kipling");
  });

  it("ignores a capital that is only the start of a sentence", () => {
    // Otherwise every note teaches it a new brand: "Toast with jam" would put
    // Toast in the list, and a hint list of ordinary nouns is worse than none.
    const terms = productVocabulary([{ note: "Toast with peanut butter", items: null }]);
    expect(terms).not.toContain("Toast");
  });

  it("reads the estimator's item names too", () => {
    const terms = productVocabulary([
      { note: null, items: [{ name: "Grenade Protein Bar" }] },
    ]);
    expect(terms).toContain("Grenade Protein Bar");
  });

  it("ranks by how often something is actually eaten", () => {
    const meals = [
      { note: "a Skyr yoghurt", items: null },
      { note: "another Skyr", items: null },
      { note: "some Biltong", items: null },
    ];
    expect(productVocabulary(meals)[0]).toBe("Skyr");
  });

  it("counts one product once, however it was capitalised", () => {
    const terms = productVocabulary([
      { note: "a Huel shake", items: null },
      { note: "the HUEL again", items: null },
    ]);
    expect(terms.filter((term) => term.toLowerCase() === "huel")).toHaveLength(1);
  });

  it("stays within the limit it is given", () => {
    const meals = Array.from({ length: 100 }, (_, index) => ({
      note: `ate a Brand${index} thing`,
      items: null,
    }));
    expect(productVocabulary(meals, 5)).toHaveLength(5);
  });

  it("returns nothing rather than throwing on empty history", () => {
    expect(productVocabulary([])).toEqual([]);
    expect(productVocabulary([{ note: null, items: null }])).toEqual([]);
  });
});

describe("transcriptOf", () => {
  it("returns the model's output", () => {
    expect(
      transcriptOf({
        steps: [{ type: "model_output", content: [{ type: "text", text: "two eggs" }] }],
      }),
    ).toBe("two eggs");
  });

  it("skips a thought step rather than reading it as speech", () => {
    // A response can lead with reasoning. Taking steps[0] would put the
    // model's private thinking into the box as though it were what was said.
    expect(
      transcriptOf({
        steps: [
          { type: "thought", content: [{ type: "text", text: "the user is listing food" }] },
          { type: "model_output", content: [{ type: "text", text: "two eggs" }] },
        ],
      }),
    ).toBe("two eggs");
  });

  it("survives a shape it does not recognise", () => {
    expect(transcriptOf(null)).toBe("");
    expect(transcriptOf({})).toBe("");
    expect(transcriptOf({ steps: "nope" })).toBe("");
  });
});

describe("transcribeAudio", () => {
  const originalKey = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key";
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env.GEMINI_API_KEY = originalKey;
  });

  it("returns what was said", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(flashSaid("Two eggs on toast."));
    const result = await transcribeAudio({ audioBase64: "AAAA", mimeType: "audio/webm" });
    expect(result.text).toBe("Two eggs on toast.");
  });

  it("trims the model's stray whitespace", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(flashSaid("  Two eggs.\n"));
    const result = await transcribeAudio({ audioBase64: "AAAA", mimeType: "audio/webm" });
    expect(result.text).toBe("Two eggs.");
  });

  it("treats silence as an error rather than emptying the box", async () => {
    // The caller adds the transcript to whatever is already typed. An empty
    // string returned as success would look like it worked and change nothing.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(flashSaid("   "));
    await expect(
      transcribeAudio({ audioBase64: "AAAA", mimeType: "audio/webm" }),
    ).rejects.toThrow(/nothing was said/i);
  });

  it("refuses a media type it cannot send", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(
      transcribeAudio({ audioBase64: "AAAA", mimeType: "video/mp4" }),
    ).rejects.toThrow(/cannot transcribe/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses an empty recording without calling anything", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(
      transcribeAudio({ audioBase64: "", mimeType: "audio/webm" }),
    ).rejects.toThrow(/nothing was recorded/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends the audio and the vocabulary hints", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(flashSaid("A Skyr yoghurt."));
    await transcribeAudio({
      audioBase64: "AAAA",
      mimeType: "audio/mp4",
      vocabulary: ["Skyr", "Mr Kipling"],
    });
    const body = JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body));
    const parts = body.contents[0].parts;
    expect(parts[0].inlineData).toMatchObject({ mimeType: "audio/mp4", data: "AAAA" });
    expect(parts[1].text).toContain("Skyr");
    expect(parts[1].text).toContain("Mr Kipling");
  });

  it("refuses a truncated transcript instead of passing off half a sentence", async () => {
    // The failure that reads as success. Thinking is billed against the same
    // cap as the answer, so a long take can leave a few tokens to reply with —
    // and a fragment of the middle of a sentence looks exactly like a whole
    // one by the time it is sitting in the box waiting to be logged.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      json({
        candidates: [
          { content: { parts: [{ text: " crisps and" }] }, finishReason: "MAX_TOKENS" },
        ],
        usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 3, thoughtsTokenCount: 393 },
      }),
    );
    await expect(
      transcribeAudio({ audioBase64: "AAAA", mimeType: "audio/webm" }),
    ).rejects.toThrow(/shorter takes/i);
  });

  it("says so plainly when the quota is gone", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      json({ error: { code: 429, message: "quota", status: "RESOURCE_EXHAUSTED" } }, 429),
    );
    await expect(
      transcribeAudio({ audioBase64: "AAAA", mimeType: "audio/webm" }),
    ).rejects.toThrow(/quota/i);
  });
});
