import "server-only";
import { after, NextResponse } from "next/server";
import { format } from "date-fns";
import { z } from "zod";
import { inZone, localDay } from "@/lib/time";
import { isOwner } from "@/lib/auth/owner";
import { createClient } from "@/lib/supabase/server";
import { listMealsInRange } from "@/lib/meals/repository";
import { loadTargets } from "@/lib/meals/load-targets";
import { summarise } from "@/lib/meals/summary";
import { encodeSseFrame, type AdvisorEvent } from "@/lib/advisor/events";
import { runAdvisor } from "@/lib/advisor/run";
import { compactIfNeeded } from "@/lib/advisor/compact";
import { appendTurn, clearThread, listTurns } from "@/lib/advisor/thread";

/**
 * A turn of the advisor, streamed.
 *
 * The day's numbers are read here rather than accepted from the caller. They
 * are part of the basis of every answer, and a client that could post its own
 * totals could get the model to justify anything. The same reasoning now
 * covers the whole conversation: the thread is read from the database, not
 * sent up, so the history the model sees is the history that happened.
 *
 * Session-checked at the handler for the same reason `meals/analyze` is: there
 * is no RLS behind a paid Gemini call, so the proxy would otherwise be the
 * whole boundary, and getting it wrong costs credits rather than a blank page.
 *
 * Streamed as Server-Sent Events because the answer now takes look-ups, and a
 * screen that sits still through three of them reads as broken. Errors go
 * *into* the stream once it has opened — a response cannot change its status
 * after its first byte, so a mid-run failure has to arrive as an event.
 */

const requestSchema = z.object({
  // Long enough for a rambling voice transcript, short enough that the
  // prompt cannot be flooded from the client.
  question: z.string().min(1).max(1000),
});

async function owner() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return isOwner(user?.email) ? supabase : null;
}

export async function POST(request: Request) {
  const supabase = await owner();
  if (!supabase) return NextResponse.json({ error: "Not the owner" }, { status: 401 });

  let body: z.infer<typeof requestSchema>;
  try {
    body = requestSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const question = body.question.trim();

  const today = localDay();
  const [meals, targets, history] = await Promise.all([
    listMealsInRange(supabase, today, today),
    loadTargets(supabase),
    listTurns(supabase),
  ]);
  // Reuses the day rollup rather than re-summing here, so "what has been
  // eaten" means the same thing on this screen as on Progress — pending and
  // failed meals excluded alike.
  const day = summarise(meals, [today], targets).days[0];

  // Written before the answer is attempted, so a question that fails is still
  // in the thread rather than vanishing along with the failure.
  await appendTurn(supabase, { role: "user", text: question });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: AdvisorEvent) => {
        controller.enqueue(encoder.encode(encodeSseFrame(event)));
      };
      const startedAt = Date.now();
      try {
        const result = await runAdvisor({
          supabase,
          question,
          history,
          today,
          day: {
            consumed: {
              kcal: day.kcal,
              protein_g: day.protein_g,
              carbs_g: day.carbs_g,
              fat_g: day.fat_g,
            },
            targets,
            time: format(inZone(), "HH:mm"),
          },
          emit,
          signal: request.signal,
        });

        if (result.advice) emit({ type: "advice", advice: result.advice });
        await appendTurn(supabase, {
          role: "model",
          // A turn must have text, and an answer can legitimately be only a
          // card, so the card's own reasoning stands in for the words.
          text: result.text || result.advice?.why || "(recommended)",
          advice: result.advice,
        });
        emit({ type: "done", toolCalls: result.toolCalls, durationMs: Date.now() - startedAt });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not get an answer";
        console.error("[advise]", error);
        emit({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });

  // After the answer, not before it: folding the thread is upkeep, and the
  // person waiting for advice should never pay for it.
  after(async () => {
    try {
      await compactIfNeeded(supabase);
    } catch (error) {
      console.error("[advise] compaction", error);
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
    },
  });
}

/** Start again. */
export async function DELETE() {
  const supabase = await owner();
  if (!supabase) return NextResponse.json({ error: "Not the owner" }, { status: 401 });
  try {
    await clearThread(supabase);
    return new Response(null, { status: 204 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not clear the conversation";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const maxDuration = 60;
