import type { SupabaseClient } from "@supabase/supabase-js";
import { MACROS, totalsFor, type MealEstimate, type MealItem } from "../meal/schema";
import type { MealRow } from "./repository";

/**
 * Every read and write of `saved_food`, in one place.
 *
 * Same contract as the meal repository next door: it takes a client rather
 * than making one, so the browser, the server and the worker can all use it
 * and whichever client is passed decides what RLS allows.
 *
 * The idea is narrow on purpose. This is not a food database — there is no
 * search over a public corpus, no barcodes, no per-100g arithmetic. It is a
 * short list of things you have already eaten and priced, so that eating them
 * again costs nothing. Everything here follows from that: entries are promoted
 * from real meals rather than authored, and logging one copies its numbers
 * rather than asking for them again.
 */

export type SavedFoodRow = {
  id: string;
  name: string;
  items: MealItem[];
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  assumptions: string | null;
  source_meal_id: string | null;
  times_used: number;
  last_used_at: string | null;
  archived_at: string | null;
  created_at: string;
};

const COLUMNS =
  "id, name, items, kcal, protein_g, carbs_g, fat_g, assumptions, source_meal_id, times_used, last_used_at, archived_at, created_at";

/**
 * The list, most-eaten first.
 *
 * Ordered by use rather than by name because the reason to open this list is
 * to log something, and the thing you are most likely to log is the thing you
 * log most. Alphabetical would put "Almonds" above a shake you have had two
 * hundred times.
 */
export async function listSavedFoods(
  supabase: SupabaseClient,
  { includeArchived = false }: { includeArchived?: boolean } = {},
): Promise<SavedFoodRow[]> {
  let query = supabase
    .from("saved_food")
    .select(COLUMNS)
    .order("times_used", { ascending: false })
    .order("last_used_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (!includeArchived) query = query.is("archived_at", null);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as SavedFoodRow[];
}

/**
 * Promote a meal you have already logged into something you can log again.
 *
 * Promotion rather than authoring is the whole design. There is no form with
 * four macro boxes to fill in, because filling those in accurately is the hard
 * problem this app exists to solve — and it has already been solved for this
 * meal, by the estimator, with the answer sitting in the row. Copying it means
 * the saved numbers are numbers you have already seen and accepted.
 *
 * `items` may be narrowed to a subset, so one line of a three-item meal can be
 * saved on its own: the shake out of "shake, banana and a coffee". Totals are
 * recomputed from whatever subset is kept rather than copied from the meal, or
 * saving one item of three would inherit the whole meal's calories.
 */
export async function saveFoodFromMeal(
  supabase: SupabaseClient,
  meal: Pick<MealRow, "id" | "items" | "assumptions">,
  { name, items }: { name: string; items?: MealItem[] },
): Promise<SavedFoodRow> {
  const kept = items ?? meal.items ?? [];
  if (kept.length === 0) throw new Error("Nothing to save from this meal");

  const totals = totalsFor(kept);
  const { data, error } = await supabase
    .from("saved_food")
    .insert({
      name: name.trim(),
      items: kept,
      ...totals,
      assumptions: meal.assumptions,
      source_meal_id: meal.id,
    })
    .select(COLUMNS)
    .single();

  if (error) {
    // The unique index is on the live name, so this is the one collision worth
    // translating: the generic Postgres text is unreadable and the fix is
    // obvious once stated.
    if (error.code === "23505") throw new Error("You already have one saved by that name");
    throw new Error(error.message);
  }
  return data as SavedFoodRow;
}

/** Rename, or correct the numbers. The macro editor is shared with meal cards. */
export async function updateSavedFood(
  supabase: SupabaseClient,
  id: string,
  patch: { name?: string; items?: MealItem[] },
): Promise<void> {
  const fields: Record<string, unknown> = {};
  if (patch.name !== undefined) fields.name = patch.name.trim();
  if (patch.items !== undefined) {
    fields.items = patch.items;
    Object.assign(fields, totalsFor(patch.items));
  }
  if (Object.keys(fields).length === 0) return;

  const { error } = await supabase.from("saved_food").update(fields).eq("id", id);
  if (error) {
    if (error.code === "23505") throw new Error("You already have one saved by that name");
    throw new Error(error.message);
  }
}

/**
 * Archive rather than delete.
 *
 * A meal logged from a saved food keeps its own copy of the macros, so a hard
 * delete would not corrupt any history — but it would drop the link that says
 * where the meal came from, and a list you can only ever add to is a list you
 * stop opening. Archiving frees the name for reuse, which is how renaming by
 * recreating stays possible.
 */
export async function archiveSavedFood(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase
    .from("saved_food")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function restoreSavedFood(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase
    .from("saved_food")
    .update({ archived_at: null })
    .eq("id", id);
  if (error) {
    if (error.code === "23505") throw new Error("Something live already has that name");
    throw new Error(error.message);
  }
}

/**
 * Note that one has been eaten again.
 *
 * Deliberately not transactional with the meal insert. If this fails the meal
 * is still logged, which is the thing that matters; the cost is that a counter
 * used only for sort order is one behind. Making the log of a meal depend on
 * the success of a statistics update would be the wrong way round.
 */
export async function recordSavedFoodUse(
  supabase: SupabaseClient,
  id: string,
  timesUsed: number,
): Promise<void> {
  await supabase
    .from("saved_food")
    .update({ times_used: timesUsed + 1, last_used_at: new Date().toISOString() })
    .eq("id", id);
}

/**
 * A saved food, as the estimate a meal row expects.
 *
 * This is the replay. The macros are copied, not recalculated, so the second
 * hundredth shake is byte-identical to the first — which is the entire reason
 * the table exists. `confidence` is "high" because it is: these figures were
 * checked by a person once and have not been guessed since.
 *
 * A multiplier scales the line items and lets the totals be re-derived, rather
 * than scaling the totals, so a doubled saved food still itemises correctly.
 */
export function estimateFromSaved(saved: SavedFoodRow, quantity = 1): MealEstimate {
  const items = saved.items.map((item) => ({
    ...item,
    qty: quantity === 1 ? item.qty : `${quantity} × ${item.qty}`,
    ...(Object.fromEntries(
      MACROS.map((macro) => [macro, Math.round(item[macro] * quantity)]),
    ) as Record<(typeof MACROS)[number], number>),
  }));

  return {
    items,
    confidence: "high",
    assumptions:
      saved.assumptions ?? `Saved food, logged from your own figures for ${saved.name}.`,
    ...totalsFor(items),
  };
}
