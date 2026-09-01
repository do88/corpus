"use client";

import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Bookmark, Loader2, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { correctMacros, deleteMeal, redescribeMeal, type MealRow } from "@/lib/meals/repository";
import { saveFoodFromMeal } from "@/lib/meals/saved";
import type { MealEstimate } from "@/lib/meal/schema";
import { MACRO_LABELS, formatTime, summariseItems } from "@/lib/meal/format";
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

  /** Still being estimated: nothing to show yet, and nothing to open. */
  const pending = meal.status === "pending";

  const summary =
    // `?.length` rather than `?.`: an empty items array joins to "", which is
    // not nullish and would have swallowed the note behind an empty title.
    (meal.items?.length ? summariseItems(meal.items) : undefined) ??
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
    /*
      While it is being analysed the card steps back and stops behaving like a
      button: no press response, no full-strength ink. There is nothing to open
      yet — the numbers it would show do not exist — and a card that presses in
      under your thumb and then does nothing is a card that looks broken.
    */
    <article
      className={`surface overflow-hidden ${pending ? "opacity-60" : "tappable"}`}
      aria-busy={pending || undefined}
    >
      <button
        type="button"
        onClick={() => setEditing((v) => !v)}
        disabled={pending}
        className="w-full px-5 py-4 text-left disabled:opacity-100"
        aria-expanded={editing}
      >
        {/*
          A figure on the right earns its column: the whole list is scanned
          down that edge for calories. "analysing…" is not a figure, it is a
          state, and putting it there split a small card into two columns to
          hold one short word — squeezing the description into half the width
          for the one status where the description is all there is to read.

          So while it is analysing the state goes on its own line above, and
          the card stays a single column at every width.
        */}
        {pending ? (
          <div className="space-y-1.5">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" aria-hidden />
              analysing…
            </span>
            <span className="block text-[1rem] font-medium leading-snug">{summary}</span>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0 text-[1rem] font-medium leading-snug">
              {summary}
            </span>
            <span className="shrink-0 text-right">
              {meal.status === "analyzed" ? (
                <>
                  <span className="text-[1.125rem] font-bold tabular-nums tracking-[-0.02em]">
                    {meal.kcal?.toLocaleString("en-GB")}
                  </span>
                  <span className="ml-1 text-xs font-medium text-muted-foreground">kcal</span>
                </>
              ) : (
                <Badge variant="destructive" className="rounded-full">failed</Badge>
              )}
            </span>
          </div>
        )}

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
          summary={summary}
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
  summary,
  onChanged,
  onRemoved,
  onDone,
}: {
  meal: MealRow;
  /** The card's own title, passed rather than recomputed: one fallback chain. */
  summary: string;
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

  // Re-describing: say what it actually was and let the model estimate that.
  const [describe, setDescribe] = useState("");

  /*
    Promoting this meal into the saved list.
    
    Two steps rather than one, because the name the estimator produced is a
    good description of a meal and often a poor name for a food — "Mackerel in
    tomato sauce, 2 × White toast, Irn-Bru (regular)" is accurate and nobody
    wants to see it in a list they scan every morning. Prefilled, so the
    common case is still a tap and a return.
  */
  const [naming, setNaming] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function keep() {
    const name = naming?.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      await saveFoodFromMeal(createClient(), meal, { name });
      setNaming(null);
      setSaved(true);
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : "Could not save that");
    } finally {
      setBusy(false);
    }
  }
  const [proposed, setProposed] = useState<{
    note: string;
    estimate: MealEstimate;
    model: string;
  } | null>(null);

  async function redo() {
    const note = describe.trim();
    if (!note) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/meals/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not re-estimate");

      const estimate = body.estimate as MealEstimate;
      // Filled in rather than applied. The numbers land in the same boxes you
      // would have typed them into, so the change is reviewable — and still
      // adjustable by hand — before anything is written.
      setValues({
        kcal: String(estimate.kcal),
        protein_g: String(estimate.protein_g),
        carbs_g: String(estimate.carbs_g),
        fat_g: String(estimate.fat_g),
      });
      setProposed({ note, estimate, model: body.model as string });
      setDescribe("");
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : "Could not re-estimate");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const macros = Object.fromEntries(
        MACROS.map((m) => [m, Math.max(0, Math.round(Number(values[m]) || 0))]),
      ) as Record<Macro, number>;

      // Which of the two saves this is depends on whether the numbers on screen
      // are still the ones the model just produced. Untouched, the whole
      // description moves across — name, items and assumptions with it. Touched
      // afterwards, the user has overruled it again and only the macros go,
      // because an itemisation that no longer adds up to its own totals is
      // worse than none.
      const untouched =
        proposed !== null && MACROS.every((m) => macros[m] === proposed.estimate[m]);

      if (untouched) {
        await redescribeMeal(createClient(), meal.id, proposed.note, proposed.estimate, proposed.model);
        onChanged({
          ...meal,
          ...macros,
          note: proposed.note,
          items: proposed.estimate.items,
          confidence: proposed.estimate.confidence,
          assumptions: proposed.estimate.assumptions,
          edited: false,
          status: "analyzed",
          error: null,
        });
      } else {
        await correctMacros(createClient(), meal.id, macros);
        // Applied locally as well as sent: Realtime delivers the same change a
        // moment later, and waiting for it makes a deliberate edit feel laggy.
        onChanged({ ...meal, ...macros, edited: true, status: "analyzed", error: null });
      }
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
    /*
      Inset from the card and rounded to match it. The radius was `rounded-2xl`,
      which on this theme is `--radius * 1.8` — about 40px, wider than the 22px
      card containing it, so the inner corners bowed out past the outer ones.
      Concentric is the rule that makes nested boxes look right: the inner
      radius is the outer radius minus the gap, so 22 − 8 = 14.

      Lighter, too. The fill is doing one job — marking this as a surface set
      into the card — and at half of `--muted` it was reading as a different
      material rather than the same one, slightly recessed.
    */
    <div
      className="mx-2 mb-2 space-y-3.5 p-4"
      style={{
        borderRadius: 14,
        background: "color-mix(in oklch, var(--muted) 35%, transparent)",
      }}
    >
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
      {/*
        Say what it actually was.

        Typing four numbers is the slow way to fix "beef jerky" when what you
        had was a large pack of biltong — and it only fixes the numbers, which
        leaves the card still calling it beef jerky. Describing it re-estimates
        the whole thing, name and all.
      */}
      <div className="flex items-center gap-2">
        <Input
          value={describe}
          onChange={(event) => setDescribe(event.target.value)}
          placeholder="say what it actually was…"
          aria-label="Describe what this meal actually was"
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void redo();
            }
          }}
          className="flex-1"
        />
        <Button
          size="icon"
          variant="secondary"
          onClick={redo}
          disabled={busy || !describe.trim()}
          aria-label="Re-estimate from this description"
          className="size-9 shrink-0 rounded-full"
        >
          <Sparkles className="size-4" />
        </Button>
      </div>

      {/*
        The proposed assumptions replace the old ones while a re-estimate is
        on the table, because the numbers in the boxes above are now its
        numbers — showing the previous sentence beside them would be
        describing a meal that is no longer on screen.
      */}
      {(proposed?.estimate.assumptions ?? meal.assumptions) && (
        <p className="text-xs leading-normal text-muted-foreground">
          {proposed ? (
            <>
              <span className="font-medium" style={{ color: "var(--ink-protein)" }}>
                Re-estimated ·{" "}
              </span>
              {proposed.estimate.assumptions}
            </>
          ) : (
            meal.assumptions
          )}
        </p>
      )}

      {/*
        Something you eat again.

        Only offered once there are numbers to keep: a pending or failed meal
        has nothing worth saving, and a saved food whose macros are null is a
        trap rather than a shortcut.
      */}
      {meal.status === "analyzed" && !saved && (
        naming === null ? (
          <Button
            variant="outline"
            onClick={() => setNaming(summary)}
            disabled={busy}
            className="w-full"
          >
            <Bookmark className="size-4" /> Save to your foods
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <Input
              value={naming}
              onChange={(event) => setNaming(event.target.value)}
              placeholder="what to call it…"
              aria-label="Name for your saved food"
              autoFocus
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void keep();
                }
              }}
              className="flex-1"
            />
            <Button onClick={keep} disabled={busy || !naming.trim()} className="shrink-0">
              Save
            </Button>
            <Button
              variant="ghost"
              onClick={() => setNaming(null)}
              disabled={busy}
              className="shrink-0"
            >
              Cancel
            </Button>
          </div>
        )
      )}

      {saved && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Bookmark className="size-3.5" aria-hidden />
          Saved. Logging it again will copy these numbers rather than guess them.
        </p>
      )}

      <div className="flex gap-2">
        <Button onClick={save} disabled={busy} className="flex-1">
          {busy ? "Working…" : proposed ? "Save the new estimate" : "Save"}
        </Button>
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button variant="destructive" onClick={remove} disabled={busy}>
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
