import { buildDashboardData } from "@/lib/training/dashboard";
const t0 = Date.now();
await buildDashboardData();
console.log("cold:", Date.now() - t0, "ms");
const t1 = Date.now();
await buildDashboardData();
console.log("warm:", Date.now() - t1, "ms");
process.exit(0);
