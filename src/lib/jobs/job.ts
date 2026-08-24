import type { MealEstimate } from "@/lib/meal/schema";

/**
 * One queued estimate, as it exists in the store.
 *
 * `attempts` is written by the worker rather than read from the request,
 * because a Netlify retry is an ordinary invocation — nothing in it says which
 * attempt it is, so the count has to be kept alongside the job itself.
 */
export type Job = {
  id: string;
  status: "running" | "done" | "failed";
  attempts: number;
  note?: string;
  startedAt: string;
  finishedAt?: string;
  estimate?: MealEstimate;
  /** Model time only. */
  latencyMs?: number;
  /** Wall-clock for the whole invocation — what proves it outran 30 s. */
  heldForMs?: number;
  error?: string;
};
