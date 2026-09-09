import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordAiCall } from "./record";

/**
 * The point of these is the swallowed failure.
 *
 * `recordAiCall` reports a broken insert as a warning and returns, which is
 * right — a book-keeping row must never fail the meal it is describing. But a
 * function that cannot fail loudly is a function that can stop working without
 * anyone noticing, which is how the service worker went months writing no
 * cookies. So the row it builds is asserted here rather than trusted.
 */

function clientThat(result: unknown) {
  const insert = vi.fn().mockResolvedValue(result);
  const client = { from: vi.fn(() => ({ insert })) } as unknown as SupabaseClient;
  return { client, insert };
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

const usage = { input: 1000, cachedInput: 200, output: 300 };

describe("recordAiCall", () => {
  it("writes the three token buckets and a price, to ai_call", async () => {
    const { client, insert } = clientThat({ error: null });
    await recordAiCall(client, { kind: "meal", model: "gemini-3.7-flash", usage, latencyMs: 4200 });

    expect(client.from).toHaveBeenCalledWith("ai_call");
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "meal",
        model: "gemini-3.7-flash",
        input_tokens: 1000,
        cached_input_tokens: 200,
        output_tokens: 300,
        latency_ms: 4200,
      }),
    );
    // 1000 × 0.75 + 200 × 0.075 + 300 × 3.75, per million, in microdollars.
    expect(insert.mock.calls[0][0].cost_micros).toBe(1890);
  });

  it("writes a null price for a model it cannot price, never a zero", async () => {
    const { client, insert } = clientThat({ error: null });
    await recordAiCall(client, { kind: "meal", model: "gemini-9-nonexistent", usage });
    expect(insert.mock.calls[0][0].cost_micros).toBeNull();
  });

  it("carries the look-up count for an advisor answer and null for a meal", async () => {
    const { client: a, insert: advisorInsert } = clientThat({ error: null });
    await recordAiCall(a, { kind: "advisor", model: "gemini-3.7-flash", usage, toolCalls: 5 });
    expect(advisorInsert.mock.calls[0][0].tool_calls).toBe(5);

    const { client: m, insert: mealInsert } = clientThat({ error: null });
    await recordAiCall(m, { kind: "meal", model: "gemini-3.7-flash", usage });
    expect(mealInsert.mock.calls[0][0].tool_calls).toBeNull();
  });

  it("returns quietly when the insert is refused", async () => {
    const { client } = clientThat({ error: { message: "permission denied for table ai_call" } });
    await expect(
      recordAiCall(client, { kind: "meal", model: "gemini-3.7-flash", usage }),
    ).resolves.toBeUndefined();
  });

  it("returns quietly when the client itself throws", async () => {
    // The case the advisor's own test stub turned out to be: a client with no
    // `from` at all. On a real day it is a dead socket, and either way the
    // meal must survive it.
    const broken = {} as unknown as SupabaseClient;
    await expect(
      recordAiCall(broken, { kind: "meal", model: "gemini-3.7-flash", usage }),
    ).resolves.toBeUndefined();
  });
});
