// Speech to text, and nothing else.
//
// `server-only` for the same reason it sits on the analyze route: the module
// behind this is shared with code that runs outside Next, so the marker lives
// at the Next-specific boundary rather than in the library.
import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isOwner } from "@/lib/auth/owner";
import { AUDIO_TYPES, productVocabulary, transcribeAudio } from "@/lib/meal/transcribe";
import { recentMealNames } from "@/lib/meals/repository";
import { createClient } from "@/lib/supabase/server";

/**
 * Returns words. Writes nothing, logs no meal.
 *
 * The session is checked here rather than left to the proxy, on the same
 * reasoning as `meals/analyze`: there is no RLS behind a paid Gemini call, so
 * this handler is the whole boundary and the cost of getting it wrong is
 * billable rather than a blank screen.
 */

/**
 * Netlify passes a function at most 6 MB of request body. Four is well inside
 * that and still enormous for the job — a minute of Opus is around 120 KB
 * before base64. The ceiling is here so an unbounded upload cannot be pointed
 * at a paid API, not because anyone will approach it.
 */
const MAX_AUDIO_BASE64 = 4 * 1024 * 1024;

const requestSchema = z.object({
  audioBase64: z.string().min(1).max(MAX_AUDIO_BASE64),
  // Browsers report the codec too — "audio/webm;codecs=opus" — so this is a
  // prefix match against the containers we accept rather than an enum.
  mimeType: z
    .string()
    .max(80)
    .refine(
      (value) => AUDIO_TYPES.some((type) => value.toLowerCase().startsWith(type)),
      "Unsupported audio type",
    ),
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

  // Hints are an improvement, not a dependency. A failed read here costs
  // accuracy on unusual brand names; a thrown error would cost the feature.
  let vocabulary: string[] = [];
  try {
    vocabulary = productVocabulary(await recentMealNames(supabase));
  } catch (error) {
    console.error("[meals/transcribe] vocabulary", error);
  }

  try {
    const result = await transcribeAudio({ ...body, vocabulary });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[meals/transcribe]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// A few seconds of model time, plus the upload. The platform default is
// shorter than the tail of this, so it is raised the way analyze is.
export const maxDuration = 60;
