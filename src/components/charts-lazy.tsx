"use client";

import dynamic from "next/dynamic";

/**
 * The charts, loaded only once the page is on screen.
 *
 * recharts is the heaviest thing this app ships — it pulls redux-toolkit,
 * react-redux, immer, reselect and the d3 modules behind `victory-vendor`. Four
 * of the dashboard's seven sections draw a chart; the other three are numbers
 * and lists that need no JavaScript at all.
 *
 * Importing it statically from `training-sections.tsx` meant the whole page
 * waited on that bundle before showing anything. Behind `dynamic` the figures,
 * tables and captions render from server HTML immediately and the charts fill
 * in when their chunk lands — which on a bad connection is the difference
 * between a readable page and a blank one.
 *
 * `ssr: false` because recharts renders nothing useful on the server anyway:
 * `ResponsiveContainer` measures its parent, and there is nothing to measure
 * until there is a layout.
 *
 * This wrapper is a client component so the sections themselves no longer have
 * to be — `next/dynamic` with `ssr: false` cannot be called from a server
 * component.
 */

/**
 * Holds the chart's space while its chunk loads, so the sections below do not
 * jump when it arrives. The heights match the defaults in `charts.tsx`.
 */
function Placeholder({ height }: { height: number }) {
  return <div aria-hidden style={{ height }} className="w-full animate-pulse rounded-none bg-muted/40" />;
}

export const TrendChart = dynamic(() => import("./charts").then((m) => m.TrendChart), {
  ssr: false,
  loading: () => <Placeholder height={180} />,
});

export const BarsChart = dynamic(() => import("./charts").then((m) => m.BarsChart), {
  ssr: false,
  loading: () => <Placeholder height={160} />,
});
