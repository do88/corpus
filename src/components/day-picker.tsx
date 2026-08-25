"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { weekOf } from "@/lib/meals/repository";

/**
 * The month grid, loaded when it is opened rather than with the page.
 *
 * react-day-picker and its date-fns dependencies were landing on the logging
 * screen — the one that has to be fast, on a phone, possibly on no signal — to
 * serve a popover that most sessions never open. The week strip below needs
 * none of it.
 */
const Calendar = dynamic(() => import("@/components/ui/calendar").then((m) => m.Calendar), {
  ssr: false,
  loading: () => <div className="h-72 w-64 animate-pulse bg-muted/40" />,
});

/**
 * Move between days.
 *
 * A week strip rather than a month grid: on a phone you are almost always
 * looking at today or the last few days, and seven taps beat a grid of
 * thirty-one. The full calendar is one tap away for the rarer case of jumping
 * back — react-day-picker via shadcn, rather than a hand-built grid, because
 * keyboard navigation and locale-correct week starts are exactly the sort of
 * thing that looks easy and is not.
 *
 * A dot under a day means something is logged. Deliberately not a number: the
 * strip answers "which days have I tracked", and the figure for the selected
 * day is right below it in full.
 */
export function DayPicker({
  day,
  today,
  logged,
}: {
  day: string;
  today: string;
  /** Dates with at least one analysed meal. */
  logged: Record<string, number>;
}) {
  const router = useRouter();
  const week = weekOf(day);

  const go = (date: string) => router.push(date === today ? "/" : `/?d=${date}`);

  const shift = (days: number) => {
    const d = new Date(`${day}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    go(d.toISOString().slice(0, 10));
  };

  return (
    // The chevrons flank the strip rather than sitting in a bar above it. The
    // separate nav row duplicated what the discs already say, and two rows of
    // date chrome above the day's actual figures is one row too many.
    <div className="flex items-center gap-0.5">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => shift(-7)}
        aria-label="Previous week"
        className="tappable size-8 shrink-0 rounded-full text-muted-foreground"
      >
        <ChevronLeft className="size-4" />
      </Button>

      <div className="min-w-0 flex-1">
        <Popover>
          <PopoverTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                className="mx-auto mb-0.5 flex h-6 gap-1.5 rounded-full px-2 text-xs font-medium text-muted-foreground"
              >
                <CalendarDays className="size-3.5" aria-hidden />
                {formatHeading(day, today)}
              </Button>
            }
          />
          <PopoverContent className="w-auto p-0" align="center">
            <Calendar
              mode="single"
              required
              selected={new Date(`${day}T12:00:00Z`)}
              defaultMonth={new Date(`${day}T12:00:00Z`)}
              disabled={{ after: new Date(`${today}T12:00:00Z`) }}
              onSelect={(date) => date && go(toISODate(date))}
            />
          </PopoverContent>
        </Popover>

      {/*
        A day is a disc, not a cell — the shape iOS uses for dates, and it gives
        the selected state somewhere solid to live. A logged day is filled in
        its own tint; today is ringed rather than filled, so "where I am" and
        "what I have done" never compete for the same visual.
      */}
        <div className="grid grid-cols-7 gap-0.5">
        {week.map((date) => {
          const selected = date === day;
          const future = date > today;
          const isToday = date === today;
          const hasLog = Boolean(logged[date]);

          return (
            <button
              key={date}
              type="button"
              disabled={future}
              onClick={() => go(date)}
              aria-current={selected ? "date" : undefined}
              aria-label={longDate(date)}
              className="tappable flex flex-col items-center gap-1 py-0.5 disabled:opacity-25"
            >
              <span className="text-[0.6875rem] font-medium uppercase tracking-[0.06em] text-muted-foreground">
                {WEEKDAY.format(new Date(`${date}T12:00:00Z`)).charAt(0)}
              </span>

              <span
                className="grid size-9 place-items-center rounded-full text-[0.9375rem] font-semibold tabular-nums transition-colors"
                style={
                  selected
                    ? {
                        background:
                          "linear-gradient(to bottom, var(--accent-protein), var(--ink-protein))",
                        color: "oklch(0.99 0 0)",
                        boxShadow:
                          "0 2px 6px color-mix(in oklch, var(--ink-protein) 40%, transparent), inset 0 1px 0 oklch(1 0 0 / 0.28)",
                      }
                    : hasLog
                      ? { background: "color-mix(in oklch, var(--accent-protein) 16%, transparent)", color: "var(--ink-protein)" }
                      : isToday
                        ? { boxShadow: "inset 0 0 0 1.5px var(--rule)" }
                        : undefined
                }
              >
                {Number(date.slice(8))}
              </span>
            </button>
          );
        })}
        </div>
      </div>

      <Button
        variant="ghost"
        size="icon"
        onClick={() => shift(7)}
        disabled={week[0] > today}
        aria-label="Next week"
        className="tappable size-8 shrink-0 rounded-full text-muted-foreground"
      >
        <ChevronRight className="size-4" />
      </Button>
    </div>
  );
}

const WEEKDAY = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" });
const LONG = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

function longDate(date: string) {
  return LONG.format(new Date(`${date}T12:00:00Z`));
}

/** Local dates are plain YYYY-MM-DD; going via toISOString would shift them. */
function toISODate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function formatHeading(day: string, today: string) {
  if (day === today) return "Today";
  const yesterday = new Date(`${today}T12:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  if (day === yesterday.toISOString().slice(0, 10)) return "Yesterday";
  return longDate(day);
}
