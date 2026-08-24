// `server-only` sits here, not in lib/meal/estimate.ts, because that module is
// shared with the Netlify background function. The marker package throws on
// import outside Next's `react-server` condition, so it can only live at a
// Next-specific boundary. This route is that boundary for the browser.
import "server-only";
import { NextResponse } from "next/server";
import { estimateMeal } from "@/lib/meal/estimate";

/**
 * Phase 0 spike: estimate a meal, return the result, persist nothing.
 *
 * In Phase 2 this work moves into a Netlify Background Function and writes to
 * Postgres instead of returning inline — but the estimation call itself is the
 * same, so this route is the thing being validated.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await estimateMeal({
      imageBase64: body.imageBase64,
      imageMediaType: body.imageMediaType,
      note: body.note,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[meals/analyze]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// The vision call runs a few seconds; give it room on the platform default.
export const maxDuration = 60;
