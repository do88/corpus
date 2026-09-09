import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * What the models have cost lately.
 *
 * The shaping happens in `ai_spend`, in SQL, so this cannot become the bug the
 * sister project shipped: rows read into JavaScript behind a limit, which
 * silently dropped the oldest days once the table outgrew it and reported a
 * smaller number without saying so.
 */

export type SpendByKind = {
  kind: string;
  calls: number;
  costMicros: number;
  /** Calls whose model had no price on file. */
  unpriced: number;
};

export type Spend = {
  windowDays: number;
  calls: number;
  costMicros: number;
  /**
   * How many of those calls could not be priced. Non-zero means `costMicros`
   * is a floor rather than a total, and whatever shows it has to say so.
   */
  unpriced: number;
  byKind: SpendByKind[];
};

/** Postgres counts and sums are bigint, which arrives over PostgREST as text. */
function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export async function getSpend(
  supabase: SupabaseClient,
  windowDays = 30,
): Promise<Spend> {
  const { data, error } = await supabase.rpc("ai_spend", { window_days: windowDays });
  if (error) throw new Error(`Could not read spend: ${error.message}`);

  const raw = (data ?? {}) as Record<string, unknown>;
  return {
    windowDays,
    calls: toNumber(raw.calls),
    costMicros: toNumber(raw.costMicros),
    unpriced: toNumber(raw.unpriced),
    byKind: Array.isArray(raw.byKind)
      ? (raw.byKind as Record<string, unknown>[]).map((row) => ({
          kind: String(row.kind ?? ""),
          calls: toNumber(row.calls),
          costMicros: toNumber(row.costMicros),
          unpriced: toNumber(row.unpriced),
        }))
      : [],
  };
}
