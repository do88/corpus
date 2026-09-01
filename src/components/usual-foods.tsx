"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { localDay } from "@/lib/time";
import { enqueue } from "@/lib/outbox/store";
import { estimateFromSaved, type SavedFoodRow } from "@/lib/meals/saved";

/**
 * The things you have most mornings, one tap away.
 *
 * This is the point of the whole saved-food idea, and the reason it sits here
 * rather than only on its own screen: the moment you want your usual shake is
 * the moment you are looking at Today, and anything that costs a navigation
 * first will lose to typing it out.
 *
 * A tap here logs immediately. No model call, no three-second wait, no
 * "analysing" card — the numbers were settled the day you saved it, and
 * logging copies them. It also means this is the only way to log that works
 * with no signal at all: the outbox already worked offline, but everything in
 * it still owed an estimate before it meant anything.
 */
export function UsualFoods({
  foods,
  onQueued,
}: {
  foods: SavedFoodRow[];
  /**
   * The same contract the composer uses. Queueing a meal only writes it to the
   * outbox; something still has to send it, and Today owns that — it holds the
   * optimistic list the queued meal appears in and the flush that clears it.
   *
   * Calling `router.refresh()` here instead looked like it worked and did not:
   * the chip's meal showed up on screen straight away, because the optimistic
   * card is rendered from the outbox, and never reached the database at all.
   */
  onQueued: () => void;
}) {
  const [logging, setLogging] = useState<string | null>(null);

  if (foods.length === 0) return null;

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
        // What makes it instant: the estimate travels with the meal, so the
        // row lands finished and the worker is never asked.
        saved: {
          id: food.id,
          timesUsed: food.times_used,
          estimate: estimateFromSaved(food),
        },
      });
      onQueued();
    } finally {
      setLogging(null);
    }
  }

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between gap-3 px-1">
        <h2 className="text-xs font-medium text-muted-foreground">Your usual</h2>
        <Link
          href="/foods"
          className="text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          All
        </Link>
      </div>

      {/*
        A scrolling row rather than a wrapping grid. The list is ordered by how
        often each one is eaten, so what matters is that the first two or three
        are reachable without the block growing tall enough to push the day's
        meals off the screen.
      */}
      {/*
        The padding is holding the shadow, not spacing the chips.

        `overflow-x-auto` is not only horizontal: a box that scrolls on one
        axis clips on both, so the card shadow — which falls 16px down and
        blurs 32 — was being cut off square along the bottom of the row. The
        4px of padding that used to be here was for looks and nowhere near
        enough for it.

        So the scroller carries enough room for the shadow inside it and the
        negative margin takes the same amount back out of the layout, leaving
        the spacing exactly where it was and the shadow whole.
      */}
      <ul className="-mx-5 -mb-5 flex snap-x gap-2 overflow-x-auto px-5 pb-6 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {foods.map((food) => (
          <li key={food.id} className="snap-start">
            <button
              type="button"
              onClick={() => log(food)}
              disabled={logging !== null}
              aria-label={`Log ${food.name}, ${food.kcal} kcal`}
              className="surface tappable flex h-11 items-center gap-2 whitespace-nowrap px-3.5 disabled:opacity-60"
              style={{ borderRadius: 999 }}
            >
              {logging === food.id ? (
                <span className="text-sm font-medium">logging…</span>
              ) : (
                <>
                  <Plus className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="text-sm font-medium">{food.name}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {food.kcal.toLocaleString("en-GB")}
                  </span>
                </>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
