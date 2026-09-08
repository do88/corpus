"use client";

import { useEffect, useState } from "react";
import { Flame, Target } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { calculateStreaks, loadStreakMeals } from "@/lib/meals/streaks";
import { loadTargets } from "@/lib/meals/load-targets";
import { localDay } from "@/lib/time";

export type StreakDisplay = {
  /** Consecutive days with an entry, including today. */
  logged: number;
  /** Consecutive completed days that hit both goals. Kept for the label. */
  onTarget: number;
  /** The current Monday-to-today week, which is what the pill shows. */
  week: { logged: number; onTarget: number };
  kcal: number;
  protein: number;
};

export function TrackingStreaks({ initial }: { initial: StreakDisplay | null }) {
  const [value, setValue] = useState(initial);
  const [serverValue, setServerValue] = useState(initial);
  if (serverValue !== initial) {
    setServerValue(initial);
    setValue(initial);
  }
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    let loadedDay = localDay();
    let request = 0;
    let timer: ReturnType<typeof setTimeout>;
    const reload = async () => {
      const currentRequest = ++request;
      try {
        const today = localDay();
        const [meals, targets] = await Promise.all([loadStreakMeals(supabase, today), loadTargets(supabase)]);
        if (!cancelled && currentRequest === request) {
          loadedDay = today;
          setValue({ ...calculateStreaks(meals, today, targets), kcal: targets.kcal, protein: targets.protein_g });
        }
      } catch {
        if (!cancelled && currentRequest === request) setValue(null);
      }
    };
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void reload(), 250);
    };
    const visible = () => { if (document.visibilityState === "visible") schedule(); };
    const channel = supabase.channel("tracking-streaks")
      .on("postgres_changes", { event: "*", schema: "public", table: "meal_log" }, schedule);
    void supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      if (data.session) await supabase.realtime.setAuth(data.session.access_token);
      if (!cancelled) channel.subscribe((status) => { if (status === "SUBSCRIBED") schedule(); });
    });
    const { data: auth } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) void supabase.realtime.setAuth(session.access_token);
    });
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("online", schedule);
    // Also crosses the 04:00 boundary if the app stays open overnight.
    const clock = setInterval(() => { if (localDay() !== loadedDay) visible(); }, 60_000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearInterval(clock);
      auth.subscription.unsubscribe();
      void supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("online", schedule);
    };
  }, []);

  const explanation = value
    ? `Flame: consecutive days with an entry, including today. Target: days this week, Monday to yesterday, that closed under ${value.kcal.toLocaleString("en-GB")} kcal and at or above ${value.protein}g protein. Days end at 04:00 London time.`
    : "Streaks are temporarily unavailable.";

  /*
    A pill, the height of the controls beside it, carrying two numbers with
    an icon each and no words.

    The flame is still a streak, because logging every day is a thing a
    person can actually keep up. The target is a count out of seven rather
    than a second streak: hitting a calorie ceiling *and* a protein floor
    every single day is not, and a consecutive count of it spends its life at
    zero, which reads as a reproach rather than a score. Out of seven, a hard
    Tuesday costs one day instead of everything.

    Both always show, zero included. The sentence behind the hover and the
    label carries the definitions.
  */
  if (!value) return null;
  return (
    <div
      className="surface flex h-9 shrink-0 items-center gap-2.5 px-3 text-sm font-semibold tabular-nums"
      style={{ borderRadius: 999 }}
      title={explanation}
      aria-label={`${value.logged} days logged in a row. ${value.week.onTarget} of 7 days on target this week. ${explanation}`}
    >
      <span className="flex items-center gap-1">
        <Flame className="size-4" style={{ color: "var(--ink-energy)" }} aria-hidden />
        {value.logged}
      </span>
      <span aria-hidden className="h-4 w-px bg-[var(--rule)]" />
      <span
        className="flex items-center gap-1"
        style={{ color: value.week.onTarget > 0 ? "var(--ink-protein)" : "var(--muted-foreground)" }}
      >
        <Target className="size-4" aria-hidden />
        {value.week.onTarget}
        <span className="text-xs font-medium text-muted-foreground">/7</span>
      </span>
    </div>
  );
}
