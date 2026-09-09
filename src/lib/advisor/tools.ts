import { Type, type FunctionDeclaration } from "@google/genai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { subDays } from "date-fns";
import { adviceSchema, type Advice } from "@/lib/meal/advise";
import { listMealsInRange, totalsForDay } from "@/lib/meals/repository";
import { listSavedFoods } from "@/lib/meals/saved";
import { loadTargets } from "@/lib/meals/load-targets";
import { datesBetween, summarise } from "@/lib/meals/summary";
import { dayEnergy, recentWatchDays } from "@/lib/garmin/repository";
import { parseDay, toDay } from "@/lib/time";

/**
 * What the advisor may look up.
 *
 * It used to be given three facts — today's totals, the targets, the clock —
 * and nothing else, which meant it could only ever answer the one question it
 * was built for: *of these things I have just typed out, which?* Every other
 * question a person actually has about their own food ("what did I eat on
 * Tuesday", "has my protein been bad this week", "what do I usually have for
 * breakfast") it had to refuse or invent, and inventing is worse.
 *
 * All of it was already queryable. These are the existing repository functions
 * with a description attached, which is the whole of what a tool is.
 *
 * Two rules hold across all of them.
 *
 * Everything is READ. Nothing here writes, and the one thing that changes the
 * log — `recommend` — only stages a card with a button on it, so a meal is
 * still logged by a person pressing something. That is not a permission system
 * and does not need to be: there is nothing else for it to reach.
 *
 * Every result comes back inside a `<data>` frame. A meal note is text a
 * person wrote, and a saved food's name is text a person wrote, and both are
 * about to be pasted into a prompt. The frame is what says "this is quoted
 * material, not an instruction to you", and the system prompt says the same.
 */

/** A tool result the model reads, plus a short line for the run's log. */
export type ToolResult = {
  output: string;
  summary: string;
  /** Set only by `recommend`: the card the person is shown. */
  recommendation?: Advice;
};

export type Toolset = {
  declarations: FunctionDeclaration[];
  /** What the screen says while this runs. */
  label(name: string, args: Record<string, unknown>): string;
  execute(name: string, args: Record<string, unknown>): Promise<ToolResult>;
  /**
   * Saved foods the model has actually been shown this run.
   *
   * The guard on the way out asks whether a pick came from what the person
   * offered; a food out of their own library is just as legitimate an answer,
   * but only if the model got it from a look-up rather than from thin air.
   */
  seenFoods(): string[];
};

/** Nothing the model reads may run away with the prompt. */
const MAX_OUTPUT_CHARS = 6_000;

/**
 * Up to this many saved foods come back whole rather than filtered.
 *
 * Forty lines is a page the model can hold in one look, and well under the
 * output cap above. Past it, searching earns its keep again.
 */
const WHOLE_LIBRARY = 40;

/** Quoted material, never instructions. */
function asData(name: string, text: string): string {
  const body =
    text.length > MAX_OUTPUT_CHARS
      ? `${text.slice(0, MAX_OUTPUT_CHARS)}\n…(truncated)`
      : text;
  return `<data source="${name}">\n${body}\n</data>`;
}

const n = (value: number) => value.toLocaleString("en-GB");

/** Clamp a model-supplied count into something a query can take. */
function count(raw: unknown, fallback: number, max: number): number {
  const value = Math.round(Number(raw));
  return Number.isFinite(value) && value > 0 ? Math.min(value, max) : fallback;
}

/** A model-supplied date, or today. */
function dateArg(raw: unknown, today: string): string {
  return typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : today;
}

export function buildAdvisorTools(supabase: SupabaseClient, today: string): Toolset {
  const seen = new Set<string>();

  const declarations: FunctionDeclaration[] = [
    {
      name: "day_totals",
      description:
        "What was eaten on one day: every meal with its calories and protein, and the day's totals against target. Use for 'what did I have on Tuesday' and to check a day before commenting on it.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          date: { type: Type.STRING, description: "The day, as YYYY-MM-DD. Defaults to today." },
        },
      },
    },
    {
      name: "recent_days",
      description:
        "How the last few days went: calories and protein per day, the average across the days that were logged, and how many days hit each target. Use for questions about a week or a pattern. Days with nothing logged are reported as unlogged, never as zero.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          days: { type: Type.INTEGER, description: "How many days back, 1 to 31. Default 7." },
        },
      },
    },
    {
      name: "search_foods",
      description:
        "Search the person's own saved foods — things they have eaten before and kept the figures for — by name or ingredient. These are foods they are known to have and to like. Use when they ask what they should have without listing options.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          query: {
            type: Type.STRING,
            description: "Words to match against the name and ingredients. Empty for the most-used.",
          },
        },
      },
    },
    {
      name: "watch_days",
      description:
        "What the watch recorded: steps and total calories burned per day, and the average daily burn. This is what the body actually costs, which is a different number from the calorie target. Use when the question is about deficit, burn or activity.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          days: { type: Type.INTEGER, description: "How many days back, 1 to 30. Default 7." },
        },
      },
    },
    {
      name: "body_and_targets",
      description:
        "The person's targets and where they come from: weight, lean mass, resting burn, the activity factor read from logged sessions, and the deficit those imply. Use when asked why a target is what it is, or whether it is right.",
      parameters: { type: Type.OBJECT, properties: {} },
    },
    {
      name: "recent_training",
      description:
        "Recent gym sessions: when, what was trained, and how much volume. Use when the question links eating to training — a hard session, a rest day, whether to eat more today.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          limit: { type: Type.INTEGER, description: "How many sessions, 1 to 10. Default 5." },
        },
      },
    },
    {
      name: "recommend",
      description:
        "Show the person a card recommending one thing to eat, with a Log it button. Call this ONLY when recommending something specific to eat now. The card carries your reasoning, so after calling it add at most one short sentence, or nothing at all.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          pick: { type: Type.STRING, description: "The option chosen, in the person's own words." },
          kcal: { type: Type.INTEGER, description: "Estimated calories for the chosen portion." },
          protein_g: { type: Type.INTEGER, description: "Estimated protein in grams." },
          why: {
            type: Type.STRING,
            description:
              "Why this one, at most two sentences, leading with whatever decided it — what they asked for if they asked for something, the deciding number otherwise.",
          },
          instead: {
            type: Type.STRING,
            description: "What was passed over and why, one short clause. Empty if there was no alternative.",
          },
        },
        required: ["pick", "kcal", "protein_g", "why"],
      },
    },
  ];

  const labels: Record<string, string> = {
    day_totals: "reading that day",
    recent_days: "reading the last few days",
    search_foods: "searching your foods",
    watch_days: "reading your watch",
    body_and_targets: "checking your targets",
    recent_training: "reading your training",
    recommend: "putting that together",
  };

  async function run(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    switch (name) {
      case "day_totals": {
        const date = dateArg(args.date, today);
        const [meals, targets] = await Promise.all([
          listMealsInRange(supabase, date, date),
          loadTargets(supabase),
        ]);
        const totals = totalsForDay(meals);
        const analysed = meals.filter((meal) => meal.status === "analyzed");
        const lines = analysed.map(
          (meal) =>
            `- ${meal.note ?? "(no note)"} — ${n(meal.kcal ?? 0)} kcal, ${meal.protein_g ?? 0}g protein`,
        );
        const body = [
          `${date}${date === today ? " (today, still in progress)" : ""}`,
          analysed.length === 0 ? "Nothing logged on this day." : lines.join("\n"),
          "",
          `Totals: ${n(totals.kcal)} of ${n(targets.kcal)} kcal, ${totals.protein_g} of ${targets.protein_g}g protein.`,
        ].join("\n");
        return { output: asData(name, body), summary: `${date}: ${analysed.length} meals` };
      }

      case "recent_days": {
        const days = count(args.days, 7, 31);
        const from = toDay(subDays(parseDay(today), days - 1));
        const [meals, targets] = await Promise.all([
          listMealsInRange(supabase, from, today),
          loadTargets(supabase),
        ]);
        const period = summarise(meals, datesBetween(from, today), targets);
        const lines = period.days.map((day) =>
          day.logged
            ? `- ${day.date}: ${n(day.kcal)} kcal, ${day.protein_g}g protein`
            : `- ${day.date}: nothing logged`,
        );
        const body = [
          lines.join("\n"),
          "",
          period.loggedDays === 0
            ? "No days in this range were logged, so there is no average to give."
            : `Across the ${period.loggedDays} logged days: ${n(period.average.kcal)} kcal and ${period.average.protein_g}g protein a day. ${period.onTarget.kcal} stayed under ${n(targets.kcal)} kcal; ${period.onTarget.protein} reached ${targets.protein_g}g protein. Unlogged days are excluded from the average rather than counted as zero.`,
        ].join("\n");
        return {
          output: asData(name, body),
          summary: `${days} days: ${period.loggedDays} logged`,
        };
      }

      case "search_foods": {
        const query = typeof args.query === "string" ? args.query.trim().toLowerCase() : "";
        const foods = await listSavedFoods(supabase);
        const line = (food: (typeof foods)[number]) =>
          `- ${food.name} — ${n(food.kcal)} kcal, ${food.protein_g}g protein, ${food.carbs_g}g carbs, ${food.fat_g}g fat; logged ${food.times_used}×`;

        /*
          A short library comes back whole, whatever was asked for.

          Measured against the real model: with six saved foods it called this
          six times, once per term it could think of, because each search
          answered only its own word and left it wondering what else was in
          there. Handing over the entire list on the first call and saying so
          ends that — there is nothing left to search for. It also costs less
          than one filtered answer, since the list is shorter than the
          explanation of how to search it.
        */
        if (foods.length <= WHOLE_LIBRARY) {
          for (const food of foods) seen.add(food.name);
          const body =
            foods.length === 0
              ? "They have no saved foods at all."
              : [
                  `Their complete saved list, all ${foods.length} of them. There is nothing else to find, so do not search again.`,
                  "",
                  ...foods.map(line),
                ].join("\n");
          return { output: asData(name, body), summary: `whole library, ${foods.length} foods` };
        }

        const matched = foods
          .filter(
            (food) =>
              !query ||
              food.name.toLowerCase().includes(query) ||
              food.items.some((item) => item.name.toLowerCase().includes(query)),
          )
          .slice(0, 15);
        for (const food of matched) seen.add(food.name);
        const body =
          matched.length === 0
            ? `No saved food matches "${query}". They have ${foods.length} saved in total.`
            : matched.map(line).join("\n");
        return { output: asData(name, body), summary: `${matched.length} foods matched` };
      }

      case "watch_days": {
        const days = count(args.days, 7, 30);
        const watch = await recentWatchDays(supabase, days);
        const energy = dayEnergy(today, today, watch);
        const lines = watch
          .slice(-days)
          .map((day) => `- ${day.day}: ${n(day.steps ?? 0)} steps, ${n(day.kcal ?? 0)} kcal burned`);
        const body = [
          watch.length === 0 ? "The watch has reported nothing in this window." : lines.join("\n"),
          "",
          energy.typical
            ? `Average total burn: ${n(energy.typical.kcal)} kcal a day over ${energy.typical.days} days. Today is not counted, because the watch has not finished counting it.`
            : "Not enough days to give an average burn.",
        ].join("\n");
        return { output: asData(name, body), summary: `${watch.length} watch days` };
      }

      case "body_and_targets": {
        const targets = await loadTargets(supabase);
        const b = targets.basis;
        const body = [
          `Targets: ${n(targets.kcal)} kcal, ${targets.protein_g}g protein, ${targets.carbs_g}g carbs, ${targets.fat_g}g fat.`,
          `Resting burn ${n(b.bmr)} kcal by ${b.bmrFormula}; activity factor ${b.activityFactor} from sessions actually logged, giving maintenance around ${n(b.tdee)} kcal.`,
          `That is a deficit of ${n(b.deficitKcal)} kcal a day, about ${b.weeklyLossKg} kg a week.`,
          "Calories are a ceiling to stay under. Protein is a floor to clear, allocated first and never traded away.",
        ].join("\n");
        return { output: asData(name, body), summary: "targets read" };
      }

      case "recent_training": {
        const limit = count(args.limit, 5, 10);
        // The training tables need real SQL, so they come through the direct
        // connection rather than PostgREST — see the two-clients note in AGENTS.
        const { getRecentSessions } = await import("@/lib/queries");
        const sessions = await getRecentSessions(limit);
        const body =
          sessions.length === 0
            ? "No sessions recorded."
            : sessions
                .map((session) => {
                  const what = session.exercises.map((e) => e.exercise).join(", ");
                  return `- ${String(session.date).slice(0, 10)}: ${session.title} — ${session.duration_min} min, ${session.n_sets} sets, ${session.volume_t}t${what ? ` (${what})` : ""}`;
                })
                .join("\n");
        return { output: asData(name, body), summary: `${sessions.length} sessions` };
      }

      case "recommend": {
        const parsed = adviceSchema.safeParse({
          pick: args.pick,
          kcal: args.kcal,
          protein_g: args.protein_g,
          why: args.why,
          instead: typeof args.instead === "string" ? args.instead : "",
        });
        if (!parsed.success) {
          // Handed back rather than thrown: a malformed call is something the
          // model can correct on the next turn, and a thrown error would lose
          // the whole answer over a missing field.
          return {
            output: asData(name, "That recommendation was missing fields. Required: pick, kcal, protein_g, why."),
            summary: "recommendation rejected",
          };
        }
        return {
          output: asData(name, "Shown to them as a card with a Log it button."),
          summary: `recommended ${parsed.data.pick}`,
          recommendation: parsed.data,
        };
      }

      default:
        return { output: asData("error", `No tool called ${name}.`), summary: `unknown tool ${name}` };
    }
  }

  return {
    declarations,
    label: (name) => labels[name] ?? "looking that up",
    seenFoods: () => [...seen],
    async execute(name, args) {
      try {
        return await run(name, args);
      } catch (error) {
        // A look-up that fails is a fact the model should have, not the end of
        // the answer: it can say what it could not check.
        const message = error instanceof Error ? error.message : "unknown error";
        return {
          output: asData("error", `${name} could not be read: ${message}`),
          summary: `${name} failed`,
        };
      }
    },
  };
}
