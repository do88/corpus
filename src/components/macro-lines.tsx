/**
 * The day's four numbers as lines, each saying what is left.
 *
 * They were two ring cards and a quiet line for the other two. A ring is a
 * shape you interpret — three-quarters full, is that good? — and it carries
 * the number *eaten*, when the question you open the app with is the other
 * one: how much is left. The Advisor already answered that in words, "1,083
 * left", and it was the easiest figure in the app to scan. So every screen
 * now says it that way, four times, with a bar underneath that shows the
 * same thing as a length.
 *
 * The right-hand figure is the one that matters, so it is the heavy one.
 * What has been eaten and the target sit beside the label in the small
 * voice, for when the gap needs checking against its parts.
 *
 * Calories are the only ceiling, and the only line that turns red past its
 * target. Protein is a floor — past it is the day that went well — and carbs
 * and fat are what the calorie budget had left, so those three simply report
 * "met" or "over" in the same muted voice as everything else.
 *
 * Two tiers inside the card. Calories and protein are the day's targets and
 * get a full row each. Carbs, fat and fibre "need only be reasonable", in
 * the estimator's own words, and share one row of three beneath — five full
 * rows pushed the first meal off a phone screen for three numbers that are
 * rarely the reason you opened the app.
 *
 * Fibre before tracking existed is unknown, not zero, and the strict total
 * is null for such a day so the advisor never treats a partial sum as the
 * whole. The card shows what *is* known and says how many meals were not
 * counted, which is more use than the word "unknown" against an empty bar.
 *
 * Two densities. `full` is Today and Progress. `compact` is the Advisor:
 * one line each, small, because there the numbers are context for a
 * question rather than the point of the screen.
 */

type Figures = {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  /** Null when any meal of the day has no fibre figure. */
  fiber_g?: number | null;
  /** The fibre that is known, and how many meals were not counted. */
  fiber_known_g?: number;
  fiber_missing?: number;
};
type Macro = "kcal" | "protein_g" | "carbs_g" | "fat_g" | "fiber_g";
/** Every target is known, fibre included; only the eaten figure can be unknown. */
type Targets = Record<Macro, number>;

/** Per-line text overrides, for a screen where "left" is the wrong word (averages). */
export type LineText = {
  /** Replaces the heavy right-hand figure. */
  lead?: string;
  /** Replaces the small "eaten / target unit" beside the label. */
  detail?: string;
};

const LINES: { macro: Macro; label: string; unit: string; metric: string; ceiling: boolean }[] = [
  { macro: "kcal", label: "Calories", unit: "kcal", metric: "energy", ceiling: true },
  { macro: "protein_g", label: "Protein", unit: "g", metric: "protein", ceiling: false },
  { macro: "carbs_g", label: "Carbs", unit: "g", metric: "water", ceiling: false },
  { macro: "fat_g", label: "Fat", unit: "g", metric: "weight", ceiling: false },
  { macro: "fiber_g", label: "Fibre", unit: "g", metric: "fibre", ceiling: false },
];

const n = (value: number) => value.toLocaleString("en-GB");

/** "1,083 left", "120 over" or "met": the gap in the unit you would act on. */
function leadFor(value: number, target: number, unit: string, ceiling: boolean): string {
  const gap = target - value;
  const suffix = unit === "kcal" ? "" : unit;
  if (gap > 0) return `${n(gap)}${suffix} left`;
  if (gap === 0) return ceiling ? "at your ceiling" : "met";
  return ceiling ? `${n(-gap)} over` : `met · ${n(-gap)}${suffix} over`;
}

export function MacroLines({
  values,
  targets,
  variant = "full",
  text,
}: {
  values: Figures;
  targets: Targets;
  variant?: "full" | "compact";
  text?: Partial<Record<Macro, LineText>>;
}) {
  const rows = LINES.map((line) => {
    const partial = line.macro === "fiber_g" && values.fiber_g == null;
    const value = partial ? (values.fiber_known_g ?? 0) : (values[line.macro] ?? 0);
    const target = targets[line.macro];
    const over = target > 0 && value > target;
    const alarmed = over && line.ceiling;
    const fraction = target > 0 ? Math.min(value / target, 1) : 0;
    const missing = values.fiber_missing ?? 0;
    const detail = partial
      ? `${n(value)} / ${n(target)} g · ${missing > 0 ? `${missing} meal${missing === 1 ? "" : "s"} not counted` : "not counted"}`
      : `${n(value)} / ${n(target)}${line.unit === "kcal" ? " kcal" : " g"}`;
    return {
      ...line,
      value,
      target,
      alarmed,
      fraction,
      lead: text?.[line.macro]?.lead ?? leadFor(value, target, line.unit, line.ceiling),
      detail: text?.[line.macro]?.detail ?? detail,
      fill: alarmed ? "var(--destructive)" : `var(--accent-${line.metric})`,
      ink: `var(--ink-${line.metric})`,
    };
  });
  const primary = rows.filter((row) => row.macro === "kcal" || row.macro === "protein_g");
  const secondary = rows.filter((row) => !primary.includes(row));

  if (variant === "compact") {
    return (
      <dl className="space-y-2">
        {rows.map((row) => (
          <div key={row.macro} className="grid grid-cols-[4rem_1fr_auto] items-center gap-3">
            <dt className="text-xs font-medium" style={{ color: row.ink }}>
              {row.label}
            </dt>
            <dd className="m-0">
              <Track fraction={row.fraction} fill={row.fill} height={6} label={`${row.label}: ${row.detail}`} />
            </dd>
            <dd
              className="m-0 min-w-[5.5rem] text-right text-xs font-medium tabular-nums"
              style={{ color: row.alarmed ? "var(--destructive)" : undefined }}
            >
              {row.lead}
            </dd>
          </div>
        ))}
      </dl>
    );
  }

  return (
    <dl className="surface space-y-3.5 p-4.5">
      {primary.map((row) => (
        <div key={row.macro}>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="flex min-w-0 flex-wrap items-baseline gap-x-2">
              <span className="text-[1rem] font-semibold tracking-[-0.01em]" style={{ color: row.ink }}>
                {row.label}
              </span>
              <span className="text-xs tabular-nums text-muted-foreground">{row.detail}</span>
            </dt>
            <dd
              className="m-0 shrink-0 text-[1rem] font-semibold tabular-nums"
              style={{ color: row.alarmed ? "var(--destructive)" : undefined }}
            >
              {row.lead}
            </dd>
          </div>
          <dd className="m-0 mt-1.5">
            <Track fraction={row.fraction} fill={row.fill} height={8} label={`${row.label}: ${row.detail}`} />
          </dd>
        </div>
      ))}

      {/* The three that need only be reasonable, side by side and smaller.
          The eaten/target detail moves into the hover and the label, so a
          third of a phone's width holds a name and a figure comfortably. */}
      <div className="grid grid-cols-3 gap-3 border-t border-[var(--rule)]/60 pt-3.5">
        {secondary.map((row) => (
          <div key={row.macro} title={`${row.label}: ${row.detail}`}>
            <dt className="text-xs font-medium" style={{ color: row.ink }}>
              {row.label}
            </dt>
            <dd className="m-0 mt-0.5 truncate text-sm font-semibold tabular-nums">{row.lead}</dd>
            <dd className="m-0 mt-1.5">
              <Track fraction={row.fraction} fill={row.fill} height={5} label={`${row.label}: ${row.detail}`} />
            </dd>
          </div>
        ))}
      </div>
    </dl>
  );
}

/**
 * The bar. Fill grows from the left; the track is the rule colour, thinned,
 * so it reads as a groove in the card rather than a second object. A ceiling
 * that has been passed is drawn full and red, not overflowing — the figure
 * beside it says by how much.
 */
function Track({
  fraction,
  fill,
  height,
  label,
}: {
  fraction: number;
  fill: string;
  height: number;
  label: string;
}) {
  return (
    <div
      role="img"
      aria-label={label}
      className="w-full overflow-hidden rounded-full"
      style={{ height, background: "color-mix(in oklch, var(--rule) 55%, transparent)" }}
    >
      <div
        className="h-full rounded-full transition-[width] duration-300"
        style={{ width: `${Math.round(fraction * 1000) / 10}%`, background: fill }}
      />
    </div>
  );
}
