import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";

/**
 * The service worker is built from src/app/sw.ts into public/sw.js.
 *
 * Disabled in development: a worker that caches aggressively while you are
 * editing is a source of "why is my change not showing" that costs more time
 * than the offline behaviour it is testing.
 */
const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
  /**
   * Empty on purpose, and required.
   *
   * Next 16 runs Turbopack by default. Serwist is a webpack plugin, so
   * `withSerwist` below attaches a `webpack` config — and Next refuses to start
   * when it finds one with no `turbopack` config beside it, on the reasonable
   * assumption that a webpack config nobody migrated is a mistake rather than a
   * decision.
   *
   * Here it is a decision. `pnpm build` opts into webpack explicitly so Serwist
   * can compile a real precache manifest; `pnpm dev` stays on Turbopack, which
   * is both faster and unaffected, because the `disable` above turns Serwist off
   * in development anyway. Declaring this says "both are configured, on
   * purpose" and lets each command take the one it asked for.
   */
  turbopack: {},
};

export default withSerwist(nextConfig);
