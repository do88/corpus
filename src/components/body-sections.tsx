import { format, parseISO } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AreaTrend } from "./charts-lazy";
import { MusclesPanel } from "./muscles-panel";
import type { DashboardData } from "@/lib/training/dashboard";
import type { StrengthMeter } from "@/lib/training/strength";

/**
 * Body: what the log, the scale and the watch say, one section per thing
 * worth knowing.
 *
 * A **server** component. Every number was decided in `dashboard.ts`; this
 * lays out what it was handed. The weight chart sits behind `charts-lazy`,
 * which is the only client boundary besides the figure.
 *
 * Trimmed twice, on purpose. The first pass took out a sentence of method
 * under every chart. The second took out whatever another app already shows
 * better or this page already said: sleep and resting heart rate are Garmin
 * Connect's own screens, the recent-sessions list is Hevy's, and the weekly
 * movement chart was a picture of a number already in the headline. What is
 * left is what only this page can put side by side.
 */
export function BodySections({ data }: { data: DashboardData }) {
  return (
    <div className="mt-6 space-y-6">
      <Headline data={data} />
      <Strength data={data} />
      <Weight data={data} />
      <Muscles data={data} />
    </div>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {note && <CardDescription>{note}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

/** "Mon 8 Sep" — the day the data is complete to. */
const synced = (day: string) => format(parseISO(day), "EEE d MMM");

/**
 * Four numbers, then the one sentence worth reading.
 *
 * The sentence names the day its window ends on. It used to say "the last 28
 * days", which was true of neither window it described: the sessions ended at
 * the last workout and the watch at today, while the data only ever arrives
 * on Mondays. Saying the date is what makes the comparison checkable.
 */
function Headline({ data }: { data: DashboardData }) {
  const { cadence, watch } = data;
  const s = watch.summary;
  const window = cadence.through ? `in the 28 days to ${synced(cadence.through)}` : "in the last 28 days";
  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-4">
          <Stat value={cadence.last_28} label="sessions, 28 days" />
          <Stat value={s?.who_minutes_week ?? "—"} label="active min a week" />
          <Stat value={s?.rhr ?? "—"} label="resting bpm" />
          <Stat value={s?.sleep_hours != null ? `${s.sleep_hours}h` : "—"} label="sleep a night" />
        </div>
        <p className="text-sm leading-normal text-muted-foreground">
          {cadence.judged.label} — {cadence.last_28} session{cadence.last_28 === 1 ? "" : "s"} {window},
          against {cadence.prev_28} the 28 before. Hevy and the watch sync on Monday mornings.
        </p>
      </CardContent>
    </Card>
  );
}

function Strength({ data }: { data: DashboardData }) {
  const { meter } = data.strength;
  return (
    <Section title="Strength" note="Your four barbell lifts' estimated maxes, added up.">
      {meter ? (
        <Gauge meter={meter} />
      ) : (
        <p className="text-sm text-muted-foreground">No barbell sets in the last four months.</p>
      )}
    </Section>
  );
}

/** Short enough that four sit in a row on a phone. */
const LIFT_LABEL: Record<string, string> = {
  deadlift: "Deadlift",
  squat: "Squat",
  bench: "Bench",
  ohp: "Press",
};

/**
 * The strength-o-meter: an arc filled to the share of your best, the total in
 * the middle of it, and the four lifts it is made of underneath.
 *
 * Drawn on the server as plain SVG, because it is one arc and a number — the
 * chart library would be the heaviest thing on the card by a distance. The
 * arc uses `pathLength` so the fill is a dash length in percent rather than
 * trigonometry, and the knob at its end is the only place the angle is
 * worked out.
 *
 * Ticks at the quarters give the dial something to be read against; without
 * them 89% and 94% are the same picture.
 */
function Gauge({ meter }: { meter: StrengthMeter }) {
  const cx = 110;
  const cy = 112;
  const r = 90;
  const arc = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  const at = (pct: number, radius: number) => {
    const angle = Math.PI * (1 - Math.min(100, Math.max(0, pct)) / 100);
    return { x: cx + radius * Math.cos(angle), y: cy - radius * Math.sin(angle) };
  };
  const knob = at(meter.pctOfBest, r);

  return (
    <div className="space-y-4">
      <svg
        viewBox="0 0 220 124"
        className="mx-auto block w-full max-w-68"
        role="img"
        aria-label={`${meter.total} kilograms, ${meter.pctOfBest}% of your best of ${meter.best}.`}
      >
        <defs>
          <linearGradient id="strength-arc" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" style={{ stopColor: "var(--accent-water)" }} />
            <stop offset="100%" style={{ stopColor: "var(--accent-protein)" }} />
          </linearGradient>
        </defs>

        {[0, 25, 50, 75, 100].map((pct) => {
          const inner = at(pct, r + 11);
          const outer = at(pct, r + 17);
          return (
            <line
              key={pct}
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              stroke="var(--muted-foreground)"
              strokeOpacity={0.45}
              strokeWidth={1.5}
              strokeLinecap="round"
            />
          );
        })}

        <path d={arc} fill="none" stroke="var(--muted)" strokeWidth={16} strokeLinecap="round" />
        <path
          d={arc}
          pathLength={100}
          fill="none"
          stroke="url(#strength-arc)"
          strokeWidth={16}
          strokeLinecap="round"
          strokeDasharray={`${meter.pctOfBest} 100`}
        />
        <circle cx={knob.x} cy={knob.y} r={9} fill="var(--card)" stroke="var(--accent-protein)" strokeWidth={3.5} />

        <text
          x={cx}
          y={cy - 20}
          textAnchor="middle"
          fill="currentColor"
          style={{ fontSize: 40, fontWeight: 700, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}
        >
          {meter.total}
          <tspan style={{ fontSize: 16, fontWeight: 600 }} dx={3}>
            kg
          </tspan>
        </text>
        <text x={cx} y={cy + 2} textAnchor="middle" fill="var(--muted-foreground)" style={{ fontSize: 12.5 }}>
          {meter.pctOfBest}% of your best
        </text>
      </svg>

      <p className="text-center text-sm text-muted-foreground">
        Best is {meter.best} kg, every lift at its peak
        {meter.timesBodyweight != null && <> · {meter.timesBodyweight.toFixed(1)}× bodyweight</>}
      </p>

      <ul className="grid grid-cols-4 gap-2 text-center">
        {meter.lifts.map((lift) => (
          <li key={lift.key} className="rounded-2xl bg-muted/50 px-1 py-2.5">
            <div className="text-base font-semibold tabular-nums">{lift.kg}</div>
            <div className="text-xs text-muted-foreground">{LIFT_LABEL[lift.key] ?? lift.short}</div>
          </li>
        ))}
      </ul>

      {meter.missing.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {meter.missing.join(" and ")} {meter.missing.length === 1 ? "has" : "have"} no sets in four months, so{" "}
          {meter.missing.length === 1 ? "it is" : "they are"} left out of both totals.
        </p>
      )}
    </div>
  );
}

/**
 * The number first, in weight's own violet, with how far it has moved beside
 * it; then the line, filled underneath so it reads as a quantity falling
 * rather than a wire. The targets are drawn in the colours of what they are —
 * amber for the first milestone, green for the long one — and the chart's
 * range stretches to include them, so the gap left to close is on the chart
 * rather than off the top of it.
 */
function Weight({ data }: { data: DashboardData }) {
  const { weight, body, bmi } = data;
  const { change } = weight;
  const down = change !== null && change.kg < 0;
  const up = change !== null && change.kg > 0;

  return (
    <Section title="Weight" note={`${body.latest.body_fat_pct}% body fat · BMI ${bmi.current}`}>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
        <span className="text-3xl font-semibold tabular-nums tracking-tight" style={{ color: "var(--ink-weight)" }}>
          {body.latest.weight_kg}
          <span className="ml-1 text-base font-medium">kg</span>
        </span>
        {change && (
          <span
            className="rounded-full px-2.5 py-0.5 text-sm font-medium tabular-nums"
            style={
              down
                ? { color: "var(--ink-fibre)", background: "color-mix(in oklch, var(--accent-fibre) 14%, transparent)" }
                : up
                  ? { color: "var(--destructive)", background: "color-mix(in oklch, var(--destructive) 12%, transparent)" }
                  : { color: "var(--muted-foreground)", background: "var(--muted)" }
            }
          >
            {down ? "−" : up ? "+" : "±"}
            {Math.abs(change.kg)} kg since {format(parseISO(change.since), "d MMM")}
          </span>
        )}
      </div>

      <AreaTrend
        data={weight.series}
        x="date"
        y="kg"
        label="Weight"
        unit=" kg"
        colour="var(--accent-weight)"
        references={weight.targets.map((t) => ({
          value: t.value,
          label: t.label,
          colour: t.tone === "good" ? "var(--ink-fibre)" : "var(--ink-energy)",
        }))}
      />

      <ul className="mt-4">
        {body.meters.map((meter) => (
          <li key={meter.label} className="flex items-baseline justify-between gap-4 border-b py-2 text-sm last:border-b-0">
            <span>{meter.label}</span>
            <span className="tabular-nums text-muted-foreground">
              {meter.display} <span className="ml-2">{meter.targetLabel}</span>
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Muscles({ data }: { data: DashboardData }) {
  const { muscles } = data;
  return (
    <Section title="Where the sets go" note="Each muscle grown and warmed by its share of the sets.">
      <MusclesPanel recent={muscles.recent} all={muscles.all} />
    </Section>
  );
}
