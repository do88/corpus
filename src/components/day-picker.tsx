"use client";

import { useEffect } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { addDays, format } from "date-fns";
import { parseDay, toDay } from "@/lib/time";
import Link, { useLinkStatus } from "next/link";
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
 * A tint on a day means something is logged, and its colour says how the
 * day went against the calorie goal: amber under it, red over it. Deliberately
 * not a number — the strip answers "which days went well", and the figure for
 * the selected day is right below it in full.
 *
 * Each day is a card, the same object as everything else on the screen, and
 * the whole card is the button. It used to be a 32px disc with a letter
 * floating above it: a small target in the middle of a larger, dead area,
 * and a shape nothing else in the app used. The arrows are cards too, full
 * height and in the foreground colour, because a grey chevron the size of a
 * letter was easy to miss entirely.
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
const ARROW = "surface tappable grid h-12 w-10 shrink-0 place-items-center text-foreground";

export function DayPicker({
  day,
  today,
  logged,
  earliest,
  kcalTarget,
  onPending,
}: {
  day: string;
  today: string;
  /** Calories logged per date, for the days that have any. */
  logged: Record<string, number>;
  /** The day's calorie goal: a logged day is tinted by which side of it it landed. */
  kcalTarget: number;
  /**
   * The first day ever logged. Days before it are not offered — there is
   * nothing behind them but empty weeks going back forever. Null on an empty
   * log, where only today exists.
   */
  earliest: string | null;
  /**
   * Told when a day is on its way, and when it has arrived or been abandoned.
   *
   * Changing the day changes only the search param, and `loading.tsx` answers
   * route changes, not those — so a tap on a disc produced nothing at all
   * until the new day's HTML landed. The disc itself now shows the wait (see
   * `DayDisc`); this lets the screen that owns the figures below dim them
   * too, so the whole page reads as "changing" rather than "stuck".
   */
  onPending?: (pending: boolean) => void;
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
    <div className="flex items-stretch gap-1.5">
      {/* Same rule as the forward arrow: a control with nowhere to go is not
          offered, rather than offered and refused. */}
      {atFloor ? (
        <span
          aria-disabled
          aria-label="Previous week"
          className={`${ARROW} opacity-35`}
        >
          <ChevronLeft className="size-5" strokeWidth={2.25} />
        </span>
      ) : (
        <Link
          href={href(lastWeek, today)}
          aria-label="Previous week"
          className={ARROW}
        >
          <ArrowIcon icon={ChevronLeft} onPending={onPending} />
        </Link>
      )}

      {/*
        Seven cards sharing the row equally. A logged day is filled in its own
        tint; today is ringed rather than filled, so "where I am" and "what I
        have done" never compete for the same visual.
      */}
      <div className="flex min-w-0 flex-1 gap-1.5">
        {week.map((date) => {
          const selected = date === day;
          const outOfRange = date > today || date < floor;
          const isToday = date === today;
          const hasLog = Boolean(logged[date]);
          const over = hasLog && logged[date] > kcalTarget;

          const label = (
            <DayDisc
              date={date}
              selected={selected}
              hasLog={hasLog}
              over={over}
              isToday={isToday}
              onPending={onPending}
            />
          );

          // The link is the card's full size, so the hit area is the whole
          // card rather than a disc somewhere inside it.
          const shared = "tappable flex min-w-0 flex-1";

          // A day you cannot go to is not a link. Rendering it as one and
          // refusing the click would still offer it to a keyboard and a
          // screen reader as somewhere to go.
          if (outOfRange) {
            return (
              <span key={date} aria-disabled className={`${shared} opacity-35`} aria-label={longDate(date)}>
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
        <span aria-disabled aria-label="Next week" className={`${ARROW} opacity-35`}>
          <ChevronRight className="size-5" strokeWidth={2.25} />
        </span>
      ) : (
        <Link
          href={href(nextWeek, today)}
          aria-label="Next week"
          className={ARROW}
        >
          <ArrowIcon icon={ChevronRight} onPending={onPending} />
        </Link>
      )}
    </div>
  );
}

/**
 * One day of the strip: a card holding the weekday and the date.
 *
 * Reads the link's own status, which is the only honest signal there is for
 * a search-param navigation. While the tap is in flight the disc takes the
 * selected look early and its number gives way to a spinner, so the thing
 * you pressed is the thing that answers — the same acknowledgement a tab
 * gives, in the same place your thumb already is.
 *
 * Outside a `<Link>` (the disabled days) `useLinkStatus` reports not pending,
 * so the same component serves both.
 */
function DayDisc({
  date,
  selected,
  hasLog,
  over,
  isToday,
  onPending,
}: {
  date: string;
  selected: boolean;
  hasLog: boolean;
  /** Logged, and past the calorie goal. */
  over: boolean;
  isToday: boolean;
  onPending?: (pending: boolean) => void;
}) {
  const { pending } = useLinkStatus();
  useReportPending(pending, onPending);

  const lit = selected || pending;

  /*
    Outlined, not filled. A logged day used to be a tinted card, and a week of
    them was a row of coloured blocks louder than the one thing the strip is
    for — which day you are on. Now each past day is the plain card with a ring
    in its colour, and the selected day is the only filled thing in the row.

    The rings are the full colour, not the 20–24% the fills used. A fill that
    faint still reads as a colour because it covers the card; a line a pixel
    and a half wide at that strength disappears, and a status shown only by a
    line needs 3:1 against the card to be seen at all. The shadow is restated
    after the ring because an inline box-shadow replaces the card's own.
  */
  const ring = (colour: string): React.CSSProperties => ({
    boxShadow: `inset 0 0 0 1.5px ${colour}, var(--shadow-card)`,
  });
  const style: React.CSSProperties = lit
    ? {
        background: "linear-gradient(to bottom, var(--accent-protein), var(--ink-protein))",
        color: "oklch(0.99 0 0)",
        boxShadow:
          "0 4px 12px color-mix(in oklch, var(--ink-protein) 35%, transparent), inset 0 1px 0 oklch(1 0 0 / 0.18)",
      }
    : over
      ? // Past the goal: the same red the calorie line turns, so the strip and
        // the card agree about what a bad day looks like.
        ring("var(--destructive)")
      : hasLog
        ? ring("var(--accent-energy)")
        : isToday
          ? ring("color-mix(in oklch, var(--ink-protein) 55%, transparent)")
          : {};

  /*
    `before:hidden` drops the card's specular edge. On a white card it reads
    as light catching the top; over a tint or the selected blue it was a
    near-opaque white stripe, which is a line, not a highlight. The selected
    day keeps a faint inset edge of its own instead.
  */
  return (
    <span
      className="surface flex h-12 w-full flex-col items-center justify-center gap-0.5 transition-colors before:hidden"
      style={style}
    >
      {/* Two letters, not one: "T" and "S" each named two days of the week. */}
      <span
        className="text-[0.8125rem] font-medium leading-none tracking-[0.02em]"
        style={{ color: lit ? "oklch(0.99 0 0 / 0.85)" : "var(--muted-foreground)" }}
      >
        {format(parseDay(date), "EEEEEE")}
      </span>
      {/*
        A spinner where the number was while the day loads. The card already
        lights the moment it is pressed, so the thing you tapped is the thing
        that answers.
      */}
      <span className="text-[1.0625rem] font-semibold leading-none tabular-nums">
        {pending && !selected ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          Number(date.slice(8))
        )}
      </span>
    </span>
  );
}

/** A week arrow that becomes a spinner while its navigation is in flight. */
function ArrowIcon({
  icon: Icon,
  onPending,
}: {
  icon: typeof ChevronLeft;
  onPending?: (pending: boolean) => void;
}) {
  const { pending } = useLinkStatus();
  useReportPending(pending, onPending);
  return pending ? (
    <Loader2 className="size-5 animate-spin" />
  ) : (
    <Icon className="size-5" strokeWidth={2.25} />
  );
}

/**
 * Tell the parent while this link is pending, and take it back when it is
 * not — including when the link unmounts mid-flight, which is what happens
 * to a week arrow once the next week's strip replaces this one.
 */
function useReportPending(pending: boolean, onPending?: (pending: boolean) => void) {
  useEffect(() => {
    if (!pending) return;
    onPending?.(true);
    return () => onPending?.(false);
  }, [pending, onPending]);
}

/** Today is the bare route; any other day carries it in the URL. */
function href(date: string, today: string) {
  return date === today ? "/" : `/?d=${date}`;
}

function longDate(date: string) {
  return format(parseDay(date), "EEEE d MMMM");
}


