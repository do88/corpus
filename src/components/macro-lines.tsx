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
 * the estimator's own words, and take a lighter treatment beneath.
 *
 * Those three sit three-across only from `lg`, which is the first width at
 * which the column stops being 448px — three of them in 448 gave each about
 * 130px, and a label, a figure and a bar in 130px is a thing you decipher
 * rather than scan. Below that they are stacked rows: same shape as the two
 * above, smaller type and a thinner bar, so the hierarchy is carried by
 * weight rather than by cramming.
 *
 * Fibre is off by default, and shown only where `showFibre` asks for it.
 * The app records it — the estimator returns it in the same call, so it costs
 * nothing — but it is not a target you are held to, and it was the least
 * trustworthy figure on the screen: calories and protein can be read off a
 * label, fibre is usually inferred. A day's total is also null the moment one
 * meal lacks a figure, and the saved foods that carry the fast logging path
 * have none, so the line spent a row saying it did not know. Progress shows
 * it as an average across days, where one missing meal does not void it.
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
  showFibre = false,
  text,
}: {
  values: Figures;
  targets: Targets;
  variant?: "full" | "compact";
  /** Progress only. See the note above. */
  showFibre?: boolean;
  text?: Partial<Record<Macro, LineText>>;
}) {
  const rows = LINES.filter((line) => line.macro !== "fiber_g" || showFibre).map((line) => {
    const value = values[line.macro] ?? 0;
    const target = targets[line.macro];
    const over = target > 0 && value > target;
    const alarmed = over && line.ceiling;
    const fraction = target > 0 ? Math.min(value / target, 1) : 0;
    const detail = `${n(value)} / ${n(target)}${line.unit === "kcal" ? " kcal" : " g"}`;
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

      {/* Stacked rows on a phone, three across once the column widens. */}
      <div className="grid gap-3 border-t border-[var(--rule)]/60 pt-3.5 lg:grid-cols-3">
        {secondary.map((row) => (
          <div key={row.macro} title={`${row.label}: ${row.detail}`}>
            <div className="flex items-baseline justify-between gap-3 lg:block">
              <dt className="flex min-w-0 items-baseline gap-2">
                <span className="text-xs font-medium" style={{ color: row.ink }}>
                  {row.label}
                </span>
                {/* Room for the parts on a phone; three across there is not. */}
                <span className="truncate text-xs tabular-nums text-muted-foreground lg:hidden">
                  {row.detail}
                </span>
              </dt>
              <dd className="m-0 shrink-0 text-sm font-semibold tabular-nums lg:mt-0.5 lg:truncate">
                {row.lead}
              </dd>
            </div>
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
