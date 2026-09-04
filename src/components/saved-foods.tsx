"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Archive,
  ArchiveRestore,
  Bookmark,
  CircleCheck,
  Pencil,
  Plus,
  Search,
  TriangleAlert,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { enqueue } from "@/lib/outbox/store";
import { flushOutbox } from "@/lib/outbox/sync";
import { localDay } from "@/lib/time";
import {
  archiveSavedFood,
  estimateFromSaved,
  restoreSavedFood,
  updateSavedFood,
  type SavedFoodRow,
} from "@/lib/meals/saved";
import { MACRO_LABELS } from "@/lib/meal/format";
import { MACROS, type Macro } from "@/lib/meal/schema";
import { cn } from "@/lib/utils";

/**
 * The saved list, as a list.
 *
 * It was a stack of cards, each carrying its items and its assumptions, and
 * at thirty foods that was already a lot of scrolling. This is built for
 * hundreds: one line per food — name, calories, protein — inside a single
 * surface, and everything else behind a tap on the row. What you want from
 * this page most of the time is to find one and log it, and a row that does
 * both in one glance is the whole design.
 *
 * Logging from here is the same path "Your usual" used on Today before it
 * went: the estimate travels with the meal, so the row lands finished and the
 * worker is never asked. The meal counts toward now, not toward any day that
 * happens to be selected elsewhere, because a saved food is something you
 * just ate.
 *
 * Upkeep — rename, fix a number, archive — is the same four-box editor the
 * meal cards use, because it is the same job and a second editor would be a
 * second place for the rounding rules to drift.
 */
export function SavedFoods({ initial }: { initial: SavedFoodRow[] }) {
  const [foods, setFoods] = useState(initial);
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [logging, setLogging] = useState<string | null>(null);
  const [logged, setLogged] = useState<string | null>(null);
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

  async function log(food: SavedFoodRow) {
    setError(null);
    setLogged(null);
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
      setLogged(food.name);
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : "Could not log that");
    } finally {
      setLogging(null);
    }
  }

  async function toggleArchive(food: SavedFoodRow) {
    setError(null);
    const restoring = Boolean(food.archived_at);
    try {
      const supabase = createClient();
      if (restoring) await restoreSavedFood(supabase, food.id);
      else await archiveSavedFood(supabase, food.id);
      replace({ ...food, archived_at: restoring ? null : new Date().toISOString() });
      setOpen(null);
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
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="search your foods…"
          aria-label="Search your saved foods"
          className="h-11 pl-10"
          style={{ borderRadius: 12 }}
        />
      </div>

      {logged && (
        <Alert role="status">
          <CircleCheck />
          <AlertDescription className="flex w-full items-center justify-between gap-3">
            <span>
              Logged <span className="font-medium text-foreground">{logged}</span> to today.
            </span>
            <Link
              href="/"
              className="shrink-0 font-medium text-foreground underline-offset-4 hover:underline"
            >
              View today
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {visible.length === 0 ? (
        <p className="px-1 py-6 text-center text-sm text-muted-foreground">
          Nothing matches “{query.trim()}”.
        </p>
      ) : (
        <ul className="surface divide-y divide-[var(--rule)]/60 overflow-hidden">
          {visible.map((food) => {
            const isOpen = open === food.id;
            return (
              <li key={food.id}>
                {/*
                  Two controls on one line: the row itself, which opens the
                  details, and Log. They are siblings rather than nested so a
                  tap on Log never also opens the row, and both clear the
                  44px floor — the row from its padding, the button from its
                  own height.
                */}
                <div className="flex items-center gap-1 pl-4 pr-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(isOpen ? null : food.id);
                      setEditing(null);
                    }}
                    aria-expanded={isOpen}
                    className="flex min-w-0 flex-1 items-center gap-3 py-3 text-left"
                  >
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate text-[0.9375rem] font-medium leading-snug",
                        food.archived_at && "text-muted-foreground",
                      )}
                    >
                      {food.name}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {food.kcal.toLocaleString("en-GB")} kcal
                    </span>
                    <span
                      className="w-11 shrink-0 text-right text-xs tabular-nums"
                      style={{ color: "var(--ink-protein)" }}
                    >
                      {food.protein_g}g
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
                    >
                      <Plus className="size-4" /> {logging === food.id ? "Logging…" : "Log"}
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
                        onError={setError}
                      />
                    ) : (
                      <div className="space-y-3">
                        <dl className="grid grid-cols-3 gap-3 text-xs">
                          {MACROS.filter((macro) => macro !== "kcal").map((macro) => (
                            <div key={macro}>
                              <dt className="text-muted-foreground">{MACRO_LABELS[macro]}</dt>
                              <dd className="mt-0.5 font-medium tabular-nums">{food[macro]}g</dd>
                            </div>
                          ))}
                        </dl>
                        {/* What is actually in it, which is the thing worth
                            checking when a number looks wrong. */}
                        {food.items.length > 1 && (
                          <p className="text-xs leading-relaxed text-muted-foreground">
                            {food.items.map((item) => item.name).join(", ")}
                          </p>
                        )}
                        {food.assumptions && (
                          <p className="text-xs leading-relaxed text-muted-foreground">
                            {food.assumptions}
                          </p>
                        )}
                        <p className="text-xs tabular-nums text-muted-foreground">
                          {food.times_used > 0
                            ? `Logged ${food.times_used}× · last ${new Date(food.last_used_at ?? food.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
                            : "Never logged from here"}
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

      {archivedCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setShowArchived((v) => !v);
            setOpen(null);
          }}
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
