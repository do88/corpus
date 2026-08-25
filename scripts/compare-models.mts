/**
 * Compare models on the Phase 0 reference meals.
 *
 *     ANTHROPIC_API_KEY=… GEMINI_API_KEY=… pnpm compare:models
 *
 * The point of this is that cost is the easy number and accuracy is the one
 * that decides. A model at a tenth the price that reads a plate 20% low is not
 * cheaper, it is wrong more often — and the difference only shows against
 * meals whose real values are already known.
 *
 * So it runs the *same* system prompt and the *same* JSON schema through every
 * candidate, against the meals Phase 0 measured by hand, and prints the error
 * against those labels next to the measured cost per meal. Same prompt matters:
 * a comparison where each model gets its own tuned prompt measures the
 * prompting, not the models.
 *
 * Nothing here writes to the database or the app. It is a bench, not a feature.
 */
import Anthropic from "@anthropic-ai/sdk";
import { MEAL_SYSTEM_PROMPT } from "../src/lib/meal/prompt";
import { mealResponseSchema, totalsFor } from "../src/lib/meal/schema";
import { toStructuredOutputSchema } from "../src/lib/anthropic/schema";

/**
 * The Phase 0 meals, with the values measured by hand at the time.
 *
 * Text-only on purpose. A photo would test vision as well as estimation, and
 * these need to isolate one thing — a model that reads the picture well but
 * guesses portions badly should not be able to hide behind a good photo.
 */
const REFERENCE = [
  { note: "2 Weetabix with semi-skimmed milk and a banana", kcal: 305, protein: 12 },
  { note: "2 scoops of whey protein in water", kcal: 232, protein: 47 },
  { note: "A pint of lager and a packet of peanuts", kcal: 505, protein: 12 },
  { note: "A tin of mackerel and two slices of white toast", kcal: 540, protein: 34 },
] as const;

/** $ per million tokens, in/out. Update alongside the README's cost table. */
const PRICING: Record<string, { in: number; out: number }> = {
  "claude-opus-5": { in: 5, out: 25 },
  "claude-sonnet-5": { in: 2, out: 10 },
  "claude-haiku-4-5": { in: 1, out: 5 },
  // Gemini is billed per million tokens too. Only rates that have been checked
  // go here — a model with no entry prints "—" rather than a confident $0.00000,
  // because a made-up cost is worse than an absent one in a table whose whole
  // job is deciding on cost.
  "gemini-3.1-flash-lite": { in: 0.1, out: 0.4 },
  "gemini-flash-lite-latest": { in: 0.1, out: 0.4 },
};

type Result = {
  kcal: number;
  protein: number;
  latencyMs: number;
  usage: { input: number; output: number };
};

async function runClaude(model: string, note: string): Promise<Result> {
  const client = new Anthropic();

  // `effort` is not accepted on Haiku 4.5 — sending it is a 400, which is how
  // this first ran: four identical `invalid_request_error`s and no numbers. The
  // app sets `effort: "low"` deliberately (estimation, not reasoning), so the
  // comparison keeps it wherever the model supports it rather than dropping it
  // everywhere and measuring something the app does not do.
  const supportsEffort = !model.includes("haiku");

  const startedAt = Date.now();
  const response = await client.messages.create({
    model,
    max_tokens: 2000,
    system: MEAL_SYSTEM_PROMPT,
    output_config: {
      ...(supportsEffort ? { effort: "low" as const } : {}),
      format: { type: "json_schema", schema: toStructuredOutputSchema(mealResponseSchema) },
    },
    messages: [{ role: "user", content: [{ type: "text", text: `The user says: "${note}"` }] }],
  });
  const latencyMs = Date.now() - startedAt;

  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new Error("no text block");
  const parsed = mealResponseSchema.parse(JSON.parse(text.text));
  const totals = totalsFor(parsed.items);

  return {
    kcal: totals.kcal,
    protein: totals.protein_g,
    latencyMs,
    usage: { input: response.usage.input_tokens, output: response.usage.output_tokens },
  };
}

/**
 * Gemini's structured output is `responseSchema`, an OpenAPI subset — not JSON
 * Schema. It rejects `additionalProperties` and `$schema`, so the schema is
 * described here rather than reused from `toStructuredOutputSchema`, which
 * exists to satisfy Anthropic's own constraints. Same *shape*, same fields,
 * different dialect.
 */
const GEMINI_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          qty: { type: "string" },
          kcal: { type: "integer" },
          protein_g: { type: "integer" },
          carbs_g: { type: "integer" },
          fat_g: { type: "integer" },
        },
        required: ["name", "qty", "kcal", "protein_g", "carbs_g", "fat_g"],
      },
    },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    assumptions: { type: "string" },
  },
  required: ["items", "confidence", "assumptions"],
};

async function runGemini(model: string, note: string): Promise<Result> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");

  const startedAt = Date.now();
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-goog-api-key": key },
      body: JSON.stringify({
        // Gemini has no separate system role on this endpoint version;
        // `systemInstruction` is the equivalent slot.
        systemInstruction: { parts: [{ text: MEAL_SYSTEM_PROMPT }] },
        contents: [{ parts: [{ text: `The user says: "${note}"` }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: GEMINI_SCHEMA,
        },
      }),
    },
  );
  const latencyMs = Date.now() - startedAt;

  if (!response.ok) {
    const body = await response.text();
    // A 404 here means the model is not callable by this key, which is not the
    // same as not existing: `GET /v1beta/models` lists models the key cannot
    // actually invoke (`gemini-2.5-flash` is listed and 404s). Say so, rather
    // than repeating a wall of JSON four times.
    if (response.status === 404) {
      throw new Error(
        `404 — "${model}" is not callable by this key. ` +
          `List what is: curl -H "X-goog-api-key: $GEMINI_API_KEY" ` +
          `https://generativelanguage.googleapis.com/v1beta/models`,
      );
    }
    throw new Error(`${response.status} ${body.replace(/\s+/g, " ").slice(0, 110)}`);
  }
  const body = await response.json();

  const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("no text in response");

  // Validated against the *same* zod schema as the Claude path. A model that
  // returns plausible-looking JSON of the wrong shape should fail here rather
  // than quietly score well.
  const parsed = mealResponseSchema.parse(JSON.parse(text));
  const totals = totalsFor(parsed.items);

  return {
    kcal: totals.kcal,
    protein: totals.protein_g,
    latencyMs,
    usage: {
      input: body.usageMetadata?.promptTokenCount ?? 0,
      output: body.usageMetadata?.candidatesTokenCount ?? 0,
    },
  };
}

const CANDIDATES: { model: string; run: (m: string, n: string) => Promise<Result> }[] = [
  { model: "claude-opus-5", run: runClaude },
  { model: "claude-sonnet-5", run: runClaude },
  { model: "claude-haiku-4-5", run: runClaude },
  // Verified callable with the key this was built against. `gemini-2.5-flash`
  // is listed by the models endpoint and 404s on generateContent, so it is not
  // here — the list is broader than what a given key may actually invoke.
  { model: "gemini-3.1-flash-lite", run: runGemini },
  { model: "gemini-flash-lite-latest", run: runGemini },
  { model: "gemini-flash-latest", run: runGemini },
];

const pct = (got: number, want: number) => ((got - want) / want) * 100;

/**
 * Optional filters: `pnpm compare:models claude` runs only the Claude rows.
 *
 * Useful when one provider is unreachable, and useful for keeping the bill down
 * — every row here is real API calls against real money, four per model.
 */
const filters = process.argv.slice(2);
const selected = filters.length
  ? CANDIDATES.filter((c) => filters.some((f) => c.model.includes(f)))
  : CANDIDATES;

if (selected.length === 0) {
  console.log(`No model matched ${filters.join(", ")}. Available:`);
  for (const c of CANDIDATES) console.log(`  ${c.model}`);
  process.exit(1);
}

for (const { model, run } of selected) {
  console.log(`\n${model}`);
  let kcalErr = 0;
  let proteinErr = 0;
  let cost = 0;
  let latency = 0;
  let ok = 0;

  for (const meal of REFERENCE) {
    try {
      const r = await run(model, meal.note);
      const dk = pct(r.kcal, meal.kcal);
      const dp = pct(r.protein, meal.protein);
      kcalErr += Math.abs(dk);
      proteinErr += Math.abs(dp);
      latency += r.latencyMs;
      const price = PRICING[model];
      if (price) {
        cost += (r.usage.input * price.in + r.usage.output * price.out) / 1e6;
      }
      ok += 1;
      console.log(
        `  ${meal.note.slice(0, 38).padEnd(38)} ` +
          `${String(r.kcal).padStart(4)} kcal (${dk >= 0 ? "+" : ""}${dk.toFixed(0)}%)  ` +
          `${String(r.protein).padStart(3)} g P (${dp >= 0 ? "+" : ""}${dp.toFixed(0)}%)`,
      );
    } catch (error) {
      console.log(
        `  ${meal.note.slice(0, 38).padEnd(38)} FAILED  ${(error as Error).message.slice(0, 50)}`,
      );
    }
  }

  if (ok > 0) {
    console.log(
      `  ${"—".repeat(38)} mean |error| ${(kcalErr / ok).toFixed(1)}% kcal, ` +
        `${(proteinErr / ok).toFixed(1)}% protein · ` +
        `${PRICING[model] ? `$${(cost / ok).toFixed(5)}` : "cost —"}/meal · ` +
        `${Math.round(latency / ok)}ms`,
    );
  }
}

console.log(
  "\nCost is per text-only meal; a photo adds roughly 1,500 image tokens on top.\n" +
    "At six meals a day, multiply by 180 for a monthly figure.",
);
process.exit(0);
