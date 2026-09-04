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
export default async function FoodsScreen() {
  const supabase = await createClient();
  const foods = await listSavedFoods(supabase, { includeArchived: true });

  return (
    <Screen>
      <AppHeader
        title="Your foods"
        caption={`${foods.filter((food) => !food.archived_at).length} saved from meals you have logged`}
      />
      <SavedFoods initial={foods} />
    </Screen>
  );
}
