"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { addDays, format, subDays } from "date-fns";
import { ZONE, parseDay, toDay } from "@/lib/time";
import Link from "next/link";
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

  // A week either side. Computed at render, so these are links as well —
  // "a week back" is a fixed destination, not an action.
  const lastWeek = toDay(addDays(parseDay(day), -7));
  const nextWeek = toDay(addDays(parseDay(day), 7));

  return (
    // The chevrons flank the strip rather than sitting in a bar above it. The
    // separate nav row duplicated what the discs already say, and two rows of
    // date chrome above the day's actual figures is one row too many.
    <div className="flex items-center gap-0.5">
      <Link
        href={href(lastWeek, today)}
        transitionTypes={["day-back"]}
        aria-label="Previous week"
        className={`${ARROW} text-muted-foreground`}
      >
        <ChevronLeft className="size-4" />
      </Link>

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
              // The calendar is told the zone rather than being handed dates
              // pinned to UTC noon: it does that anchoring itself, correctly,
              // and hand-anchoring on top of it was two workarounds stacked.
              timeZone={ZONE}
              selected={parseDay(day)}
              defaultMonth={parseDay(day)}
              disabled={{ after: parseDay(today) }}
              onSelect={(date) => date && router.push(href(toDay(date), today))}
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

          const label = (
            <>
              <span className="text-[0.8125rem] font-medium uppercase tracking-[0.06em] text-muted-foreground">
                {format(parseDay(date), "EEEEE")}
              </span>

              <span
                className="grid size-9 place-items-center rounded-full text-[1rem] font-semibold tabular-nums transition-colors"
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
            </>
          );

          const shared = "tappable flex flex-col items-center gap-1 py-0.5";

          // A day you cannot go to is not a link. Rendering it as one and
          // refusing the click would still offer it to a keyboard and a
          // screen reader as somewhere to go.
          if (future) {
            return (
              <span key={date} aria-disabled className={`${shared} opacity-25`} aria-label={longDate(date)}>
                {label}
              </span>
            );
          }

          return (
            <Link
              key={date}
              href={href(date, today)}
              // Prefetched, because it is a link. These used to be buttons
              // calling `router.push`, which Next cannot see ahead of time —
              // so every day change was a cold round trip, measured at 803ms
              // against a 1ms local database.
              //
              // An ordered sequence, so direction means something here in a
              // way it does not between tabs: later days arrive from the
              // right, earlier ones from the left.
              transitionTypes={[date > day ? "day-forward" : "day-back"]}
              aria-current={selected ? "date" : undefined}
              aria-label={longDate(date)}
              className={shared}
            >
              {label}
            </Link>
          );
        })}
        </div>
      </div>

      {/*
        There is no week after this one while you are in it, so the forward
        arrow becomes a span rather than a link that goes nowhere — the same
        rule the future day discs follow.
      */}
      {week[6] >= today ? (
        <span aria-disabled aria-label="Next week" className={`${ARROW} text-muted-foreground opacity-25`}>
          <ChevronRight className="size-4" />
        </span>
      ) : (
        <Link
          href={href(nextWeek, today)}
          transitionTypes={["day-forward"]}
          aria-label="Next week"
          className={`${ARROW} text-muted-foreground`}
        >
          <ChevronRight className="size-4" />
        </Link>
      )}
    </div>
  );
}

/** The chevrons either side of the strip. */
const ARROW = "tappable grid size-8 shrink-0 place-items-center rounded-full";

/** Today is the bare route; any other day carries it in the URL. */
function href(date: string, today: string) {
  return date === today ? "/" : `/?d=${date}`;
}

function longDate(date: string) {
  return format(parseDay(date), "EEEE d MMMM");
}


function formatHeading(day: string, today: string) {
  if (day === today) return "Today";
  if (day === toDay(subDays(parseDay(today), 1))) return "Yesterday";
  return longDate(day);
}
