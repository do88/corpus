"use client";

import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { correctMacros, deleteMeal, type MealRow } from "@/lib/meals/repository";
import { MACRO_LABELS, formatTime } from "@/lib/meal/format";
import { MACROS, type Macro } from "@/lib/meal/schema";

/**
 * One logged meal, and the ability to overrule it.
 *
 * Correcting is the feature that decides whether the rest is worth anything.
 * An estimate you cannot argue with is one you quietly stop believing, and a
 * tracker you have stopped believing is one you stop opening. So the numbers
 * are one tap from editable, and a corrected meal says so rather than
 * pretending the model got it right.
 */

/** Confidence is the one thing colour is spent on. */
const CONFIDENCE_MARK: Record<NonNullable<MealRow["confidence"]>, string> = {
  low: "bg-destructive",
  medium: "bg-accent-energy",
  high: "bg-accent-protein",
};

export function MealEntry({
  meal,
  onChanged,
  onRemoved,
}: {
  meal: MealRow;
  onChanged: (row: MealRow) => void;
  onRemoved: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);

  const summary =
    meal.items?.map((i) => i.name).join(", ") ??
    meal.note ??
    (meal.photo_path ? "Photo" : "Meal");

  return (
    // An <article>, not an <li>: the timeline in `today.tsx` owns the list item
    // so it can put the spine node beside this card. Returning an <li> here too
    // nested one inside another, which is invalid and showed up as a hydration
    // mismatch rather than anything visible.
    //
    // Each meal is its own card. A divided list reads as a table; separate
    // cards read as objects you can act on — which these are, since tapping one
    // opens its numbers for correction.
    <article className="surface tappable overflow-hidden">
      <button
        type="button"
        onClick={() => setEditing((v) => !v)}
        disabled={meal.status === "pending"}
        className="w-full px-4 py-3.5 text-left disabled:opacity-100"
        aria-expanded={editing}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="min-w-0 text-[0.9375rem] font-medium leading-snug">
            {summary}
          </span>
          <span className="shrink-0 text-right">
            {meal.status === "analyzed" ? (
              <>
                <span className="text-[1.0625rem] font-bold tabular-nums tracking-[-0.02em]">
                  {meal.kcal?.toLocaleString("en-GB")}
                </span>
                <span className="ml-1 text-xs font-medium text-muted-foreground">kcal</span>
              </>
            ) : meal.status === "failed" ? (
              <Badge variant="destructive" className="rounded-full">failed</Badge>
            ) : (
              <span className="text-xs text-muted-foreground animate-pulse">analysing…</span>
            )}
          </span>
        </div>

        {/*
          Two lines, not one. Cramming the time, the protein, a badge and a
          sentence of assumptions into a single flex row made the short items
          wrap mid-word — "48g / protein" over two lines beside a truncated
          sentence. The facts stay on the first line where they are scannable,
          and the model's prose gets a line of its own to be cut off on.
        */}
        <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
          {meal.confidence && meal.status === "analyzed" && !meal.edited && (
            <span
              aria-label={`${meal.confidence} confidence`}
              className={`size-1.5 shrink-0 rounded-full ${CONFIDENCE_MARK[meal.confidence]}`}
            />
          )}
          <span className="shrink-0 tabular-nums">{formatTime(meal.logged_at)}</span>
          {meal.status === "analyzed" && meal.protein_g != null && (
            <span
              className="shrink-0 whitespace-nowrap font-medium tabular-nums"
              style={{ color: "var(--ink-protein)" }}
            >
              {meal.protein_g}g protein
            </span>
          )}
          {meal.edited && (
            <Badge variant="secondary" className="shrink-0 rounded-full">
              corrected
            </Badge>
          )}
        </div>

        {/*
          Collapsed only. The editor below prints the same sentence in full,
          and showing both put a truncated copy directly above the complete
          one — the same text twice, the first cut off mid-word.
        */}
        {!editing && !meal.edited && meal.assumptions && meal.status === "analyzed" && (
          <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{meal.assumptions}</p>
        )}
        {meal.error && (
          <p className="mt-1 line-clamp-2 text-xs text-destructive">{meal.error}</p>
        )}
      </button>

      {editing && (
        <Editor
          meal={meal}
          onChanged={onChanged}
          onRemoved={onRemoved}
          onDone={() => setEditing(false)}
        />
      )}
    </article>
  );
}

function Editor({
  meal,
  onChanged,
  onRemoved,
  onDone,
}: {
  meal: MealRow;
  onChanged: (row: MealRow) => void;
  onRemoved: (id: string) => void;
  onDone: () => void;
}) {
  const [values, setValues] = useState<Record<Macro, string>>({
    kcal: String(meal.kcal ?? 0),
    protein_g: String(meal.protein_g ?? 0),
    carbs_g: String(meal.carbs_g ?? 0),
    fat_g: String(meal.fat_g ?? 0),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const macros = Object.fromEntries(
        MACROS.map((m) => [m, Math.max(0, Math.round(Number(values[m]) || 0))]),
      ) as Record<Macro, number>;

      await correctMacros(createClient(), meal.id, macros);
      // Applied locally as well as sent: Realtime delivers the same change a
      // moment later, and waiting for it makes a deliberate edit feel laggy.
      onChanged({ ...meal, ...macros, edited: true, status: "analyzed", error: null });
      onDone();
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await deleteMeal(createClient(), meal.id);
      onRemoved(meal.id);
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : "Could not delete");
      setBusy(false);
    }
  }

  return (
    <div className="mb-3 space-y-3 rounded-md bg-muted/50 p-3">
      <div className="grid grid-cols-4 gap-2">
        {MACROS.map((macro) => (
          <div key={macro} className="space-y-1">
            <Label htmlFor={`${meal.id}-${macro}`} className="text-xs text-muted-foreground">
              {MACRO_LABELS[macro]}
            </Label>
            <Input
              id={`${meal.id}-${macro}`}
              type="number"
              inputMode="numeric"
              min={0}
              value={values[macro]}
              onChange={(e) => setValues((v) => ({ ...v, [macro]: e.target.value }))}
              className="tabular-nums"
            />
          </div>
        ))}
      </div>

      {/*
        No "It assumed:" prefix. The model's sentences already open with
        "Assumed …", so the label ran straight into the verb — "It assumed:
        Assumed one standard 250g pouch". The collapsed card shows the same
        sentence bare, and the two views agreeing is worth more than a label
        on a line whose subject is obvious.
      */}
      {meal.assumptions && (
        <p className="text-xs leading-normal text-muted-foreground">{meal.assumptions}</p>
      )}

      <div className="flex gap-2">
        <Button size="sm" onClick={save} disabled={busy} className="flex-1">
          {busy ? "Saving…" : "Save"}
        </Button>
        <Button size="sm" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button size="sm" variant="destructive" onClick={remove} disabled={busy}>
          Delete
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
