import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { BarsChart, TrendChart } from "./charts-lazy";
import type { DashboardData } from "@/lib/training/dashboard";

/**
 * Body: what the log, the scale and the watch say, one section per thing
 * worth knowing.
 *
 * A **server** component. Every number was decided in `dashboard.ts`; this
 * lays out what it was handed. The charts sit behind `charts-lazy`, which is
 * the only client boundary.
 *
 * Trimmed on purpose. The old page carried a sentence of method under every
 * chart — which formula, what was excluded and why — and a dashboard you read
 * every day does not need its footnotes read to it every day. The reasoning
 * lives in the query and model code where someone changing it will find it.
 */
export function BodySections({ data }: { data: DashboardData }) {
  return (
    <div className="mt-6 space-y-6">
      <Headline data={data} />
      <Movement data={data} />
      <Strength data={data} />
      <Weight data={data} />
      <Sleep data={data} />
      <RestingHr data={data} />
      <Muscles data={data} />
      <Sessions data={data} />
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

/**
 * The last thirty days in four numbers, then the one sentence that used to be
 * buried under a lifetime total. "468 sessions since 2021" is trivia; "7 in
 * the last 28 days against 7" is the thing to know.
 */
function Headline({ data }: { data: DashboardData }) {
  const { headline, body, watch } = data;
  const s = watch.summary;
  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-4">
          <Stat value={headline.last_28} label="sessions, 28 days" />
          <Stat value={s?.who_minutes_week ?? "—"} label="active min a week" />
          <Stat value={s?.rhr ?? "—"} label="resting bpm" />
          <Stat value={s?.sleep_hours != null ? `${s.sleep_hours}h` : "—"} label="sleep a night" />
        </div>
        <p className="text-sm leading-normal text-muted-foreground">
          {body.cadence.label} — {headline.last_28} session
          {headline.last_28 === 1 ? "" : "s"} in the last 28 days against{" "}
          {headline.prev_28} the 28 before.
        </p>
      </CardContent>
    </Card>
  );
}

/** Weekly minutes at moderate-or-better effort, against the 150 the WHO asks for. */
function Movement({ data }: { data: DashboardData }) {
  const { movement } = data.watch;
  return (
    <Section title="Movement, weekly" note="Minutes at moderate effort or above. Vigorous counts double.">
      <BarsChart
        data={movement}
        x="week"
        y="minutes"
        unit=" min"
        references={[{ value: 150, label: "150" }]}
      />
    </Section>
  );
}

function Strength({ data }: { data: DashboardData }) {
  const { strength } = data;
  return (
    <Section title="Estimated one-rep max">
      <TrendChart
        data={strength.series}
        x="period"
        unit=" kg"
        series={strength.definitions.map((lift, index) => ({
          key: lift.key,
          label: lift.short,
          colour: [
            "var(--accent-protein)",
            "var(--accent-energy)",
            "var(--accent-weight)",
            "var(--accent-water)",
          ][index],
        }))}
      />
      <ul className="mt-4">
        {strength.lifts.map((lift) => (
          <li key={lift.key} className="flex items-baseline justify-between gap-4 border-b py-2 text-sm last:border-b-0">
            <span>{lift.short}</span>
            <span className="tabular-nums text-muted-foreground">
              {lift.current ?? "—"} kg
              {lift.peak && lift.pctOfPeak !== null && (
                <span className="ml-2">{lift.pctOfPeak}% of peak</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Weight({ data }: { data: DashboardData }) {
  const { weight, body, bmi } = data;
  return (
    <Section
      title="Weight"
      note={`${body.latest.weight_kg} kg · ${body.latest.body_fat_pct}% body fat · BMI ${bmi.current}`}
    >
      <TrendChart
        data={weight.series}
        x="date"
        unit=" kg"
        series={[{ key: "kg", label: "Weight" }]}
        references={weight.targets.map((t) => ({ value: t.value, label: t.label }))}
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

/** Hours a night by week. Awake minutes in the caption, not Garmin's score. */
function Sleep({ data }: { data: DashboardData }) {
  const { sleep, summary } = data.watch;
  const note =
    summary?.sleep_hours != null
      ? `${summary.sleep_hours} h a night over the last 30 · ${summary.awake_min ?? 0} min awake`
      : undefined;
  return (
    <Section title="Sleep, weekly" note={note}>
      <BarsChart data={sleep} x="week" y="hours" unit=" h" references={[{ value: 7, label: "7h" }]} />
    </Section>
  );
}

function RestingHr({ data }: { data: DashboardData }) {
  const { restingHr } = data.watch;
  return (
    <Section title="Resting heart rate, monthly">
      <TrendChart data={restingHr} x="month" unit=" bpm" series={[{ key: "bpm", label: "Resting" }]} />
    </Section>
  );
}

function Muscles({ data }: { data: DashboardData }) {
  const { muscles } = data;
  return (
    <Section title="Where the sets go" note="Last twelve months.">
      <ul>
        {muscles.rows.map((row) => (
          <li key={row.muscle} className="border-b py-2 last:border-b-0">
            <div className="flex items-baseline justify-between gap-4 text-sm">
              <span className="capitalize">{row.muscle.replace("_", " ")}</span>
              <span className="tabular-nums text-muted-foreground">
                {row.sets} sets · {row.pct}%
              </span>
            </div>
            <Progress value={(row.sets / muscles.max) * 100} className="mt-2 h-1.5" />
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Sessions({ data }: { data: DashboardData }) {
  return (
    <Section title="Recent sessions">
      <ul>
        {data.sessions.map((session) => (
          <li key={session.id} className="border-b py-2.5 last:border-b-0">
            <div className="flex items-baseline justify-between gap-4 text-sm">
              <span>{session.title}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {session.volume_t} t
              </span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {session.date} · {session.n_sets} sets ·{" "}
              {Math.round(session.duration_min)} min
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}
