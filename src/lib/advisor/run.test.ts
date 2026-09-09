import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FALLBACK_TARGETS } from "@/lib/meals/targets";
import type { AdvisorEvent } from "./events";
import type { AdvisorTurn } from "./thread";

const generateContentStream = vi.fn();

vi.mock("@google/genai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@google/genai")>();
  return {
    ...actual,
    // `new GoogleGenAI(...)`, so the stub has to be constructible.
    GoogleGenAI: class {
      models = { generateContentStream };
    },
  };
});

const { runAdvisor, toContents } = await import("./run");

/**
 * One streamed response, in the shape the SDK really returns.
 *
 * Candidates and parts, not a convenience `functionCalls` array — an earlier
 * stub used the latter and hid a bug the real API rejected with a 400: Gemini
 * 3 attaches a `thoughtSignature` to every function call and refuses the next
 * request if it does not come back. A stub that cannot carry one cannot catch
 * that, so this one does.
 */
function reply(parts: { text?: string; calls?: { name: string; args: Record<string, unknown> }[] }) {
  const content: { parts: Record<string, unknown>[] } = { parts: [] };
  if (parts.text) content.parts.push({ text: parts.text });
  for (const call of parts.calls ?? []) {
    content.parts.push({
      functionCall: { name: call.name, args: call.args },
      thoughtSignature: `signature-for-${call.name}`,
    });
  }
  return Promise.resolve(
    (async function* () {
      yield { candidates: [{ content }] };
    })(),
  );
}

const day = {
  consumed: { kcal: 1211, protein_g: 96, carbs_g: 101, fat_g: 44 },
  targets: FALLBACK_TARGETS,
  time: "20:15",
};

/** `recommend` never touches the database, so these cases need no client. */
const noDatabase = {} as SupabaseClient;

async function run(question: string, history: AdvisorTurn[] = []) {
  const events: AdvisorEvent[] = [];
  const result = await runAdvisor({
    supabase: noDatabase,
    question,
    history,
    day,
    today: "2026-09-08",
    emit: (event) => events.push(event),
  });
  return { ...result, events };
}

const OPTIONS = "a tin of mackerel, two crumpets, or a protein yoghurt";

const recommend = (pick: string) => ({
  name: "recommend",
  args: { pick, kcal: 260, protein_g: 22, why: "The protein.", instead: "" },
});

describe("runAdvisor", () => {
  const originalKey = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key";
    generateContentStream.mockReset();
  });

  afterEach(() => {
    process.env.GEMINI_API_KEY = originalKey;
  });

  it("streams what it writes, a piece at a time", async () => {
    generateContentStream.mockReturnValueOnce(reply({ text: "You had 2,100 on Tuesday." }));
    const result = await run("what did I eat on Tuesday?");

    expect(result.text).toBe("You had 2,100 on Tuesday.");
    expect(result.events).toContainEqual({ type: "text", delta: "You had 2,100 on Tuesday." });
    expect(result.advice).toBeNull();
  });

  it("turns a recommendation into the card, and says what it is doing", async () => {
    generateContentStream
      .mockReturnValueOnce(reply({ calls: [recommend("A tin of mackerel")] }))
      .mockReturnValueOnce(reply({ text: "Waiting for you above." }));

    const result = await run(OPTIONS);

    expect(result.advice).toMatchObject({ pick: "A tin of mackerel", protein_g: 22 });
    expect(result.toolCalls).toBe(1);
    // The look-up narrates itself rather than leaving the screen still.
    expect(result.events).toContainEqual({ type: "tool", label: "putting that together" });
  });

  it("refuses a recommendation for food nobody mentioned", async () => {
    // The one hard guarantee: advice about a cupboard, not about an ideal diet.
    generateContentStream
      .mockReturnValueOnce(
        reply({ calls: [recommend("Greek yoghurt with berries and a handful of almonds")] }),
      )
      .mockReturnValueOnce(reply({ text: "There you go." }));

    await expect(run(OPTIONS)).rejects.toThrow(/could not choose/i);
  });

  it("counts an earlier question as things they have", async () => {
    // "I've also got eggs" two turns ago still puts eggs on the table.
    generateContentStream
      .mockReturnValueOnce(reply({ calls: [recommend("the scrambled eggs")] }))
      .mockReturnValueOnce(reply({ text: "" }));

    const history: AdvisorTurn[] = [
      {
        id: "1",
        role: "user",
        text: "I have also got scrambled eggs",
        advice: null,
        created_at: "2026-09-08T10:00:00Z",
      },
    ];
    await expect(run("what should I have?", history)).resolves.toMatchObject({
      advice: { pick: "the scrambled eggs" },
    });
  });

  it("stops asking for look-ups once the budget is spent", async () => {
    // A model that keeps asking for look-ups and never answers. The stub only
    // asks while it is actually offered tools, which is what the real one can
    // do — that is the property under test: withholding them forces an answer.
    //
    // An implementation rather than a value, because a generator is consumed
    // once and a shared one would be empty by the second iteration.
    generateContentStream.mockImplementation((request: { config: { tools?: unknown } }) =>
      request.config.tools
        ? reply({ calls: [{ name: "day_totals", args: { date: "2026-09-01" } }] })
        : reply({ text: "I ran out of look-ups before I could check that." }),
    );
    const supabase = {
      from: () => ({
        select: () => ({ gte: () => ({ lte: () => ({ order: () => ({ data: [], error: null }) }) }) }),
      }),
    } as unknown as SupabaseClient;

    const result = await runAdvisor({
      supabase,
      question: "how was last week?",
      history: [],
      day,
      today: "2026-09-08",
      emit: () => {},
    });
    expect(result.toolCalls).toBeLessThanOrEqual(8);
    expect(result.text).toContain("ran out of look-ups");
  });

  it("withholds the tools once it has told the model to stop", async () => {
    generateContentStream.mockImplementation(() =>
      reply({ text: "ok", calls: [{ name: "day_totals", args: {} }] }),
    );
    const supabase = {
      from: () => ({
        select: () => ({ gte: () => ({ lte: () => ({ order: () => ({ data: [], error: null }) }) }) }),
      }),
    } as unknown as SupabaseClient;

    await runAdvisor({
      supabase,
      question: "how was last week?",
      history: [],
      day,
      today: "2026-09-08",
      emit: () => {},
    });

    // Telling it to stop and leaving the tools in front of it is an invitation
    // to ignore the note, so the last request carries none.
    const last = generateContentStream.mock.calls.at(-1)?.[0];
    expect(last.config.tools).toBeUndefined();
  });

  it("hands the model's own parts back untouched, signature and all", async () => {
    // The 400 this exists to prevent: "Function call is missing a
    // thought_signature in functionCall parts". The signature is the model's
    // reasoning carried across the round trip, so it has to survive verbatim.
    generateContentStream
      .mockReturnValueOnce(reply({ calls: [{ name: "search_foods", args: { query: "" } }] }))
      .mockReturnValueOnce(reply({ text: "Nothing in there." }));

    const supabase = {
      from: () => ({
        select: () => ({ order: () => ({ order: () => ({ data: [], error: null }) }) }),
      }),
    } as unknown as SupabaseClient;

    await runAdvisor({
      supabase,
      question: "what have I got?",
      history: [],
      day,
      today: "2026-09-09",
      emit: () => {},
    });

    const second = generateContentStream.mock.calls[1][0];
    const modelTurn = second.contents.find(
      (c: { role: string }) => c.role === "model",
    );
    expect(modelTurn.parts[0].thoughtSignature).toBe("signature-for-search_foods");
  });

  it("says so rather than returning nothing at all", async () => {
    generateContentStream.mockReturnValueOnce(reply({ text: "" }));
    await expect(run("hello")).rejects.toThrow(/no answer/i);
  });
});

describe("toContents", () => {
  const turn = (role: AdvisorTurn["role"], text: string, advice = null): AdvisorTurn => ({
    id: role + text,
    role,
    text,
    advice,
    created_at: "2026-09-08T10:00:00Z",
  });

  it("keeps who said what", () => {
    expect(toContents([turn("user", "eggs?"), turn("model", "Yes.")])).toEqual([
      { role: "user", parts: [{ text: "eggs?" }] },
      { role: "model", parts: [{ text: "Yes." }] },
    ]);
  });

  it("puts a fold in as a note, not as somebody's turn", () => {
    // It is neither of them talking: it is the app describing a conversation
    // that has been folded up.
    const [content] = toContents([turn("summary", "They do not eat fish.")]);
    expect(content.role).toBe("user");
    expect(content.parts?.[0].text).toContain("summarised");
  });
});
