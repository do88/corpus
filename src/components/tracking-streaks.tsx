"use client";

import { useEffect, useState } from "react";
import { Flame } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { calculateStreaks, loadStreakMeals } from "@/lib/meals/streaks";
import { localDay } from "@/lib/time";

export type StreakDisplay = {
  /** Consecutive days with an entry, including today. */
  logged: number;
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
        const meals = await loadStreakMeals(supabase, today);
        if (!cancelled && currentRequest === request) {
          loadedDay = today;
          setValue(calculateStreaks(meals, today));
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
    ? "Consecutive days with something logged, including today. Days end at 04:00 London time."
    : "The streak is temporarily unavailable.";

  /*
    One number, which is the one a person can actually keep up.

    There were two: the flame, and a count of days this week that closed under
    the calorie ceiling *and* over the protein floor. The second was honest and
    nobody wanted to look at it — hitting both every day is hard enough that
    the figure mostly reported a shortfall, in the corner of every screen, all
    day. A streak is a thing you are pleased to see. That was not one.
  */
  if (!value) return null;
  return (
    <div
      className="surface flex h-9 shrink-0 items-center gap-1 px-3 text-sm font-semibold tabular-nums"
      style={{ borderRadius: 999 }}
      title={explanation}
      aria-label={`${value.logged} days logged in a row. ${explanation}`}
    >
      <Flame className="size-4" style={{ color: "var(--ink-energy)" }} aria-hidden />
      {value.logged}
    </div>
  );
}
