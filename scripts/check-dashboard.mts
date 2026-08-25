/**
 * Smoke-check the training dashboard's data layer.
 *
 *     pnpm check:dashboard
 *
 * Renders nothing — it just proves `getDashboardData` returns real numbers from
 * Postgres, which is the half of the dashboard that can't be eyeballed while
 * the page sits behind auth.
 */
import { getDashboardData } from "@/lib/training/dashboard";

const d = await getDashboardData();

console.log(`sessions      ${d.headline.total_workouts}  (${d.headline.first_date} → ${d.headline.last_date})`);
console.log(`sets          ${d.headline.total_sets}`);
console.log(`cadence       ${d.body.cadence.label}`);
console.log(`weight        ${d.body.latest.weight_kg} kg, ${d.body.latest.body_fat_pct}% bf, BMI ${d.bmi.current}`);
console.log(`protein       ${d.energy.protein.target} g from ${d.body.latest.fat_free_mass_kg} kg lean`);
console.log(`knee          median ${d.knee.median}/wk, peak ${d.knee.peak}, ${d.knee.series.length} weeks`);
console.log(`strength      ${d.strength.lifts.map((l) => `${l.short} ${l.current ?? "—"}kg`).join(", ")}`);
console.log(`muscles       ${d.muscles.rows.slice(0, 3).map((m) => `${m.muscle} ${m.pct}%`).join(", ")}`);
console.log(`running       ${d.running.thisYear} this year, ${d.running.all.length} logged`);
console.log(`sessions list ${d.sessions.length} recent`);

const empty = d.headline.total_workouts === 0 || d.knee.series.length === 0;
console.log(empty ? "\nEMPTY — is the data ported?" : "\ndashboard data looks real");
process.exit(empty ? 1 : 0);
