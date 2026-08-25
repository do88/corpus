import { getDashboardData } from "@/lib/training/dashboard";
const t0 = Date.now();
await getDashboardData();
console.log("cold:", Date.now() - t0, "ms");
const t1 = Date.now();
await getDashboardData();
console.log("warm:", Date.now() - t1, "ms");
process.exit(0);
