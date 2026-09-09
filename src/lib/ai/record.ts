import type { SupabaseClient } from "@supabase/supabase-js";
import { costMicros, formatCost, type TokenUsage } from "./cost";

/**
 * Write down what a call cost.
 *
 * **This never throws, and that is the whole design.** The cost of a meal
 * estimate is an accounting detail; the meal is the thing the person is
 * waiting for. A book-keeping row that could fail a meal — or fail an answer
 * the person is watching stream in — would be a measurement that damages what
 * it measures. So the insert is attempted, and a failure is a warning and
 * nothing else.
 *
 * The price is computed here rather than read back later, because the rate
 * moves: Gemini 3.7 Flash's introductory pricing doubles on 1 January 2027,
 * and a total re-derived afterwards would restate what last year cost.
 */

export type AiCallKind = "advisor" | "meal" | "lookup";

export async function recordAiCall(
  supabase: SupabaseClient,
  call: {
    kind: AiCallKind;
    /** The model asked for, not the version the provider reported back. */
    model: string;
    usage: TokenUsage;
    /** Advisor only: look-ups behind this answer. */
    toolCalls?: number;
    latencyMs?: number;
  },
): Promise<void> {
  const cost = costMicros(call.model, call.usage);

  // One line either way. The log is what makes a cost visible while it is
  // happening; the row is what makes September answerable. `warn` because the
  // lint rules allow only warn and error.
  console.warn(
    `[${call.kind}] ${formatCost(cost)} · ` +
      `${call.usage.input}+${call.usage.cachedInput} in, ${call.usage.output} out` +
      (call.toolCalls === undefined ? "" : ` · ${call.toolCalls} look-ups`),
  );

  // Caught, not just checked. supabase-js reports a rejected insert as an
  // `error` field, but a dead socket throws — and "never throws" has to be
  // true of the bad day, or it is not a guarantee, it is a hope.
  try {
    const { error } = await supabase.from("ai_call").insert({
      kind: call.kind,
      model: call.model,
      input_tokens: call.usage.input,
      cached_input_tokens: call.usage.cachedInput,
      output_tokens: call.usage.output,
      // Null rather than 0 when unpriced, which the column is nullable to
      // allow: a zero would be indistinguishable from a free call.
      cost_micros: cost,
      tool_calls: call.toolCalls ?? null,
      latency_ms: call.latencyMs ?? null,
    });
    if (error) throw new Error(error.message);
  } catch (thrown) {
    const message = thrown instanceof Error ? thrown.message : String(thrown);
    console.warn(`[ai_call] could not record what that cost: ${message}`);
  }
}
