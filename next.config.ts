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

const nextConfig: NextConfig = {};

export default withSerwist(nextConfig);
