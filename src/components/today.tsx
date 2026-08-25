"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { CloudUpload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { createClient } from "@/lib/supabase/client";
import { formatTime } from "@/lib/meal/format";
import { DAILY_TARGET } from "@/lib/meals/targets";
import { totalsForDay, type MealRow } from "@/lib/meals/repository";
import {
  getServerSnapshot,
  getSnapshot,
  refresh,
  subscribe,
  type OutboxMeal,
} from "@/lib/outbox/store";
import { flushOutbox } from "@/lib/outbox/sync";
import { retryStalePending } from "@/lib/meals/retry";
import { MealLogger } from "./meal-logger";
import { MealEntry } from "./meal-entry";
import { DayPicker } from "./day-picker";

/**
 * The day's log: what has been sent, and what is still queued on the phone.
 *
 * Three things write here — the outbox when a meal is captured, the flush when
 * it reaches the server, and Realtime when the worker fills in the numbers.
 * Everything funnels through `upsert` so whichever arrives second replaces the
 * first rather than doubling it.
 */
export function Today({
  initialMeals,
  day,
  today,
  logged,
}: {
  initialMeals: MealRow[];
  day: string;
  today: string;
  logged: Record<string, number>;
}) {
  const [meals, setMeals] = useState(initialMeals);

  // The server re-renders on every date change, so the list has to follow the
  // props rather than keep the day it first mounted with.
  const [shownDay, setShownDay] = useState(day);
  if (shownDay !== day) {
    setShownDay(day);
    setMeals(initialMeals);
  }

  // IndexedDB is the source of truth; this is a view of it. Mirroring it into
  // useState would mean setting state inside an effect, which React 19 rejects
  // for good reason — it is what this hook exists to replace.
  const allQueued = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const queued = allQueued.filter((m) => m.localDate === day);

  const upsert = useCallback((row: MealRow) => {
    setMeals((current) => {
      const index = current.findIndex((m) => m.id === row.id);
      if (index === -1) return [...current, row];
      const next = [...current];
      next[index] = row;
      return next;
    });
  }, []);

  /** Send whatever is waiting, re-read what's left, and nudge anything stuck. */
  const sync = useCallback(async () => {
    await flushOutbox();
    await refresh();

    // A meal whose worker never ran would otherwise sit saying "analysing"
    // until the hourly sweep. Opening the app is the moment you would notice,
    // so it is also the moment to retry.
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session) await retryStalePending(supabase, session.access_token, day);
  }, [day]);

  // Three triggers, because none is reliable alone. Background Sync (in the
  // service worker) doesn't fire in every state; these two are a few lines and
  // cover the ordinary cases — reopening the app, and signal coming back.
  useEffect(() => {
    // `refresh` and `sync` both await before touching the store, so nothing is
    // set synchronously here.
    void refresh().then(sync);

    // Only when the app becomes visible. `visibilitychange` fires on the way
    // out too, so an unguarded handler ran a full flush, a session read and a
    // stale-pending sweep every time the phone was locked or the app switched
    // away from — doubling the network cost of the trigger for work nobody was
    // waiting on.
    const onVisible = () => {
      if (document.visibilityState === "visible") void sync();
    };

    window.addEventListener("online", sync);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", sync);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [sync]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("meal_log_today")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "meal_log", filter: `local_date=eq.${day}` },
        (payload) => {
          if (payload.eventType === "DELETE") {
            setMeals((c) => c.filter((m) => m.id !== (payload.old as MealRow).id));
          } else {
            upsert(payload.new as MealRow);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [day, upsert]);

  const totals = totalsForDay(meals);

  const isToday = day === today;

  return (
    <div className="mt-5 space-y-5">
      <DayPicker day={day} today={today} logged={logged} />
      <Totals totals={totals} queued={queued.length} />
      {/* Logging always applies to now, so it only shows on today. Offering it
          on a past day would imply back-dating, which the 04:00 rule already
          decides and the composer has no way to override. */}
      {isToday && (
        <MealLogger
          onQueued={() => {
            void sync();
          }}
        />
      )}
      <MealList
        meals={meals}
        queued={queued}
        onChanged={upsert}
        onRemoved={(id) => setMeals((c) => c.filter((m) => m.id !== id))}
      />
    </div>
  );
}

function Totals({
  totals,
  queued,
}: {
  totals: ReturnType<typeof totalsForDay>;
  queued: number;
}) {
  return (
    <Card>
      <CardContent className="space-y-5">
        <Figure value={totals.kcal} target={DAILY_TARGET.kcal} label="kcal" large />
        <Figure
          value={totals.protein_g}
          target={DAILY_TARGET.protein_g}
          label="protein"
          suffix=" g"
        />

        {(queued > 0 || totals.pending > 0 || totals.failed > 0) && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {queued > 0 && (
              <Badge variant="secondary">
                <CloudUpload className="size-3" aria-hidden /> {queued} to send
              </Badge>
            )}
            {totals.pending > 0 && <Badge variant="secondary">{totals.pending} analysing</Badge>}
            {totals.failed > 0 && <Badge variant="destructive">{totals.failed} failed</Badge>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** A figure against its target. Over target is shown, not silently clamped. */
function Figure({
  value,
  target,
  label,
  large = false,
  suffix = "",
}: {
  value: number;
  target: number;
  label: string;
  large?: boolean;
  suffix?: string;
}) {
  const percent = target === 0 ? 0 : (value / target) * 100;
  const over = percent > 100;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <span
          className={`font-semibold tabular-nums ${large ? "text-4xl tracking-tight" : "text-2xl"}`}
        >
          {value.toLocaleString("en-GB")}
          {suffix}
        </span>
        <span className="text-sm text-muted-foreground">
          {label} of {target.toLocaleString("en-GB")}
        </span>
      </div>
      <Progress
        value={Math.min(100, percent)}
        className={`mt-2 h-1.5 ${over ? "[&>div]:bg-destructive" : ""}`}
      />
    </div>
  );
}

function MealList({
  meals,
  queued,
  onChanged,
  onRemoved,
}: {
  meals: MealRow[];
  queued: OutboxMeal[];
  onChanged: (row: MealRow) => void;
  onRemoved: (id: string) => void;
}) {
  if (meals.length === 0 && queued.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Nothing logged.
      </p>
    );
  }

  return (
    <ul>
      {queued.map((meal) => (
        <li key={meal.clientId} className="border-b px-1 py-3">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-sm leading-snug">
              {meal.note || (meal.photo ? "Photo" : "Meal")}
            </span>
            <Badge variant="secondary" className="shrink-0">
              <CloudUpload className="size-3" aria-hidden /> waiting
            </Badge>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {formatTime(meal.loggedAt)}
            {meal.lastError && ` · ${meal.lastError}`}
          </div>
        </li>
      ))}

      {[...meals].reverse().map((meal) => (
        <MealEntry key={meal.id} meal={meal} onChanged={onChanged} onRemoved={onRemoved} />
      ))}
    </ul>
  );
}
