import { ApiError, GoogleGenAI, ThinkingLevel } from "@google/genai";
import { MEAL_MODEL } from "./estimate";

/**
 * Speech into the box you were going to type in.
 *
 * The first attempt at voice used the browser's own dictation and was removed
 * within a day: you could not see what it had heard, and what it heard was
 * wrong. Both halves are addressed here. It records while you speak and
 * transcribes once you stop — the same shape Wispr Flow uses, and not an
 * accident of implementation: text that arrives all at once, into an editable
 * field, is text you can check before it becomes a meal.
 *
 * Nothing is logged from this directly. The words land in the composer and you
 * press the same button you always press.
 *
 * ---
 *
 * Which model, and why not the one built for this.
 *
 * Google ships `gemini-3.5-transcribe`, a dedicated speech model with a "smart"
 * mode advertised to strip fillers and resolve spoken self-corrections, and a
 * custom-vocabulary list. It is the obvious choice and it is not the one used
 * here, because it was measured against the generalist this app already calls
 * and lost twice. On "I had two, no, three slices of toast", smart mode
 * returned "two, no, three slices" — fillers gone, the correction left in. On a
 * second clip it left the fillers in too, so its cleanup is not even
 * consistent. Flash returned "three slices", and "four squares" for "a couple
 * of squares … maybe four squares actually", and it was faster doing it.
 *
 * That is not a defect in the speech model so much as a difference in job.
 * Deciding that "no, sorry, it was a tuna one" retracts the chicken is
 * comprehension, not transcription, and the downstream estimator needs the
 * retraction already applied — it is going to count what the sentence says.
 *
 * So the specialist stays implemented, one constant away, because the finding
 * is two synthetic clips deep and its custom-vocabulary list never got a fair
 * test: text-to-speech pronounces "Skyr" perfectly, which is exactly the case
 * vocabulary hints exist to rescue. Real speech in a real kitchen may say
 * otherwise. `pnpm probe:transcribe` re-runs the comparison.
 */

/** Which of the two implementations below runs. See the note above. */
export const TRANSCRIBE_STRATEGY: "flash" | "specialist" = "flash";

export const TRANSCRIBE_MODEL = TRANSCRIBE_STRATEGY === "flash" ? MEAL_MODEL : "gemini-3.5-transcribe";

/**
 * What a browser might hand us. `MediaRecorder` picks the container, and the
 * two that matter disagree: Chrome and Android give WebM/Opus, iOS Safari
 * gives MP4/AAC. Both are listed because the alternative is a feature that
 * works everywhere except the phone it was built for.
 */
export const AUDIO_TYPES = [
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/aac",
] as const;

export type AudioType = (typeof AUDIO_TYPES)[number];

/** `audio/webm;codecs=opus` is what a browser actually reports. */
export function isSupportedAudioType(mimeType: string): mimeType is AudioType {
  const base = mimeType.split(";")[0]!.trim().toLowerCase();
  return (AUDIO_TYPES as readonly string[]).includes(base);
}

export type TranscribeInput = {
  /** Base64 audio, as recorded. */
  audioBase64: string;
  mimeType: string;
  /**
   * Product names to expect. Drawn from what has actually been logged, so the
   * hint is a list of things this person eats rather than a guess about what
   * anyone might. A brand heard correctly once should not need luck twice.
   */
  vocabulary?: string[];
};

export type TranscribeResult = {
  text: string;
  model: string;
  latencyMs: number;
};

/** Longer than anyone talks about a sandwich, short enough to bound the call. */
const TIMEOUT_MS = 30_000;

/**
 * The brand names this person actually eats, out of what they have logged.
 *
 * A generic hint list would be a guess about what anyone might eat. This is a
 * record of what one person does eat, which is a much better prior: the reason
 * browser dictation mangled "Mr Kipling" is that it had no idea what the app
 * was for, and by the second time you log something the app does.
 *
 * Proper nouns are picked out by capitalisation, and runs of capitalised words
 * are kept together so "Mr Kipling" survives as one term rather than two
 * useless ones.
 *
 * Notes and item names are read by different rules, because a capital means
 * different things in each. A note is a sentence someone typed, so its first
 * word is capitalised by grammar and "Toast with peanut butter" must not teach
 * it that Toast is a brand. An item name is a label the estimator wrote, where
 * the first word is as much a part of the name as the rest — skipping it there
 * turns "Grenade Protein Bar" into "Protein Bar", which is the opposite of the
 * point.
 */
export function productVocabulary(
  sources: Array<{ note: string | null; items: Array<{ name: string }> | null }>,
  limit = 40,
): string[] {
  const counts = new Map<string, { term: string; count: number }>();

  for (const source of sources) {
    harvest(counts, source.note ?? "", { skipFirstWord: true });
    for (const item of source.items ?? []) harvest(counts, item.name, { skipFirstWord: false });
  }

  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term))
    .slice(0, limit)
    .map((entry) => entry.term);
}

function harvest(
  counts: Map<string, { term: string; count: number }>,
  text: string,
  { skipFirstWord }: { skipFirstWord: boolean },
): void {
  for (const clause of text.split(/[.!?\n,;:()]+/)) {
    const words = clause.trim().split(/\s+/).filter(Boolean);
    let run: string[] = [];
    words.forEach((raw, index) => {
      const word = raw.replace(/[^A-Za-z0-9'&-]/g, "");
      const positional = skipFirstWord && index === 0;
      const proper = !positional && /^[A-Z][A-Za-z0-9'&-]*$/.test(word) && word.length > 1;
      if (proper) {
        run.push(word);
        return;
      }
      if (run.length) add(counts, run.join(" "));
      run = [];
    });
    if (run.length) add(counts, run.join(" "));
  }
}

function add(counts: Map<string, { term: string; count: number }>, term: string): void {
  if (term.length < 2) return;
  const key = term.toLowerCase();
  const existing = counts.get(key);
  if (existing) existing.count += 1;
  else counts.set(key, { term, count: 1 });
}

export async function transcribeAudio(input: TranscribeInput): Promise<TranscribeResult> {
  if (!input.audioBase64) throw new Error("Nothing was recorded");
  if (!isSupportedAudioType(input.mimeType)) {
    throw new Error(`Cannot transcribe ${input.mimeType}`);
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");

  const startedAt = Date.now();
  const text =
    TRANSCRIBE_STRATEGY === "flash"
      ? await viaFlash(key, input)
      : await viaSpecialist(key, input);

  const cleaned = text.trim();
  if (!cleaned) throw new Error("Nothing was said");

  return { text: cleaned, model: TRANSCRIBE_MODEL, latencyMs: Date.now() - startedAt };
}

/** A short list of brand names, if there are any worth mentioning. */
function vocabularyLine(vocabulary: string[] | undefined): string {
  const terms = (vocabulary ?? []).map((term) => term.trim()).filter(Boolean).slice(0, 60);
  return terms.length ? `\n\nProduct names that may come up: ${terms.join(", ")}.` : "";
}

const TRANSCRIBE_PROMPT = `Write down what this person said about food they ate or have in.

- Remove filler words, stammers and false starts.
- Apply spoken corrections rather than recording them. "Two, no, three slices"
  is three slices. "A chicken salad, no sorry a tuna one" is a tuna salad.
  Whatever they settled on is what they said.
- Keep quantities, brands and portion words exactly as spoken otherwise. Do not
  round, convert, add or estimate anything. You are not judging the food.
- UK spelling and UK product names.
- If there is no speech, reply with nothing at all.

Reply with the sentence and nothing else — no preamble, no quotation marks.`;

/**
 * The generalist, through the SDK, the same way every other call in this app
 * is made. Low thinking: rewriting one spoken sentence is not a problem to be
 * reasoned about, and this is a call someone is stood there waiting on.
 */
async function viaFlash(key: string, input: TranscribeInput): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: key });
  try {
    const response = await ai.models.generateContent({
      model: MEAL_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: input.mimeType, data: input.audioBase64 } },
            { text: `${TRANSCRIBE_PROMPT}${vocabularyLine(input.vocabulary)}` },
          ],
        },
      ],
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        maxOutputTokens: 400,
        httpOptions: { timeout: TIMEOUT_MS },
      },
    });
    return response.text ?? "";
  } catch (error) {
    throw asFriendlyError(error);
  }
}

/**
 * The dedicated speech model, over REST.
 *
 * There is no SDK method for it: `client.interactions` is in Google's
 * documentation but not in `@google/genai`, and 2.19.0 is the newest published
 * version. So this is a plain POST, which is all it ever was — audio goes
 * inline as base64 under the API's 20 MB request ceiling, and the Files API
 * the transcribe docs describe is not needed at this size. When the SDK
 * catches up, this function is what gets deleted.
 */
async function viaSpecialist(key: string, input: TranscribeInput): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: "gemini-3.5-transcribe",
        input: [{ type: "audio", data: input.audioBase64, mime_type: input.mimeType }],
        generation_config: {
          transcription_config: {
            mode: { type: "smart" },
            language_codes: ["en-GB"],
            ...(input.vocabulary?.length
              ? { custom_vocabulary: input.vocabulary.slice(0, 1000) }
              : {}),
          },
        },
      }),
    });
  } catch (error) {
    throw asFriendlyError(error);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    if (response.status === 429) throw new Error("Gemini quota exceeded; try again shortly");
    throw new Error(`Transcription failed (${response.status})`);
  }
  return transcriptOf(await response.json());
}

/**
 * The words out of an interaction.
 *
 * Steps are filtered by type rather than taken by index: a response can carry
 * a `thought` step before its output, and reading position 0 would return the
 * model's reasoning as though it were what the person said.
 */
export function transcriptOf(body: unknown): string {
  const steps = (body as { steps?: unknown[] } | null)?.steps;
  if (!Array.isArray(steps)) return "";
  return steps
    .filter((step): step is { type: string; content?: unknown[] } =>
      typeof step === "object" && step !== null && (step as { type?: unknown }).type === "model_output",
    )
    .flatMap((step) => (Array.isArray(step.content) ? step.content : []))
    .filter((part): part is { type: string; text: string } =>
      typeof part === "object" &&
      part !== null &&
      (part as { type?: unknown }).type === "text" &&
      typeof (part as { text?: unknown }).text === "string",
    )
    .map((part) => part.text)
    .join(" ")
    .trim();
}

function asFriendlyError(error: unknown): Error {
  if (error instanceof ApiError) {
    if (error.status === 429) return new Error("Gemini quota exceeded; try again shortly");
    return new Error(`Transcription failed (${error.status})`);
  }
  if (error instanceof Error && error.name === "AbortError") {
    return new Error("Transcription timed out");
  }
  return error instanceof Error ? error : new Error("Transcription failed");
}
