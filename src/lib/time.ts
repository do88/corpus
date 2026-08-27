import { TZDate } from "@date-fns/tz";
import { format, subDays } from "date-fns";

/**
 * One clock for the whole app.
 *
 * Every date in this app is a *London* date. The zone is fixed rather than
 * read from the device because the database decides which day a meal belongs
 * to, and the two have to agree — a phone in another timezone must not file a
 * meal under a different day than the row it just wrote.
 *
 * The zone and the 04:00 boundary are named once, here, so the rule exists in
 * one place on this side of the wire and one place in the schema, rather than
 * being re-derived by each caller with its own arithmetic.
 */
export const ZONE = "Europe/London";

/** A moment, read as London wall clock. */
export function inZone(at: Date = new Date()): TZDate {
  return new TZDate(at, ZONE);
}

/**
 * The day a moment counts toward, with the boundary at 04:00 — a meal at 1am
 * counts toward the night before.
 *
 * Mirrors `local_day()` in migration ...818:
 *
 *     ((ts at time zone 'Europe/London') - interval '4 hours')::date
 *
 * The order in that expression is the whole subtlety, and the previous version
 * of this function had it backwards. Postgres converts to London wall clock
 * *first* and subtracts four hours *from the wall clock*; subtracting four
 * hours of absolute time and converting afterwards is a different calculation,
 * and the two disagree on the mornings the clocks change. Verified against the
 * database across both 2026/2027 transitions: 144 instants, no disagreement.
 *
 * Testing the wall-clock hour is the same thing said plainly — before 04:00 the
 * meal belongs to yesterday — and it cannot drift back into absolute
 * arithmetic, which is what `subHours` on a zoned date silently does.
 */
export function localDay(at: Date = new Date()): string {
  const london = inZone(at);
  return format(london.getHours() < 4 ? subDays(london, 1) : london, "yyyy-MM-dd");
}

/** A plain `yyyy-MM-dd` as a date anchored in London, for calendar maths. */
export function parseDay(day: string): TZDate {
  return new TZDate(`${day}T00:00:00`, ZONE);
}

/** A date back to `yyyy-MM-dd`. */
export function toDay(date: Date): string {
  return format(date, "yyyy-MM-dd");
}
