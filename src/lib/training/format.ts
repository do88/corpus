/** Pure display formatters. No data access, no domain rules. */

export function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  });
}

/** Garmin pace is seconds per kilometre. */
export function fmtPace(secPerKm: number | null | undefined): string {
  if (!secPerKm) return "—";
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")}/km`;
}

export function fmtKg(v: number | null | undefined): string {
  return v == null ? "—" : `${v} kg`;
}

export function fmtKcal(v: number | null | undefined): string {
  return v == null ? "—" : `${Math.round(v).toLocaleString()} kcal`;
}

export function fmtMinutes(v: number | null | undefined): string {
  return v == null ? "—" : `${Math.round(v)} min`;
}

/** Axis ticks stay terse; tooltips get the long form from the pairs below. */
export const shortMonth = (m: string) => m.slice(2);

/** "2026-08" → "August 2026" */
export function longMonth(m: string): string {
  return new Date(`${m}-01T00:00:00`).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
}

/** "2026-06-01" → "1 Jun" for an axis tick */
export function shortDay(d: string): string {
  return new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

/** "2026-06-01" → "Week of 1 June 2026" */
export function weekOf(d: string): string {
  return `Week of ${new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })}`;
}

/** "2026-08-07" → "7 August 2026" */
export function longDate(d: string): string {
  return new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** "2026-Q3" → "Q3 2026" */
export const longQuarter = (p: string) => {
  const [year, q] = p.split("-");
  return `${q} ${year}`;
};

export const titleCase = (s: string) =>
  s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
