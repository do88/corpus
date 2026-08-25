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
  low: "bg-mark-red",
  medium: "bg-mark-yellow",
  high: "bg-mark-blue",
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
    <li className="border-b last:border-b-0">
      <button
        type="button"
        onClick={() => setEditing((v) => !v)}
        disabled={meal.status === "pending"}
        className="w-full rounded-md px-1 py-3 text-left transition-colors hover:bg-muted/50 disabled:cursor-default disabled:hover:bg-transparent"
        aria-expanded={editing}
      >
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-sm leading-snug">{summary}</span>
          <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
            {meal.status === "analyzed" ? (
              <>
                <span className="font-medium text-foreground">{meal.kcal}</span> ·{" "}
                {meal.protein_g}g
              </>
            ) : meal.status === "failed" ? (
              <Badge variant="destructive">failed</Badge>
            ) : (
              <span className="animate-pulse">analysing…</span>
            )}
          </span>
        </div>

        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          {meal.confidence && meal.status === "analyzed" && !meal.edited && (
            <span
              aria-label={`${meal.confidence} confidence`}
              className={`size-2 shrink-0 rounded-full ${CONFIDENCE_MARK[meal.confidence]}`}
            />
          )}
          <span>{formatTime(meal.logged_at)}</span>
          {meal.edited && <Badge variant="secondary">corrected</Badge>}
          {!meal.edited && meal.assumptions && (
            <span className="truncate">{meal.assumptions}</span>
          )}
          {meal.error && <span className="truncate text-destructive">{meal.error}</span>}
        </div>
      </button>

      {editing && (
        <Editor
          meal={meal}
          onChanged={onChanged}
          onRemoved={onRemoved}
          onDone={() => setEditing(false)}
        />
      )}
    </li>
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

      {meal.assumptions && (
        <p className="text-xs leading-normal text-muted-foreground">
          It assumed: {meal.assumptions}
        </p>
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
