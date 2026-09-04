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
 * Two densities. `full` is Today and Progress, a card with a row per figure.
 * `compact` is the Advisor: one line each, small, because there the numbers
 * are context for a question rather than the point of the screen.
 */

type Figures = { kcal: number; protein_g: number; carbs_g: number; fat_g: number };
type Macro = keyof Figures;

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
  targets: Figures;
  variant?: "full" | "compact";
  text?: Partial<Record<Macro, LineText>>;
}) {
  const rows = LINES.map((line) => {
    const value = values[line.macro];
    const target = targets[line.macro];
    const over = target > 0 && value > target;
    const alarmed = over && line.ceiling;
    const fraction = target > 0 ? Math.min(value / target, 1) : 0;
    return {
      ...line,
      value,
      target,
      alarmed,
      fraction,
      lead: text?.[line.macro]?.lead ?? leadFor(value, target, line.unit, line.ceiling),
      detail:
        text?.[line.macro]?.detail ??
        `${n(value)} / ${n(target)}${line.unit === "kcal" ? " kcal" : " g"}`,
      fill: alarmed ? "var(--destructive)" : `var(--accent-${line.metric})`,
      ink: `var(--ink-${line.metric})`,
    };
  });

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
      {rows.map((row) => (
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
