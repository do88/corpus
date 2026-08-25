"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { BarsChart, TrendChart } from "./charts";
import type { DashboardData } from "@/lib/training/dashboard";

/**
 * The training dashboard, one section per thing worth knowing.
 *
 * A client component only because the charts need the browser — every number
 * on it was decided server-side in `dashboard.ts`. Nothing here computes
 * anything; it lays out what it was handed.
 */
export function TrainingSections({ data }: { data: DashboardData }) {
  return (
    <div className="mt-6 space-y-6">
      <Headline data={data} />
      <Knee data={data} />
      <Strength data={data} />
      <Body data={data} />
      <Muscles data={data} />
      <Sessions data={data} />
      <Running data={data} />
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

function Headline({ data }: { data: DashboardData }) {
  const { headline, body } = data;
  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Stat value={headline.total_workouts} label="sessions" />
          <Stat value={headline.total_sets.toLocaleString("en-GB")} label="sets" />
          <Stat value={`${headline.total_hours}h`} label="under the bar" />
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

/** The constraint. Reps, not tonnage — accumulated reps are what flare it. */
function Knee({ data }: { data: DashboardData }) {
  const { knee } = data;
  return (
    <Section
      title="Knee load, weekly"
      note={`Counted in knee-flexion reps rather than weight, because reps are what the right knee actually reacts to. Median ${knee.median} a week, peak ${knee.peak}.`}
    >
      <BarsChart data={knee.series} x="week" y="reps" unit=" reps" />
    </Section>
  );
}

function Strength({ data }: { data: DashboardData }) {
  const { strength } = data;
  return (
    <Section
      title="Estimated one-rep max"
      note="Best set of each quarter, via Epley. Assisted machine work is excluded — it logs the assistance, so more help would read as more strength."
    >
      <TrendChart
        data={strength.series}
        x="period"
        unit=" kg"
        series={strength.definitions.map((lift, index) => ({
          key: lift.key,
          label: lift.short,
          colour: ["var(--foreground)", "var(--mark-red)", "var(--mark-blue)", "var(--mark-yellow)"][index],
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

function Body({ data }: { data: DashboardData }) {
  const { weight, body, bmi } = data;
  return (
    <Section
      title="Weight"
      note={`${body.latest.weight_kg} kg, ${body.latest.body_fat_pct}% body fat, BMI ${bmi.current}. The dashed lines are what holding lean mass would weigh at ${weight.targets.map((t) => t.label).join(" and ")}.`}
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

function Muscles({ data }: { data: DashboardData }) {
  const { muscles } = data;
  return (
    <Section title="Where the sets go" note="Last twelve months, by primary muscle group.">
      <ul>
        {muscles.rows.map((row) => (
          <li key={row.muscle} className="border-b py-2 last:border-b-0">
            <div className="flex items-baseline justify-between gap-4 text-sm">
              <span className="capitalize">{row.muscle}</span>
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

function Running({ data }: { data: DashboardData }) {
  const { running } = data;
  return (
    <Section
      title="Running"
      note={`${running.thisYear} run${running.thisYear === 1 ? "" : "s"} this year. Impact rather than flexion, so it is tracked apart from knee load.`}
    >
      <TrendChart data={running.recent} x="date" unit=" km" series={[{ key: "km", label: "Distance" }]} />
      <ul className="mt-4">
        {running.table.map((run) => (
          <li key={run.date} className="flex items-baseline justify-between gap-4 border-b py-2 text-sm last:border-b-0">
            <span>{run.date}</span>
            <span className="tabular-nums text-muted-foreground">
              {run.distance_km} km · {Math.round(run.duration_min)} min
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}
