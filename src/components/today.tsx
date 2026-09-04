"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { CloudUpload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { MacroLines } from "@/components/macro-lines";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { localDay } from "@/lib/time";
import { formatTime, mealBand } from "@/lib/meal/format";
import type { DailyTargets } from "@/lib/meals/targets";
import { listMealsInRange, totalsForDay, type MealRow } from "@/lib/meals/repository";
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
  earliest,
  targets,
}: {
  initialMeals: MealRow[];
  day: string;
  today: string;
  logged: Record<string, number>;
  /** First day ever logged; navigation stops here. Null on an empty log. */
  earliest: string | null;
  /** Computed server-side from the latest weigh-in — see lib/meals/targets.ts. */
  targets: DailyTargets;
}) {
  const router = useRouter();
  const [meals, setMeals] = useState(initialMeals);

  // The server re-renders on every date change, so the list has to follow the
  // props rather than keep the day it first mounted with.
  // A day is on its way. Driven entirely by the picker's links reporting
  // their own status, so it can never be left on: the link that turned it on
  // turns it off, including by unmounting.
  const [switching, setSwitching] = useState(false);

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

  /** Send whatever is waiting, re-read the day, and nudge anything stuck. */
  const sync = useCallback(async () => {
    /*
      First: is this page still about today?

      A PWA left open overnight comes back in the morning exactly as it was
      left — same date in the header, same day's meals — because nothing about
      resuming a page changes what was rendered into it. The re-read below
      would then faithfully fetch the meals for *yesterday*, since that is the
      day the page believes in. The same happens when the service worker
      answers a cold open from its cache and the cached copy is from before
      midnight.

      So the first check is against the clock, not the database. If the day
      the server rendered is no longer the day it is, the whole page is stale
      and is re-rendered from the server rather than patched.
    */
    if (localDay() !== today) {
      router.refresh();
      return;
    }

    await flushOutbox();
    await refresh();

    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;

    /*
      Re-read the day from the database.

      This list arrived as server-rendered props and, until now, nothing ever
      replaced it. `refresh` above re-reads the outbox, which is a different
      thing entirely, and realtime only delivers changes that happen while its
      channel is actually connected — which a backgrounded phone's is not.

      So a page that was stale when it painted stayed stale for as long as it
      was open. Log a meal on a laptop, pick up a phone whose PWA has been
      sitting in the background, and it shows a day with nothing in it, for
      ever, because there was no path by which it could ever learn otherwise.

      Read through PostgREST rather than by refreshing the route, and that is
      deliberate: `/rest/v1/` is NetworkOnly in the service worker, while
      navigations and RSC payloads are NetworkFirst with a three-second
      timeout. Refreshing the route on a slow connection could answer a
      staleness problem with a cached copy of the same stale page.
    */
    try {
      setMeals(await listMealsInRange(supabase, day, day));
    } catch {
      // A failed re-read leaves what is on screen. It is the same list as a
      // moment ago, not a worse one, and the next visibility change tries again.
    }

    // A meal whose worker never ran would otherwise sit saying "analysing"
    // until the hourly sweep. Opening the app is the moment you would notice,
    // so it is also the moment to retry.
    await retryStalePending(supabase, session.access_token, day);
  }, [day, today, router]);

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
    let attempt = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;

    /**
     * Join, and if the join fails, join again.
     *
     * A failed subscribe used to be terminal. The callback logged the error and
     * stopped, so the page carried on looking healthy while nothing arrived
     * over the socket until something happened to re-run this effect — a
     * reload, or changing day. Realtime being down is not itself unusual; not
     * recovering from it is the bug.
     *
     * Re-subscribing on the same topic is also the likeliest cause of the
     * failure in the first place: a leave that is still in flight when the
     * next join arrives is a duplicate as far as the server is concerned, and
     * a hot reload or a route being hidden and shown again produces exactly
     * that. Which makes a short wait the right response either way.
     */
    const join = async () => {
      if (cancelled) return;

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

      // Anything still attached from a previous attempt goes first, and is
      // awaited — leaving and rejoining the same topic in the same breath is
      // the race this is recovering from.
      if (channelRef.current) {
        const previous = channelRef.current;
        channelRef.current = null;
        await supabase.removeChannel(previous);
        if (cancelled) return;
      }

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
          if (status === "SUBSCRIBED") {
            attempt = 0;
            return;
          }
          if (status !== "CHANNEL_ERROR" && status !== "TIMED_OUT") return;
          if (cancelled) return;

          // Backed off, and capped. Five tries covers a hot reload racing its
          // own teardown; past that it is not a race and hammering the socket
          // will not help.
          if (attempt >= 5) {
            console.error(`[realtime] ${status} on meal_log:${day}, giving up`, error ?? "");
            return;
          }
          const wait = 500 * 2 ** attempt;
          attempt += 1;
          console.warn(`[realtime] ${status} on meal_log:${day}, retrying in ${wait}ms`);
          retry = setTimeout(() => void join(), wait);
        });

      channelRef.current = channel;
    };

    void join();

    /**
     * Keep Realtime's copy of the token current.
     *
     * The token handed over above is the one that was valid at subscribe time,
     * and access tokens expire in an hour. Realtime holds its own connection
     * with its own copy, so a refresh that quietly fixes every REST call does
     * nothing for the socket — it carries on presenting a token the server has
     * stopped accepting, and the channel dies partway through a session with
     * no failure the page can see.
     *
     * Cheap to prevent, and the alternative is a class of bug that only shows
     * up an hour in, which is exactly the kind nobody reproduces on purpose.
     */
    const { data: auth } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) void supabase.realtime.setAuth(session.access_token);
    });

    return () => {
      cancelled = true;
      clearTimeout(retry);
      auth.subscription.unsubscribe();
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
      <DayPicker
        day={day}
        today={today}
        logged={logged}
        earliest={earliest}
        kcalTarget={targets.kcal}
        onPending={setSwitching}
      />
      {/*
        The figures and the list step back while a different day is loading.
        Not a skeleton: the old day's numbers dimmed say "this is changing"
        without the layout jumping to placeholders and back. Delayed to match
        the disc, so a prefetched day that arrives in a few frames never
        flickers it.
      */}
      <div
        aria-busy={switching || undefined}
        className="space-y-5 transition-opacity duration-200"
        style={
          switching
            ? { opacity: 0.45, pointerEvents: "none", transitionDelay: "150ms" }
            : { transitionDelay: "0ms" }
        }
      >
      <Totals totals={totals} queued={queued.length} targets={targets} />
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
      <MacroLines values={totals} targets={targets} />

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
