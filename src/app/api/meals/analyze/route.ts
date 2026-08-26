// A synchronous estimate, kept deliberately.
//
// The logging loop does not use this — it writes a row and lets the background
// worker fill it in. This stays because it is the shortest path to checking
// whether the model is still giving sane answers, without a photo, a row or a
// worker in the way.
//
// `server-only` sits here, not in lib/meal/estimate.ts, because that module is
// shared with the Netlify background function. The marker package throws on
// import outside Next's `react-server` condition, so it can only live at a
// Next-specific boundary. This route is that boundary for the browser.
import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isOwner } from "@/lib/auth/owner";
import { estimateMeal } from "@/lib/meal/estimate";
import { createClient } from "@/lib/supabase/server";

/**
 * Estimate a meal, return the result, persist nothing.
 *
 * The odd one out, security-wise, and worth saying why it checks the session
 * itself when nothing else in `app/` does. Everywhere else the proxy is a gate
 * and RLS is the boundary — get the gate wrong and a stranger sees an empty
 * app. There is no RLS behind a paid Gemini call. Here the proxy would be the
 * entire boundary, and the cost of it being wrong is billable credits rather
 * than a blank screen, so the check is repeated at the handler.
 */

/**
 * A 1024px JPEG from `compressForEstimate` is ~200 KB, so ~280 KB of base64.
 * 2 MB is the same ceiling the storage bucket sets: generous against a real
 * photo, and a bound rather than none.
 */
const MAX_IMAGE_BASE64 = 2 * 1024 * 1024;

const requestSchema = z.object({
  // Bounded because it is otherwise an unbounded upload into a 60-second
  // handler that forwards it to a paid API.
  imageBase64: z.string().max(MAX_IMAGE_BASE64).optional(),
  // The type annotation on `estimateMeal` is erased at runtime, so the union
  // has to be stated again here to actually constrain anything.
  imageMediaType: z.enum(["image/jpeg", "image/png", "image/webp"]).optional(),
  note: z.string().max(2000).optional(),
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
    // Deliberately not echoing the parse error: it would reflect the caller's
    // own payload back at them, and there is nothing here they can't see.
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  if (!body.imageBase64 && !body.note) {
    return NextResponse.json({ error: "Need a note or an image" }, { status: 400 });
  }

  try {
    return NextResponse.json(await estimateMeal(body));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[meals/analyze]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// The vision call runs a few seconds; give it room on the platform default.
export const maxDuration = 60;
