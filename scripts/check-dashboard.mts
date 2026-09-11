/**
 * Smoke-check the training dashboard's data layer.
 *
 *     pnpm check:dashboard
 *
 * Renders nothing — it just proves the query layer returns real numbers from
 * Postgres, which is the half of the dashboard that can't be eyeballed while
 * the page sits behind auth.
 */
import { buildDashboardData } from "@/lib/training/dashboard";
import { getHeadline } from "@/lib/queries";

// The lifetime totals are no longer on the page, but they are still the
// quickest proof that the port landed, so the check asks for them itself.
const [d, headline] = await Promise.all([buildDashboardData(), getHeadline()]);
const w = d.watch.summary;
const meter = d.strength.meter;

console.log(`sessions      ${headline.total_workouts}  (${headline.first_date} → ${headline.last_date})`);
console.log(`sets          ${headline.total_sets}`);
console.log(`cadence       ${d.cadence.judged.label}: ${d.cadence.last_28} against ${d.cadence.prev_28}, to ${d.cadence.through ?? "—"}`);
console.log(`weight        ${d.body.latest.weight_kg} kg, ${d.body.latest.body_fat_pct}% bf, BMI ${d.bmi.current}`);
console.log(`change        ${d.weight.change ? `${d.weight.change.kg} kg since ${d.weight.change.since}` : "—"}`);
console.log(`protein       ${d.energy.protein.target} g from ${d.body.latest.fat_free_mass_kg} kg lean`);
console.log(`strength      ${meter ? `${meter.total} kg, ${meter.pctOfBest}% of ${meter.best}, ${meter.timesBodyweight ?? "—"}× bodyweight` : "—"}`);
console.log(`lifts         ${d.strength.lifts.map((l) => `${l.short} ${l.current ?? "—"}kg`).join(", ")}`);
console.log(`muscles       ${d.muscles.recent.slice(0, 3).map((m) => `${m.muscle} ${m.pct}%`).join(", ")}`);
console.log(`watch         ${w?.who_minutes_week ?? "—"} active min a week, ${w?.rhr ?? "—"} bpm, ${w?.sleep_hours ?? "—"} h (${w?.days ?? 0} days to ${w?.through ?? "—"})`);

const empty = headline.total_workouts === 0 || d.strength.lifts.every((l) => l.peak === null);
console.log(empty ? "\nEMPTY — is the data ported?" : "\ndashboard data looks real");
process.exit(empty ? 1 : 0);
