"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, format } from "date-fns";
import { parseDay, toDay } from "@/lib/time";
import Link from "next/link";
import { weekOf } from "@/lib/meals/repository";

/**
 * Move between days.
 *
 * A week strip, and only a week strip. On a phone you are almost always
 * looking at today or the last few days, and seven taps beat a grid of
 * thirty-one.
 *
 * There used to be a month grid behind a popover for the rarer case of
 * jumping back. It went: it was the wrong tool for how this is actually used,
 * and it was the only reason react-day-picker was in the bundle at all. The
 * way back to today it was standing in front of now lives in the header,
 * beside the date it returns you from.
 *
 * Navigation is bounded at both ends. Forward stops at today, which has not
 * finished; backward stops at the first day ever logged, because behind that
 * there is nothing but empty weeks going back forever.
 *
 * A tint under a day means something is logged. Deliberately not a number: the
 * strip answers "which days have I tracked", and the figure for the selected
 * day is right below it in full.
 */
/**
 * The chevrons either side of the strip.
 *
 * Declared above the component, not below it. Below, the production build was
 * fine — module evaluation finishes long before React renders anything — but
 * Fast Refresh re-evaluates the module and can reach the component while a
 * `const` further down is still in its temporal dead zone, which is a runtime
 * ReferenceError in development and nowhere else.
 */
const ARROW = "tappable grid size-8 shrink-0 place-items-center rounded-full";

export function DayPicker({
  day,
  today,
  logged,
  earliest,
}: {
  day: string;
  today: string;
  /** Dates with at least one analysed meal. */
  logged: Record<string, number>;
  /**
   * The first day ever logged. Days before it are not offered — there is
   * nothing behind them but empty weeks going back forever. Null on an empty
   * log, where only today exists.
   */
  earliest: string | null;
}) {
  const week = weekOf(day);

  // A week either side. Computed at render, so these are links as well —
  // "a week back" is a fixed destination, not an action.
  const lastWeek = toDay(addDays(parseDay(day), -7));
  const nextWeek = toDay(addDays(parseDay(day), 7));

  // Nothing behind the first entry but empty weeks, so the strip stops there.
  const floor = earliest ?? today;
  const atFloor = week[0] <= floor;

  return (
    // The chevrons flank the strip rather than sitting in a bar above it. The
    // separate nav row duplicated what the discs already say, and two rows of
    // date chrome above the day's actual figures is one row too many.
    <div className="flex items-center gap-0.5">
      {/* Same rule as the forward arrow: a control with nowhere to go is not
          offered, rather than offered and refused. */}
      {atFloor ? (
        <span
          aria-disabled
          aria-label="Previous week"
          className={`${ARROW} text-muted-foreground opacity-25`}
        >
          <ChevronLeft className="size-4" />
        </span>
      ) : (
        <Link
          href={href(lastWeek, today)}
          aria-label="Previous week"
          className={`${ARROW} text-muted-foreground`}
        >
          <ChevronLeft className="size-4" />
        </Link>
      )}

      {/*
        A day is a disc, not a cell — the shape iOS uses for dates, and it gives
        the selected state somewhere solid to live. A logged day is filled in
        its own tint; today is ringed rather than filled, so "where I am" and
        "what I have done" never compete for the same visual.
      */}
      <div className="grid min-w-0 flex-1 grid-cols-7 gap-0.5">
        {week.map((date) => {
          const selected = date === day;
          const outOfRange = date > today || date < floor;
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
          if (outOfRange) {
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
              aria-current={selected ? "date" : undefined}
              aria-label={longDate(date)}
              className={shared}
            >
              {label}
            </Link>
          );
        })}
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
          aria-label="Next week"
          className={`${ARROW} text-muted-foreground`}
        >
          <ChevronRight className="size-4" />
        </Link>
      )}
    </div>
  );
}

/** Today is the bare route; any other day carries it in the URL. */
function href(date: string, today: string) {
  return date === today ? "/" : `/?d=${date}`;
}

function longDate(date: string) {
  return format(parseDay(date), "EEEE d MMMM");
}


