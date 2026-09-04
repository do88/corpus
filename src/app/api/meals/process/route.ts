import "server-only";
import { after, type NextRequest } from "next/server";
import { z } from "zod";
import { verifyOwner } from "@/lib/auth/verify";
import { processMeal } from "@/lib/meals/process";
import { createWorkerClient } from "@/lib/supabase/worker";

/**
 * The estimate job.
 *
 * Answers 202 the moment the request is valid and runs the estimate after the
 * response has gone, with `after()`. That is the contract the client always
 * had: Netlify's background function returned 202 and carried on, so the
 * composer's analysing state and the outbox (lib/meals/enqueue.ts) are
 * unchanged by the move to Vercel.
 *
 * Authenticated by Bearer token rather than by cookie. The caller is the
 * outbox in the browser, which holds an access token but is not a page
 * navigation, and this path is excluded from the proxy's matcher for exactly
 * that reason.
 *
 * A failure here is written to the row by processMeal, so the UI can show it,
 * and the reconciler (app/api/cron/reconcile) picks the meal up again.
 */

// The ceiling for a Hobby function under Fluid compute. Gemini plus one retry
// fits well inside it.
export const maxDuration = 300;

const requestSchema = z.object({
  mealId: z.uuid(),
});

export async function POST(request: NextRequest) {
  const auth = await verifyOwner(request.headers.get("authorization"));
  if (!auth.ok) return new Response(auth.reason, { status: auth.status });

  let body: z.infer<typeof requestSchema>;
  try {
    body = requestSchema.parse(await request.json());
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  after(async () => {
    const result = await processMeal(createWorkerClient(), body.mealId);
    if (!result.ok) console.error(`estimate failed for ${body.mealId}: ${result.reason}`);
  });

  return new Response(null, { status: 202 });
}
