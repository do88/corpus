import { format } from "date-fns";
import { parseDay } from "../time";

/**
 * Pure display formatters. No data access, no domain rules.
 *
 * Dates arrive as plain `yyyy-MM-dd` and are parsed in the app's zone rather
 * than the device's. `new Date("2026-06-01T00:00:00")` is midnight *wherever
 * the reader happens to be*, which in a negative-offset zone is the previous
 * evening — so the label could disagree with the date it was made from.
 */

/** Garmin pace is seconds per kilometre. */
export function fmtPace(secPerKm: number | null | undefined): string {
  if (!secPerKm) return "—";
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")}/km`;
}

/** "2026-06-01" → "1 Jun" for an axis tick */
export function shortDay(d: string): string {
  return format(parseDay(d), "d MMM");
}

/** "2026-06-01" → "Week of 1 June 2026" */
export function weekOf(d: string): string {
  return `Week of ${format(parseDay(d), "d MMMM yyyy")}`;
}

/** "2026-08-07" → "7 August 2026" */
export function longDate(d: string): string {
  return format(parseDay(d), "d MMMM yyyy");
}

/** "2026-Q3" → "Q3 2026" */
export const longQuarter = (p: string) => {
  const [year, q] = p.split("-");
  return `${q} ${year}`;
};

