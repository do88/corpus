"use client";

import { useRouter } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { weekOf } from "@/lib/meals/repository";

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
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="icon" onClick={() => shift(-7)} aria-label="Previous week">
          <ChevronLeft className="size-4" />
        </Button>

        <Popover>
          <PopoverTrigger
            render={
              <Button variant="ghost" size="sm" className="gap-2 font-medium">
                <CalendarDays className="size-4" aria-hidden />
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

        <Button
          variant="ghost"
          size="icon"
          onClick={() => shift(7)}
          disabled={week[0] > today}
          aria-label="Next week"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {week.map((date) => {
          const selected = date === day;
          const future = date > today;
          return (
            <button
              key={date}
              type="button"
              disabled={future}
              onClick={() => go(date)}
              aria-current={selected ? "date" : undefined}
              aria-label={longDate(date)}
              className={`flex flex-col items-center gap-1 rounded-md py-2 text-xs transition-colors disabled:opacity-30 ${
                selected
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              <span>{WEEKDAY.format(new Date(`${date}T12:00:00Z`)).charAt(0)}</span>
              <span className="text-sm font-medium tabular-nums">{Number(date.slice(8))}</span>
              <span
                aria-hidden
                className={`size-1 rounded-full ${
                  logged[date]
                    ? selected
                      ? "bg-primary-foreground"
                      : "bg-foreground"
                    : "bg-transparent"
                }`}
              />
            </button>
          );
        })}
      </div>
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
