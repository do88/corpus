import { getStore } from "@netlify/blobs";
import type { Config } from "@netlify/functions";
import { estimateMeal } from "../../src/lib/meal/estimate";
import type { Job } from "../../src/lib/jobs/job";

/**
 * Phase 0 spike: prove the background worker can do the three things the real
 * pipeline depends on.
 *
 *   1. Run past 30 s — the cap on Scheduled Functions, which is why the job
 *      queue has to be a *background* function (15 min) instead.
 *   2. Write its result somewhere durable that outlives the request, so the
 *      phone can put a meal in the outbox and close the app.
 *   3. Survive a failure. Netlify retries a failed background invocation at
 *      1 min and again at 2 min, then gives up.
 *
 * `holdMs` and `failTimes` exist only to exercise 1 and 3 on demand — the real
 * job never sets them.
 */
export default async (req: Request) => {
  const { id, note, imageBase64, holdMs = 0, failTimes = 0 } = await req.json();
  const store = getStore("jobs");

  const previous = await store.get(id, { type: "json" });
  const attempts = ((previous as Job | null)?.attempts ?? 0) + 1;
  const startedAt = new Date().toISOString();

  const save = (patch: Partial<Job>) =>
    store.setJSON(id, { ...(previous ?? {}), id, note, attempts, startedAt, ...patch });

  await save({ status: "running" });

  // Fail on purpose for the first `failTimes` attempts. The counter lives in
  // the store, so a retry can see how many times it has already been tried —
  // Netlify tells the invocation nothing about which attempt it is.
  if (attempts <= failTimes) {
    await save({ status: "failed", error: `deliberate failure on attempt ${attempts}` });
    throw new Error(`deliberate failure on attempt ${attempts}`);
  }

  try {
    const result = await estimateMeal({ note, imageBase64 });
    if (holdMs > 0) await new Promise((resolve) => setTimeout(resolve, holdMs));
    const finishedAt = new Date().toISOString();
    await save({
      status: "done",
      estimate: result.estimate,
      latencyMs: result.latencyMs,
      finishedAt,
      heldForMs: Date.parse(finishedAt) - Date.parse(startedAt),
    });
  } catch (error) {
    await save({
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    });
    throw error; // Non-2xx is what tells Netlify to retry.
  }
};

export const config: Config = {
  background: true,
  path: "/jobs/enqueue",
};
