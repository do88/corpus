import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isOwner } from "@/lib/auth/owner";
import { adviseMeal } from "@/lib/meal/advise";
import { createClient } from "@/lib/supabase/server";
import { listMealsInRange, localDay } from "@/lib/meals/repository";
import { loadTargets } from "@/lib/meals/load-targets";
import { summarise } from "@/lib/meals/summary";

/**
 * "I have these three things — which one?"
 *
 * The day's numbers are read here rather than accepted from the caller. They
 * are the entire basis of the answer, and a client that could post its own
 * totals could get the model to justify anything. It is also simply less to
 * send.
 *
 * Session-checked at the handler for the same reason `meals/analyze` is: there
 * is no RLS behind a paid Gemini call, so the proxy would otherwise be the
 * whole boundary, and getting it wrong costs credits rather than a blank page.
 */

/**
 * The exchange so far, oldest first, ending with what was just asked.
 *
 * Bounded on both axes because every turn is resent on every question, so an
 * unbounded thread is an unbounded prompt against a paid API. Twenty-one is
 * ten exchanges and the new question — far past the point where anyone is
 * still deciding what to eat.
 */
const turnSchema = z.object({
  role: z.enum(["user", "model"]),
  // Long enough for a rambling voice transcript.
  text: z.string().min(1).max(1000),
});

const requestSchema = z.object({
  turns: z.array(turnSchema).min(1).max(21),
});

const TIME = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "Europe/London",
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isOwner(user?.email)) {
    return NextResponse.json({ error: "Not the owner" }, { status: 401 });
  }

  let body: z.infer<typeof requestSchema>;
  try {
    body = requestSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  try {
    const day = localDay();
    const [meals, targets] = await Promise.all([
      listMealsInRange(supabase, day, day),
      loadTargets(supabase),
    ]);
    // Reuses the day rollup rather than re-summing here, so "what has been
    // eaten" means the same thing on this screen as on Progress — pending and
    // failed meals excluded alike.
    const today = summarise(meals, [day], targets).days[0];

    const advice = await adviseMeal(body.turns, {
      consumed: {
        kcal: today.kcal,
        protein_g: today.protein_g,
        carbs_g: today.carbs_g,
        fat_g: today.fat_g,
      },
      targets,
      time: TIME.format(new Date()),
    });

    return NextResponse.json(advice);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[advise]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const maxDuration = 30;
