"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { CloudUpload, Droplet, Flame, Utensils, Wheat } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { MetricCard } from "@/components/metric-card";
import { createClient } from "@/lib/supabase/client";
import { formatTime, mealBand } from "@/lib/meal/format";
import type { DailyTargets } from "@/lib/meals/targets";
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
import { Advisor } from "./advisor";
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
  targets,
}: {
  initialMeals: MealRow[];
  day: string;
  today: string;
  logged: Record<string, number>;
  /** Computed server-side from the latest weigh-in — see lib/meals/targets.ts. */
  targets: DailyTargets;
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

  // Held in a ref because the channel is created inside an async effect — the
  // cleanup runs before that resolves on a fast day-change, and it needs
  // something to remove.
  const channelRef = useRef<RealtimeChannel | null>(null);

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
    let cancelled = false;

    (async () => {
      /**
       * Hand Realtime the access token before subscribing.
       *
       * Realtime is a separate websocket from the REST calls, and it enforces
       * RLS on its own connection. Without a token it connects as `anon`, the
       * owner policy refuses every row, and the server does exactly what it
       * should: sends nothing. The subscription reports `SUBSCRIBED` either
       * way, so the failure looks identical to an idle channel — meals only
       * appeared on a refresh, because a refresh is the one path that re-reads
       * the table over REST where the token *is* attached.
       */
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session) await supabase.realtime.setAuth(session.access_token);
      if (cancelled) return;

      const channel = supabase
        // Day-scoped topic. A constant name meant changing date tore down and
        // re-created a channel with the same topic while the previous leave was
        // still in flight, which the server is entitled to treat as a duplicate.
        .channel(`meal_log:${day}`)
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
        .subscribe((status, error) => {
          // Previously `.subscribe()` took no callback, so a channel that never
          // joined was indistinguishable from one with nothing to say.
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.error(`[realtime] ${status} on meal_log:${day}`, error ?? "");
          }
        });

      channelRef.current = channel;
    })();

    return () => {
      cancelled = true;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [day, upsert]);

  const totals = totalsForDay(meals);

  const isToday = day === today;

  return (
    <div className="mt-5 space-y-5">
      <DayPicker day={day} today={today} logged={logged} />
      <Totals totals={totals} queued={queued.length} targets={targets} />
      {/* Logging always applies to now, so it only shows on today. Offering it
          on a past day would imply back-dating, which the 04:00 rule already
          decides and the composer has no way to override. */}
      {isToday && (
        <>
          <MealLogger
            onQueued={() => {
              void sync();
            }}
          />
          {/* Under the composer, not above it: logging is why this screen
              exists, and deciding what to eat is the occasional question. */}
          <Advisor
            onQueued={() => {
              void sync();
            }}
          />
        </>
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
 * Four rings, one per macro. Carbs and fat started as plain numbers because
 * they had no target and a ring against a number nobody set is decoration
 * pretending to be data — so they got targets rather than a ring drawn over
 * nothing. Both are *derived* in `targets.ts`: protein is fixed by lean mass,
 * energy by the deficit, and what remains splits between the other two, so all
 * four always sum back to the calorie target.
 *
 * Still no water or weight card, however well six would fill the grid. Those
 * are not measured, and there is nothing to draw.
 */
function Totals({
  totals,
  queued,
  targets,
}: {
  totals: ReturnType<typeof totalsForDay>;
  queued: number;
  targets: DailyTargets;
}) {
  const inFlight = queued > 0 || totals.pending > 0 || totals.failed > 0;

  return (
    <div className="space-y-3">
      {/* Two-up on a phone, four-across once there is room — the four are one
          set and only split into rows because a phone cannot hold them. */}
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <MetricCard
          label="Calories"
          icon={<Flame className="size-4" />}
          value={totals.kcal}
          target={targets.kcal}
          unit="kcal"
          metric="energy"
        />
        <MetricCard
          label="Protein"
          icon={<Utensils className="size-4" />}
          value={totals.protein_g}
          target={targets.protein_g}
          unit="g"
          metric="protein"
        />
        <MetricCard
          label="Carbs"
          icon={<Wheat className="size-4" />}
          value={totals.carbs_g}
          target={targets.carbs_g}
          unit="g"
          metric="water"
        />
        <MetricCard
          label="Fat"
          icon={<Droplet className="size-4" />}
          value={totals.fat_g}
          target={targets.fat_g}
          unit="g"
          metric="weight"
        />
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

/**
 * The day as a timeline.
 *
 * Meals in the order they happened, newest first, on a spine with the time
 * against each one. A plain list of cards said *what* was eaten; a timeline
 * says *when*, and when is most of what you look at a food log to find out —
 * whether the gap between breakfast and lunch was six hours, whether the
 * calories all landed after nine at night. The data was always there in a
 * subtitle; this makes it the structure instead.
 *
 * Anything still queued sits at the top, above the spine rather than on it:
 * those meals have a time but have not reached the server, and putting them
 * in the sequence would imply a certainty they do not have yet.
 */
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
        <p className="text-[1rem] font-medium">Nothing logged yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Say what you ate, or add a photo.
        </p>
      </div>
    );
  }

  const ordered = [...meals].reverse();

  /*
    The spine takes the colour of the day it spans: warm at the morning end,
    cool through the afternoon, deep at the evening one.

    The stops come from the meals themselves rather than from a fixed
    sunrise-to-dusk ramp. A fixed ramp would draw a full day's sweep behind
    three meals that all happened after eight at night, which is exactly the
    shape this view exists to make visible. A day logged entirely in one band
    gets that band, flat — one stop, so `linear-gradient` needs the duplicate.
  */
  const bands = [...new Set(ordered.map((meal) => mealBand(meal.logged_at)))];
  const spine = `linear-gradient(to bottom, ${(bands.length === 1 ? [bands[0], bands[0]] : bands)
    .map((band) => `var(--time-${band})`)
    .join(", ")})`;

  return (
    <div className="space-y-3">
      {queued.length > 0 && (
        <ul className="space-y-3">
          {queued.map((meal) => (
            <li key={meal.clientId} className="surface px-5 py-4">
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-[1rem] font-medium leading-snug">
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
        </ul>
      )}

      {ordered.length > 0 && (
        <ol className="relative space-y-3">
          {/*
            The spine. Absolutely positioned rather than a border on each row,
            so it runs continuously through the gaps between cards — a border
            per item would break at every margin and read as ticks, not a line.
            Inset to stop short of the last node so it does not dangle.
          */}
          <span
            aria-hidden
            className="absolute left-[5px] top-3 bottom-3 w-px"
            style={{ background: spine }}
          />

          {ordered.map((meal) => (
            <li key={meal.id} className="relative flex gap-3">
              <span
                aria-hidden
                className="relative z-10 mt-[1.15rem] size-2.5 shrink-0 rounded-full ring-4"
                style={{
                  // Time of day for a meal that landed; status colour for one
                  // that did not. Failed and pending are the exceptions worth
                  // spending a colour on, so they keep theirs.
                  background:
                    meal.status === "analyzed"
                      ? `var(--time-${mealBand(meal.logged_at)})`
                      : meal.status === "failed"
                        ? "var(--destructive)"
                        : "var(--muted-foreground)",
                  // The ring is the page colour, which punches a hole in the
                  // spine behind each node rather than letting the line run
                  // through it.
                  "--tw-ring-color": "var(--background)",
                } as React.CSSProperties}
              />
              <div className="min-w-0 flex-1">
                <MealEntry meal={meal} onChanged={onChanged} onRemoved={onRemoved} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
