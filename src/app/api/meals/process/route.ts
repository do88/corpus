import "server-only";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { verifyOwner } from "@/lib/auth/verify";
import { processMeal } from "@/lib/meals/process";
import { createWorkerClient } from "@/lib/supabase/worker";

const requestSchema = z.object({
  mealId: z.uuid(),
});

/**
 * Local adapter for the Netlify background function.
 *
 * `next dev` has no `/jobs/estimate`, but it should exercise the same durable
 * row-processing path as production. This route is compile-time disabled in a
 * production build so there is still only one deployed entry point.
 */
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return new Response("Not found", { status: 404 });
  }

  const auth = await verifyOwner(request.headers.get("authorization"));
  if (!auth.ok) return new Response(auth.reason, { status: auth.status });

  let body: z.infer<typeof requestSchema>;
  try {
    body = requestSchema.parse(await request.json());
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const result = await processMeal(createWorkerClient(), body.mealId);
  return result.ok
    ? new Response("ok")
    : new Response(result.reason, { status: 500 });
}

export const maxDuration = 60;
