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
  /*
   * The offline document has to be in the precache to be a fallback, and it
   * only gets there if it is named. Serwist's manifest is built from static
   * assets; an App Router route is not one of those, so without this the
   * fallback would point at a URL the worker had never stored and fail in
   * exactly the situation it exists for.
   */
  additionalPrecacheEntries: [{ url: "/offline", revision: null }],
  disable: process.env.NODE_ENV !== "production",
});

const nextConfig: NextConfig = {
  /**
   * Prerender a static shell for every route and stream the dynamic parts in.
   *
   * This is the whole performance story for this app. Every page here reads
   * the session from cookies, so every page was dynamic, which meant every tab
   * tap woke a Netlify function and waited for it before painting anything.
   * With Cache Components the shell — layout, nav, and each route's loading
   * skeleton — is built once and served from the CDN, so the first paint costs
   * no function at all and the cold start only delays the data.
   *
   * Stable since Next 16, and it subsumes the old `ppr`, `dynamicIO` and
   * `useCache` flags. Requires the Node runtime, which is what Netlify runs.
   */
  cacheComponents: true,

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
