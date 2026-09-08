"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Watch } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WatchDay } from "@/lib/garmin/repository";

/** Where this browser had got to last time it looked. */
const KEY = "dofit-watch-seen";

/*
 * The marker, as an external store rather than mirrored into state.
 *
 * The same reasoning the outbox is built on: `localStorage` is the source of
 * truth, and copying it into `useState` inside an effect is the cascading
 * render React 19 rejects — the compiler's lint refuses it outright. Reading
 * through `useSyncExternalStore` keeps one copy of the value and lets a write
 * from anywhere on the page re-render whoever is showing it.
 *
 * `getItem` returns an equal string for an unchanged marker, and React
 * compares snapshots with `Object.is`, so this needs no cache to stay stable.
 */
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Private browsing and blocked site data throw; neither should take the page. */
function readMarker(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function writeMarker(day: string): void {
  try {
    window.localStorage.setItem(KEY, day);
  } catch {
    /* Nothing to remember it with. It will offer itself again, which is the
       safe direction to fail in. */
  }
  for (const listener of listeners) listener();
}

/** Nothing is marked on the server, so the card is absent until hydration. */
function serverMarker(): null {
  return null;
}

/**
 * What the watch did while you were not looking.
 *
 * The one part of this app that makes progress on its own. Meals are typed in;
 * steps and burn accrue whether or not the app is ever opened, and until now
 * they arrived silently and were visible only as an average buried on the
 * account screen. Showing them on arrival turns opening the app into a small
 * reward rather than a data-entry chore, which is the whole idea borrowed from
 * an idle game.
 *
 * It fires as often as the data arrives, which today is weekly: the sync runs
 * on Monday mornings, so this is a Monday event carrying six or seven days at
 * once. Nothing here assumes that. It compares the newest day the watch has
 * reported against the newest this browser has been shown, so moving the sync
 * to daily would make it a daily event with no change here.
 *
 * Per browser rather than per account, deliberately: it marks what *you have
 * seen*, and the phone and the laptop have seen different things.
 *
 * Silent on a browser that has never looked before. A card announcing three
 * weeks of history on first run is noise dressed up as a reward.
 */
export function WatchUpdate({ watch }: { watch: WatchDay[] }) {
  const newest = watch.length > 0 ? watch[watch.length - 1].day : null;
  const seen = useSyncExternalStore(subscribe, readMarker, serverMarker);

  // First run on this browser: remember where we are and say nothing. Writing
  // to storage is what an effect is *for* — an external system being brought
  // up to date with what React just rendered.
  useEffect(() => {
    if (newest && readMarker() === null) writeMarker(newest);
  }, [newest]);

  const fresh = seen && newest && newest > seen ? watch.filter((day) => day.day > seen) : [];
  if (fresh.length === 0 || !newest) return null;

  const steps = fresh.reduce((sum, day) => sum + (day.steps ?? 0), 0);
  const kcal = fresh.reduce((sum, day) => sum + (day.kcal ?? 0), 0);
  const n = (value: number) => value.toLocaleString("en-GB");

  return (
    <section className="surface p-4.5" aria-label={`Your watch reported ${fresh.length} new days`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex min-w-0 items-center gap-2 text-[1rem] font-semibold tracking-[-0.01em]">
          <Watch className="size-4 shrink-0" style={{ color: "var(--ink-energy)" }} aria-hidden />
          While you were away
        </h2>
        <Button size="sm" variant="ghost" onClick={() => writeMarker(newest)} className="shrink-0">
          Got it
        </Button>
      </div>

      {/* The figures are the reward, so they are the biggest thing here. */}
      <dl className="mt-3 grid grid-cols-3 gap-3">
        <Figure label={fresh.length === 1 ? "new day" : "new days"} value={n(fresh.length)} />
        <Figure label="steps" value={n(steps)} />
        <Figure label="kcal burned" value={n(kcal)} accent />
      </dl>
    </section>
  );
}

function Figure({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div>
      <dd
        className="m-0 text-[1.375rem] font-bold leading-none tracking-[-0.02em] tabular-nums"
        style={accent ? { color: "var(--ink-energy)" } : undefined}
      >
        {value}
      </dd>
      <dt className="mt-1 text-xs text-muted-foreground">{label}</dt>
    </div>
  );
}
