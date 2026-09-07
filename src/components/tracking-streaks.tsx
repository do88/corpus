"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { calculateStreaks, loadStreakMeals } from "@/lib/meals/streaks";
import { loadTargets } from "@/lib/meals/load-targets";
import { localDay } from "@/lib/time";

export type StreakDisplay = { logged: number; onTarget: number; kcal: number; protein: number };

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
    ? `Logged: consecutive days with an entry, including today. On target: consecutive completed days under ${value.kcal.toLocaleString("en-GB")} kcal and at least ${value.protein}g protein, through yesterday. Days end at 04:00 London time. Based on recorded meals and current targets.`
    : "Streaks are temporarily unavailable.";
  return (
    <div className="surface flex h-10 shrink-0 flex-col justify-center rounded-2xl px-2 text-[10px] leading-4" title={explanation}
      aria-label={value ? `${value.logged} day logging streak. ${value.onTarget} day on-target streak. ${explanation}` : explanation}>
      <span className="flex justify-between gap-2">Logged <strong className="tabular-nums">{value?.logged ?? "—"}</strong></span>
      <span className="flex justify-between gap-2" style={{ color: "var(--ink-protein)" }}>On target <strong className="tabular-nums">{value?.onTarget ?? "—"}</strong></span>
    </div>
  );
}
