import { Screen } from "@/components/screen";
import { AppHeader } from "@/components/app-header";
import { SavedFoods } from "@/components/saved-foods";
import { createClient } from "@/lib/supabase/server";
import { listSavedFoods } from "@/lib/meals/saved";

/**
 * The things you eat again.
 *
 * A list, not a database. There is no search over a public food corpus and
 * nothing to author from scratch — everything here arrived by being eaten
 * once and saved from its own card, which is what makes the numbers
 * trustworthy: they were produced by the estimator, read by a person, and
 * kept. Building the same list by typing macros into empty boxes would
 * reintroduce exactly the guesswork the app exists to remove.
 *
 * Two jobs, and the first is the common one: find a food and log it, which
 * every row does in one tap. The second is upkeep — rename, fix a number,
 * archive what you have gone off — and that sits behind the row.
 */
/** The collection as one line: how much of it there is, and how used it is. */
function collectionCaption(foods: { archived_at: string | null; times_used: number }[]): string {
  const active = foods.filter((food) => !food.archived_at);
  const uses = active.reduce((sum, food) => sum + food.times_used, 0);
  const count = `${active.length} ${active.length === 1 ? "food" : "foods"}`;
  return uses === 0 ? count : `${count} · logged ${uses} times between them`;
}

export default async function FoodsScreen() {
  const supabase = await createClient();
  const foods = await listSavedFoods(supabase, { includeArchived: true });

  return (
    <Screen>
      <AppHeader
        title="Your foods"
        caption={collectionCaption(foods)}
      />
      <SavedFoods initial={foods} />
    </Screen>
  );
}
