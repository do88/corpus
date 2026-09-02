"use client";

import { useMemo, useState } from "react";
import { Archive, ArchiveRestore, Bookmark, Pencil, Search, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import {
  archiveSavedFood,
  restoreSavedFood,
  updateSavedFood,
  type SavedFoodRow,
} from "@/lib/meals/saved";
import { MACRO_LABELS } from "@/lib/meal/format";
import { MACROS, type Macro } from "@/lib/meal/schema";

/**
 * Upkeep for the saved list.
 *
 * Deliberately the same four-box editor the meal cards use, because it is the
 * same job: these numbers came from a meal estimate and get corrected the same
 * way. A second, differently-shaped macro editor would be a second place for
 * the same rounding and validation rules to drift apart.
 */
export function SavedFoods({ initial }: { initial: SavedFoodRow[] }) {
  const [foods, setFoods] = useState(initial);
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return foods.filter((food) => {
      if (Boolean(food.archived_at) !== showArchived) return false;
      if (!needle) return true;
      // The item names too, so "whey" finds a shake called "Morning".
      return (
        food.name.toLowerCase().includes(needle) ||
        food.items.some((item) => item.name.toLowerCase().includes(needle))
      );
    });
  }, [foods, query, showArchived]);

  const archivedCount = foods.filter((food) => food.archived_at).length;

  function replace(row: SavedFoodRow) {
    setFoods((current) => current.map((food) => (food.id === row.id ? row : food)));
  }

  async function toggleArchive(food: SavedFoodRow) {
    setError(null);
    const restoring = Boolean(food.archived_at);
    try {
      const supabase = createClient();
      if (restoring) await restoreSavedFood(supabase, food.id);
      else await archiveSavedFood(supabase, food.id);
      replace({ ...food, archived_at: restoring ? null : new Date().toISOString() });
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : "Could not change that");
    }
  }

  if (foods.length === 0) {
    return (
      <div className="surface mt-5 p-5 text-center">
        <Bookmark className="mx-auto size-6 text-muted-foreground" aria-hidden />
        <p className="mt-3 text-sm font-medium">Nothing saved yet</p>
        <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
          Log a meal, open it, and choose “Save to your foods”. Logging it again
          then copies those numbers instead of estimating them afresh.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-5 space-y-3">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        {/* Button height, not the 32px the base input ships with: it sits
            alone on a row and read as a slot rather than a control, and the
            app's floor for anything tappable is 44px anyway. */}
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="search your foods…"
          aria-label="Search your saved foods"
          className="h-11 rounded-2xl pl-10"
        />
      </div>

      {visible.length === 0 ? (
        <p className="px-1 py-6 text-center text-sm text-muted-foreground">
          Nothing matches “{query.trim()}”.
        </p>
      ) : (
        <ul className="space-y-3">
          {visible.map((food) => (
            <li key={food.id} className="surface p-5">
              {editing === food.id ? (
                <MacroEditor
                  food={food}
                  onCancel={() => setEditing(null)}
                  onSaved={(row) => {
                    replace(row);
                    setEditing(null);
                  }}
                  onError={setError}
                />
              ) : (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                    {/*
                      A floor on the text column so the *actions* wrap to
                      their own row when space runs out, rather than the
                      figures wrapping under them. Labelling the two buttons
                      cost the left column about 80px, which was enough to
                      break "125 kcal · 25g protein · logged 41×" across two
                      lines on a phone — the row still fitted, it just read
                      like it had not.
                    */}
                    <div className="min-w-[13rem] flex-1">
                      <p className="text-[1rem] font-medium leading-snug">{food.name}</p>
                      <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                        {food.kcal.toLocaleString("en-GB")} kcal ·{" "}
                        <span style={{ color: "var(--ink-protein)" }}>
                          {food.protein_g}g protein
                        </span>
                        {food.times_used > 0 && ` · logged ${food.times_used}×`}
                      </p>
                    </div>
                    {/*
                      Named, not just drawn. A pencil is about as close to
                      universal as an icon gets and still lost to a box with a
                      lid on it — nobody should have to work out whether that
                      one archives, deletes or downloads before pressing it on
                      a list of their own food.
                    */}
                    <div className="flex shrink-0 items-center gap-1">
                      {!food.archived_at && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditing(food.id)}
                          className="text-muted-foreground"
                        >
                          <Pencil className="size-4" /> Edit
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toggleArchive(food)}
                        className="text-muted-foreground"
                      >
                        {food.archived_at ? (
                          <>
                            <ArchiveRestore className="size-4" /> Restore
                          </>
                        ) : (
                          <>
                            <Archive className="size-4" /> Archive
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* What is actually in it, which is the thing worth checking
                      when a number looks wrong. */}
                  {food.items.length > 1 && (
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                      {food.items.map((item) => item.name).join(", ")}
                    </p>
                  )}
                  {food.assumptions && (
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                      {food.assumptions}
                    </p>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {archivedCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowArchived((v) => !v)}
          className="text-muted-foreground"
        >
          {showArchived ? "Back to your list" : `Archived (${archivedCount})`}
        </Button>
      )}

      {error && (
        <Alert variant="warning">
          <TriangleAlert />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

/**
 * Rename, and fix the numbers.
 *
 * Edits land on the single item when there is one, so the line item and the
 * totals cannot disagree — `totalsFor` re-derives the row from the items, and
 * a saved food whose stored total contradicted its own breakdown would put
 * that contradiction into every meal logged from it. A multi-item food is
 * renamed here and corrected by re-saving it from a meal, which keeps this
 * editor honest rather than teaching it to split a total across lines.
 */
function MacroEditor({
  food,
  onCancel,
  onSaved,
  onError,
}: {
  food: SavedFoodRow;
  onCancel: () => void;
  onSaved: (row: SavedFoodRow) => void;
  onError: (message: string) => void;
}) {
  const single = food.items.length === 1;
  const [name, setName] = useState(food.name);
  const [values, setValues] = useState<Record<Macro, string>>({
    kcal: String(food.kcal),
    protein_g: String(food.protein_g),
    carbs_g: String(food.carbs_g),
    fat_g: String(food.fat_g),
  });
  const [busy, setBusy] = useState(false);

  async function commit() {
    setBusy(true);
    try {
      const numbers = Object.fromEntries(
        MACROS.map((macro) => [macro, Math.max(0, Math.round(Number(values[macro]) || 0))]),
      ) as Record<Macro, number>;

      const items = single ? [{ ...food.items[0], ...numbers }] : undefined;
      await updateSavedFood(createClient(), food.id, { name, items });
      onSaved({ ...food, name: name.trim(), ...(single ? numbers : {}) });
    } catch (thrown) {
      onError(thrown instanceof Error ? thrown.message : "Could not save that");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={`name-${food.id}`}>Name</Label>
        <Input
          id={`name-${food.id}`}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>

      {single ? (
        <div className="grid grid-cols-2 gap-3">
          {MACROS.map((macro) => (
            <div key={macro} className="space-y-1.5">
              <Label htmlFor={`${macro}-${food.id}`}>{MACRO_LABELS[macro]}</Label>
              <Input
                id={`${macro}-${food.id}`}
                type="number"
                inputMode="numeric"
                min={0}
                value={values[macro]}
                onChange={(event) =>
                  setValues((current) => ({ ...current, [macro]: event.target.value }))
                }
              />
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs leading-relaxed text-muted-foreground">
          This one has {food.items.length} items, so its numbers are the sum of them.
          Rename it here; to change the figures, correct a meal you logged from it and
          save that instead.
        </p>
      )}

      <div className="flex gap-2">
        <Button onClick={commit} disabled={busy || !name.trim()} className="flex-1">
          {busy ? "Saving…" : "Save"}
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
