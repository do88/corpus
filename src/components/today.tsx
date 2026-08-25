"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { CloudUpload, Flame, Utensils } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { MetricCard } from "@/components/metric-card";
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

/**
 * The day at a glance: two rings, and a line about what is still in flight.
 *
 * A grid rather than a stack, because two figures side by side are one glance
 * and two stacked are two.
 *
 * Only two rings, though the reference design runs four cards. Rings are for
 * figures with a target, and this app has exactly two of those. Carbs and fat
 * are measured but untargeted so they read as plain numbers below; water and
 * weight are not measured at all, so they are absent rather than mocked up.
 */
function Totals({
  totals,
  queued,
}: {
  totals: ReturnType<typeof totalsForDay>;
  queued: number;
}) {
  const inFlight = queued > 0 || totals.pending > 0 || totals.failed > 0;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <MetricCard
          label="Calories"
          icon={<Flame className="size-4" />}
          value={totals.kcal}
          target={DAILY_TARGET.kcal}
          unit="kcal"
          metric="energy"
        />
        <MetricCard
          label="Protein"
          icon={<Utensils className="size-4" />}
          value={totals.protein_g}
          target={DAILY_TARGET.protein_g}
          unit="g"
          metric="protein"
        />
      </div>

      {/*
        Carbs and fat are measured but untargeted, so they get figures rather
        than rings. A ring implies a goal, and drawing one against a number
        nobody set would be decoration dressed as data — the same reason there
        is no water or weight card here, however good four would look.
      */}
      <div className="surface flex items-center justify-around px-3.5 py-3">
        {[
          { label: "Carbs", value: totals.carbs_g },
          { label: "Fat", value: totals.fat_g },
        ].map((macro) => (
          <div key={macro.label} className="text-center">
            <div className="text-[1.0625rem] font-semibold tabular-nums">
              {macro.value.toLocaleString("en-GB")}
              <span className="ml-0.5 text-xs font-medium text-muted-foreground">g</span>
            </div>
            <div className="mt-0.5 text-[0.6875rem] uppercase tracking-[0.06em] text-muted-foreground">
              {macro.label}
            </div>
          </div>
        ))}
      </div>

      {inFlight && (
        <div className="flex flex-wrap items-center gap-2 px-1">
          {queued > 0 && (
            <Badge variant="secondary" className="rounded-full">
              <CloudUpload className="size-3" aria-hidden /> {queued} to send
            </Badge>
          )}
          {totals.pending > 0 && (
            <Badge variant="secondary" className="rounded-full">
              {totals.pending} analysing
            </Badge>
          )}
          {totals.failed > 0 && (
            <Badge variant="destructive" className="rounded-full">
              {totals.failed} failed
            </Badge>
          )}
        </div>
      )}
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
      <div className="surface px-6 py-10 text-center">
        <p className="text-[0.9375rem] font-medium">Nothing logged yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Say what you ate, or add a photo.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-2.5">
      {queued.map((meal) => (
        <li key={meal.clientId} className="surface px-4 py-3.5">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-[0.9375rem] font-medium leading-snug">
              {meal.note || (meal.photo ? "Photo" : "Meal")}
            </span>
            <Badge variant="secondary" className="shrink-0 rounded-full">
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
