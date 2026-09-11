"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Bookmark, Check, Pencil, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createClient } from "@/lib/supabase/client";
import { enqueue } from "@/lib/outbox/store";
import { flushOutbox } from "@/lib/outbox/sync";
import { localDay } from "@/lib/time";
import {
  archiveSavedFood,
  estimateFromSaved,
  levelFor,
  restoreSavedFood,
  updateSavedFood,
  type SavedFoodRow,
} from "@/lib/meals/saved";
import { MACRO_LABELS } from "@/lib/meal/format";
import { MACROS, type Macro } from "@/lib/meal/schema";
import { toastDone, toastFailed } from "@/lib/notify";
import { cn } from "@/lib/utils";

/**
 * The saved list, as a listing.
 *
 * Built for hundreds: a row per food with the name allowed two lines before
 * it is cut, the figures underneath in a line, and Log at the right. The
 * first version truncated names to one line and "Aldi Worldwide Foods
 * chicken…" was every row on the page; the name is the thing you scan for,
 * so it gets the room.
 *
 * Sorted the four ways a food list is actually used — most eaten, by name,
 * by protein, by calories — and paged twenty-five at a time with a "show
 * more" rather than page numbers, because the search box is the way to a
 * specific food and the page is for browsing. Search resets the paging.
 *
 * Logging from here is the same path "Your usual" used on Today before it
 * went: the estimate travels with the meal, so the row lands finished and
 * the worker is never asked. The meal counts toward now, because a saved
 * food is something you just ate.
 *
 * Upkeep — items, rename, fix a number, archive — is behind a tap on the
 * row, using the same four-box editor the meal cards use.
 */

type Sort = "used" | "name" | "protein" | "kcal";

const SORTS: { value: Sort; label: string }[] = [
  { value: "used", label: "Most used" },
  { value: "name", label: "A–Z" },
  { value: "protein", label: "Protein" },
  { value: "kcal", label: "Calories" },
];

const PAGE = 25;

function compare(sort: Sort) {
  return (a: SavedFoodRow, b: SavedFoodRow): number => {
    switch (sort) {
      case "name":
        return a.name.localeCompare(b.name, "en-GB", { sensitivity: "base" });
      case "protein":
        return b.protein_g - a.protein_g || a.kcal - b.kcal;
      case "kcal":
        return a.kcal - b.kcal || b.protein_g - a.protein_g;
      default:
        return b.times_used - a.times_used || a.name.localeCompare(b.name, "en-GB");
    }
  };
}

export function SavedFoods({ initial }: { initial: SavedFoodRow[] }) {
  const [foods, setFoods] = useState(initial);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("used");
  const [showArchived, setShowArchived] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [logging, setLogging] = useState<string | null>(null);
  const router = useRouter();

  const matching = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return foods
      .filter((food) => {
        if (Boolean(food.archived_at) !== showArchived) return false;
        if (!needle) return true;
        // The item names too, so "whey" finds a shake called "Morning".
        return (
          food.name.toLowerCase().includes(needle) ||
          food.items.some((item) => item.name.toLowerCase().includes(needle))
        );
      })
      .sort(compare(sort));
  }, [foods, query, showArchived, sort]);

  const visible = matching.slice(0, shown);
  const archivedCount = foods.filter((food) => food.archived_at).length;

  /** Any change to what is being browsed starts again from the top. */
  function browse(change: () => void) {
    change();
    setShown(PAGE);
    setOpen(null);
    setEditing(null);
  }

  function replace(row: SavedFoodRow) {
    setFoods((current) => current.map((food) => (food.id === row.id ? row : food)));
  }

  /*
    The row that was just logged, held on screen for a moment.

    "Logging…" only lasts as long as a write to the phone's own storage, which
    is a few milliseconds, so a tap produced a flicker on the button and then
    nothing — the meal was safely queued, but nothing on the row said so, and
    the toast confirming it appears at the bottom of the screen, well away from
    the thumb that asked. A confirmation has to outlast the glance that is
    looking for it.

    Not disabled while it shows: a second tap is a second shake, and that is a
    real thing to log. The double-tap guard is the in-flight state above.
  */
  const [justLogged, setJustLogged] = useState<string | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
  }, []);

  async function log(food: SavedFoodRow) {
    setLogging(food.id);
    try {
      const loggedAt = new Date();
      await enqueue({
        clientId: crypto.randomUUID(),
        loggedAt: loggedAt.toISOString(),
        localDate: localDay(loggedAt),
        note: food.name,
        attempts: 0,
        saved: {
          id: food.id,
          timesUsed: food.times_used,
          estimate: estimateFromSaved(food),
        },
      });
      // Queued is the guarantee; sent is a bonus. Today flushes again when it
      // opens, and the service worker in the background, so a failure here
      // is not a lost meal and is not reported as one.
      void flushOutbox().catch(() => {});
      replace({ ...food, times_used: food.times_used + 1, last_used_at: loggedAt.toISOString() });
      setJustLogged(food.id);
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      confirmTimer.current = setTimeout(() => setJustLogged(null), 1800);
      toastDone(`Logged ${food.name} to today`, {
        label: "View today",
        onClick: () => router.push("/"),
      });
    } catch (thrown) {
      toastFailed(thrown, `Could not log ${food.name}`);
    } finally {
      setLogging(null);
    }
  }

  async function toggleArchive(food: SavedFoodRow) {
    const restoring = Boolean(food.archived_at);
    try {
      const supabase = createClient();
      if (restoring) await restoreSavedFood(supabase, food.id);
      else await archiveSavedFood(supabase, food.id);
      replace({ ...food, archived_at: restoring ? null : new Date().toISOString() });
      setOpen(null);
      toastDone(restoring ? `Restored ${food.name}` : `Archived ${food.name}`);
    } catch (thrown) {
      toastFailed(thrown, restoring ? "Could not restore that food" : "Could not archive that food");
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
        <Input
          value={query}
          onChange={(event) => browse(() => setQuery(event.target.value))}
          placeholder="search your foods…"
          aria-label="Search your saved foods"
          className="h-11 pl-10"
          style={{ borderRadius: 12 }}
        />
      </div>

      {/* The sort, as a segmented control the height of everything else
          tappable here. Stock tabs are 32px, a desktop size. */}
      <Tabs value={sort} onValueChange={(value) => browse(() => setSort(value as Sort))}>
        <TabsList className="h-11 w-full group-data-horizontal/tabs:h-11">
          {SORTS.map((option) => (
            <TabsTrigger key={option.value} value={option.value}>
              {option.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {matching.length === 0 ? (
        <p className="px-1 py-6 text-center text-sm text-muted-foreground">
          Nothing matches “{query.trim()}”.
        </p>
      ) : (
        <ul className="surface divide-y divide-[var(--rule)]/60 overflow-hidden">
          {visible.map((food) => {
            const isOpen = open === food.id;
            const rank = levelFor(food.times_used);
            return (
              <li key={food.id}>
                {/*
                  Two controls on one row: the row itself, which opens the
                  details, and Log. Siblings rather than nested so a tap on
                  Log never also opens the row.
                */}
                <div className="flex items-center gap-2 pl-4 pr-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(isOpen ? null : food.id);
                      setEditing(null);
                    }}
                    aria-expanded={isOpen}
                    className="min-w-0 flex-1 py-3 text-left"
                  >
                    {/* Two lines before the name is cut: the name is what
                        the eye scans for, and one line lost the half of it
                        that told a chicken tikka from a chicken korma. */}
                    <span
                      className={cn(
                        "line-clamp-2 text-[0.9375rem] font-medium leading-snug",
                        food.archived_at && "text-muted-foreground",
                      )}
                    >
                      {/* Inline so it flows with the name and is clipped with
                          it, rather than surviving alone on a truncated row. */}
                      <Level rank={rank.level} />
                      {food.name}
                    </span>
                    <span className="mt-1 flex flex-wrap gap-x-2 text-xs tabular-nums text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {food.kcal.toLocaleString("en-GB")} kcal
                      </span>
                      <span style={{ color: "var(--ink-protein)" }}>{food.protein_g}g protein</span>
                      <span>{food.carbs_g}g carbs</span>
                      <span>{food.fat_g}g fat</span>
                      <span>logged {food.times_used}×</span>
                    </span>
                  </button>
                  {food.archived_at ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => toggleArchive(food)}
                      className="text-muted-foreground"
                    >
                      <ArchiveRestore className="size-4" /> Restore
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => log(food)}
                      disabled={logging !== null}
                      aria-label={`Log ${food.name}, ${food.kcal} kcal, to today`}
                      // A width that holds "Logged", so the label changing
                      // never reflows the figures beside it.
                      className={`min-w-[5.75rem] ${justLogged === food.id ? "logged-confirm" : ""}`}
                    >
                      {justLogged === food.id ? (
                        <>
                          <Check className="logged-check size-4" /> Logged
                        </>
                      ) : (
                        <>
                          <Plus className="size-4" /> {logging === food.id ? "Logging…" : "Log"}
                        </>
                      )}
                    </Button>
                  )}
                </div>

                {isOpen && (
                  <div className="border-t border-[var(--rule)]/60 px-4 pb-4 pt-3">
                    {editing === food.id ? (
                      <MacroEditor
                        food={food}
                        onCancel={() => setEditing(null)}
                        onSaved={(row) => {
                          replace(row);
                          setEditing(null);
                        }}
                      />
                    ) : (
                      <div className="space-y-3">
                        {/* What is actually in it, which is the thing worth
                            checking when a number looks wrong. */}
                        {food.items.length > 1 && (
                          <p className="text-xs leading-relaxed text-muted-foreground">
                            {food.items.map((item) => `${item.name} (${item.qty})`).join(", ")}
                          </p>
                        )}
                        {food.items.length === 1 && (
                          <p className="text-xs leading-relaxed text-muted-foreground">
                            {food.items[0].qty}
                          </p>
                        )}
                        {food.assumptions && (
                          <p className="text-xs leading-relaxed text-muted-foreground">
                            {food.assumptions}
                          </p>
                        )}
                        <p className="text-xs tabular-nums text-muted-foreground">
                          {rank.toNext === null
                            ? "Top level"
                            : `${rank.toNext} more ${rank.toNext === 1 ? "log" : "logs"} to level ${rank.level + 1}`}
                          {" · "}
                          {food.fiber_g == null ? "fibre unknown" : `${food.fiber_g}g fibre`}
                          {food.times_used > 0 &&
                            ` · last logged ${new Date(food.last_used_at ?? food.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`}
                        </p>
                        {!food.archived_at && (
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setEditing(food.id)}
                              className="text-muted-foreground"
                            >
                              <Pencil className="size-4" /> Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => toggleArchive(food)}
                              className="text-muted-foreground"
                            >
                              <Archive className="size-4" /> Archive
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Paging: how far down the list you are, and the way further. */}
      {matching.length > 0 && (
        <div className="flex items-center justify-between gap-3 px-1">
          <span className="text-xs tabular-nums text-muted-foreground">
            {Math.min(shown, matching.length)} of {matching.length}
          </span>
          {matching.length > shown && (
            <Button variant="outline" size="sm" onClick={() => setShown((n) => n + PAGE)}>
              Show {Math.min(PAGE, matching.length - shown)} more
            </Button>
          )}
        </div>
      )}

      {archivedCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => browse(() => setShowArchived((v) => !v))}
          className="text-muted-foreground"
        >
          {showArchived ? "Back to your list" : `Archived (${archivedCount})`}
        </Button>
      )}
    </div>
  );
}

/**
 * A food's level, from how often it has been logged.
 *
 * Shown on every food including level one, because the point is that the
 * whole list is a collection with a rank on each item — hiding the first
 * level would mean the mechanic only appears once it has already happened.
 * Coloured from level two, so climbing out of the starting rank is visible
 * at a glance down the column.
 */
function Level({ rank }: { rank: number }) {
  const earned = rank > 1;
  return (
    <span
      className="mr-1.5 inline-block rounded-full px-1.5 py-0.5 align-[0.1em] text-[0.6875rem] font-semibold tabular-nums"
      style={
        earned
          ? {
              background: "color-mix(in oklch, var(--accent-protein) 16%, transparent)",
              color: "var(--ink-protein)",
            }
          : {
              background: "color-mix(in oklch, var(--rule) 45%, transparent)",
              color: "var(--muted-foreground)",
            }
      }
      aria-label={`Level ${rank}`}
    >
      Lv {rank}
    </span>
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
}: {
  food: SavedFoodRow;
  onCancel: () => void;
  onSaved: (row: SavedFoodRow) => void;
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
      toastDone(`Saved ${name.trim()}`);
    } catch (thrown) {
      toastFailed(thrown, `Could not save ${food.name}`);
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
