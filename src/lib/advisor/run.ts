import { ApiError, GoogleGenAI, ThinkingLevel, type Content, type Part } from "@google/genai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { looksLikeAnOption, type Advice } from "@/lib/meal/advise";
import { buildAdvisorPrompt, type DayState } from "./prompt";
import { buildAdvisorTools } from "./tools";
import type { AdvisorEvent } from "./events";
import type { AdvisorTurn } from "./thread";

/**
 * One turn of the advisor: look things up, then answer.
 *
 * The shape is the ordinary tool loop. Ask the model; if it wants a look-up,
 * run it and ask again with the answer; stop when it stops asking. What
 * deserves explaining is the three things that stop it running away, because
 * a loop with a model deciding when to exit needs all three.
 *
 * A **call budget**, because a model that keeps looking things up is not
 * thinking, it is stuck. At the ceiling it is told, in the conversation, to
 * answer with what it has — a note rather than a hard cut, so the reply is a
 * real answer that says what it could not check rather than a truncation.
 *
 * A **wall clock**, because this is the one call in the app somebody is
 * sitting waiting for.
 *
 * An **iteration cap**, which is the backstop for the other two both being
 * wrong.
 *
 * Pure over an `emit` callback, so the route is a thin shell and a test can
 * drive the whole loop without a server.
 */

export const ADVISE_MODEL = "gemini-3.7-flash";

/** Look-ups per answer. Past this the model is told to answer with what it has. */
const MAX_TOOL_CALLS = 8;
/** The backstop if the budget note is ignored. */
const MAX_ITERATIONS = 10;
const WALL_CLOCK_MS = 45_000;
const MAX_OUTPUT_TOKENS = 1_400;

const WRAP_UP_NOTE =
  "[System note] You have used all the look-ups for this answer. Do not call any more tools. Answer now with what you have, and say plainly what you could not check.";

export type RunResult = {
  /** What the model wrote, which may be empty when the card says it all. */
  text: string;
  advice: Advice | null;
  toolCalls: number;
};

/**
 * The thread as the model should see it.
 *
 * A summary goes in as a note rather than as somebody's turn, because it is
 * neither: it is the app describing a conversation that has been folded up.
 * A model turn carries the card it produced, so what the model sees itself
 * having said is what the person was actually shown.
 */
export function toContents(history: AdvisorTurn[]): Content[] {
  return history.map((turn): Content => {
    if (turn.role === "summary") {
      return {
        role: "user",
        parts: [{ text: `[Earlier in this conversation, summarised] ${turn.text}` }],
      };
    }
    if (turn.role === "model" && turn.advice) {
      return {
        role: "model",
        parts: [{ text: `${turn.text}\n[Recommended: ${JSON.stringify(turn.advice)}]`.trim() }],
      };
    }
    return { role: turn.role === "model" ? "model" : "user", parts: [{ text: turn.text }] };
  });
}

export async function runAdvisor(args: {
  supabase: SupabaseClient;
  question: string;
  history: AdvisorTurn[];
  day: DayState;
  today: string;
  emit: (event: AdvisorEvent) => void;
  signal?: AbortSignal;
}): Promise<RunResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");

  const ai = new GoogleGenAI({ apiKey: key });
  const tools = buildAdvisorTools(args.supabase, args.today);
  const deadline = Date.now() + WALL_CLOCK_MS;

  const contents: Content[] = [
    ...toContents(args.history),
    { role: "user", parts: [{ text: args.question }] },
  ];

  let text = "";
  let advice: Advice | null = null;
  let toolCalls = 0;
  let wrappedUp = false;

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    let stepText = "";
    const calls: { name: string; args: Record<string, unknown> }[] = [];

    let stream;
    try {
      stream = await ai.models.generateContentStream({
        model: ADVISE_MODEL,
        contents,
        config: {
          systemInstruction: buildAdvisorPrompt(args.day, args.today),
          // Low, as before: this is a comparison of a few numbers against two
          // targets, and it is the one call somebody waits on in real time.
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          // Withheld once the budget is spent, so the model cannot keep
          // calling tools it has just been told to stop calling.
          tools: wrappedUp ? undefined : [{ functionDeclarations: tools.declarations }],
          httpOptions: { timeout: Math.max(5_000, deadline - Date.now()) },
          abortSignal: args.signal,
        },
      });

      for await (const chunk of stream) {
        const delta = chunk.text;
        if (delta) {
          stepText += delta;
          args.emit({ type: "text", delta });
        }
        for (const call of chunk.functionCalls ?? []) {
          if (call.name) calls.push({ name: call.name, args: call.args ?? {} });
        }
      }
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 429) throw new Error("Gemini quota exceeded; try again shortly");
        throw new Error(`Gemini request failed (${error.status})`);
      }
      throw error;
    }

    text += stepText;
    if (calls.length === 0) break;

    // The model's own turn goes back verbatim, calls included, or the next
    // request has a function response answering nothing.
    const modelParts: Part[] = [];
    if (stepText) modelParts.push({ text: stepText });
    for (const call of calls) modelParts.push({ functionCall: { name: call.name, args: call.args } });
    contents.push({ role: "model", parts: modelParts });

    const responses: Part[] = [];
    for (const call of calls) {
      toolCalls += 1;
      args.emit({ type: "tool", label: tools.label(call.name, call.args) });
      const result = await tools.execute(call.name, call.args);
      if (result.recommendation) advice = result.recommendation;
      responses.push({
        functionResponse: { name: call.name, response: { output: result.output } },
      });
    }

    const spent = toolCalls >= MAX_TOOL_CALLS || Date.now() > deadline;
    if (spent && !wrappedUp) {
      wrappedUp = true;
      responses.push({ text: WRAP_UP_NOTE });
    }
    contents.push({ role: "user", parts: responses });
  }

  // The prompt is asked not to invent food; this is what makes it true. What
  // counts as offered now includes the saved foods it actually looked up,
  // because those are food this person has — but only if it found them rather
  // than remembered them.
  if (advice) {
    const offered = [
      args.question,
      ...args.history.filter((turn) => turn.role === "user").map((turn) => turn.text),
      ...tools.seenFoods(),
    ].join(" ");
    if (!looksLikeAnOption(advice.pick, offered)) {
      throw new Error("Could not choose from those options — try naming them more plainly");
    }
  }

  if (!text.trim() && !advice) throw new Error("No answer came back");
  return { text: text.trim(), advice, toolCalls };
}
