/**
 * Which model should be writing down what you said?
 *
 * `gemini-3.5-transcribe` is the one built for the job and it is not the one
 * this app uses, which is a claim that should be re-checkable rather than
 * taken on trust. This runs the same clips through the specialist's two modes
 * and through the generalist the app already calls, and prints what each one
 * heard so the difference can be read rather than argued about.
 *
 *   pnpm probe:transcribe path/to/clip.m4a [more.m4a …]
 *
 * There is no pass or fail here. Cleanup quality is a judgement, and a script
 * that scored it would only be encoding mine. Read the four lines.
 *
 * Making a clip on a Mac, if you have none to hand:
 *
 *   say -o clip.aiff "um so I had two, no, three slices of toast"
 *   afconvert -f mp4f -d aac clip.aiff clip.m4a
 *
 * Synthetic speech is a weak test of exactly the thing custom vocabulary is
 * for — it pronounces "Skyr" perfectly, so the hint never has to rescue
 * anything. Record yourself for a real answer.
 */
import { readFileSync } from "node:fs";
import { transcriptOf } from "../src/lib/meal/transcribe";

const KEY = process.env.GEMINI_API_KEY;
if (!KEY) throw new Error("GEMINI_API_KEY is not set");

const clips = process.argv.slice(2);
if (clips.length === 0) throw new Error("Give it at least one audio file");

/** Brands to hint with. Stand-in for what the route pulls from the log. */
const VOCAB = ["Skyr", "Mr Kipling", "Grenade", "Huel", "Weetabix", "biltong"];

const INTERACTIONS = "https://generativelanguage.googleapis.com/v1beta/interactions";
const FLASH = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent";

function mimeOf(path: string): string {
  if (path.endsWith(".m4a") || path.endsWith(".mp4")) return "audio/mp4";
  if (path.endsWith(".webm")) return "audio/webm";
  if (path.endsWith(".wav")) return "audio/wav";
  if (path.endsWith(".mp3")) return "audio/mpeg";
  throw new Error(`Unknown audio type for ${path}`);
}

async function specialist(
  label: string,
  audio: string,
  mimeType: string,
  config: Record<string, unknown>,
): Promise<void> {
  const startedAt = Date.now();
  const response = await fetch(INTERACTIONS, {
    method: "POST",
    headers: { "x-goog-api-key": KEY!, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gemini-3.5-transcribe",
      input: [{ type: "audio", data: audio, mime_type: mimeType }],
      generation_config: { transcription_config: config },
    }),
  });
  const took = Date.now() - startedAt;
  if (!response.ok) {
    console.log(`  ${label.padEnd(26)} HTTP ${response.status}`);
    return;
  }
  console.log(`  ${label.padEnd(26)} ${transcriptOf(await response.json())}   [${took}ms]`);
}

async function generalist(audio: string, mimeType: string): Promise<void> {
  const startedAt = Date.now();
  const response = await fetch(FLASH, {
    method: "POST",
    headers: { "x-goog-api-key": KEY!, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType, data: audio } },
            {
              text: `Write down what this person said about food. Remove filler words and false starts. Apply spoken corrections rather than recording them. Keep quantities and brands exactly as spoken. UK spelling. Product names that may come up: ${VOCAB.join(", ")}. Reply with the sentence and nothing else.`,
            },
          ],
        },
      ],
      generationConfig: { thinkingConfig: { thinkingLevel: "LOW" }, maxOutputTokens: 400 },
    }),
  });
  const took = Date.now() - startedAt;
  const body = await response.json();
  const text = (body.candidates?.[0]?.content?.parts ?? [])
    .map((part: { text?: string }) => part.text ?? "")
    .join(" ")
    .trim();
  console.log(`  ${"flash (in use)".padEnd(26)} ${text}   [${took}ms]`);
}

for (const clip of clips) {
  const mimeType = mimeOf(clip);
  const audio = readFileSync(clip).toString("base64");
  console.log(`\n${clip}`);
  await specialist("specialist verbatim", audio, mimeType, {
    mode: { type: "verbatim" },
    language_codes: ["en-GB"],
  });
  await specialist("specialist smart", audio, mimeType, {
    mode: { type: "smart" },
    language_codes: ["en-GB"],
  });
  await specialist("specialist smart + vocab", audio, mimeType, {
    mode: { type: "smart" },
    language_codes: ["en-GB"],
    custom_vocabulary: VOCAB,
  });
  await generalist(audio, mimeType);
}
