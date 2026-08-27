"use client";

import { useLinkStatus } from "next/link";

/**
 * The tap you just made, still working.
 *
 * Rendered inside each tab's `<Link>`, which is the only place `useLinkStatus`
 * can read from. That constraint turns out to be the better design anyway: a
 * bar across the top of the screen says *something* is loading, where this says
 * *the thing you just pressed* is loading, which is the question being asked.
 *
 * It should almost never appear. With the shell prerendered and every route
 * carrying a skeleton, a tab change is usually instant — this is for the
 * cold function or the bad connection, which is exactly when silence is worst.
 * It is deliberately slow to show: an indicator that flashes on every fast
 * navigation is noise, and 150ms of nothing reads as instant rather than as
 * broken.
 */
export function TabPending() {
  const { pending } = useLinkStatus();

  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-x-3 bottom-0 h-0.5 origin-left overflow-hidden rounded-full lg:inset-x-2"
      style={{
        background: "var(--accent-protein)",
        opacity: pending ? 1 : 0,
        // Held back so a fast navigation never flashes it, then eased in.
        transition: pending ? "opacity 120ms ease 150ms" : "opacity 100ms ease",
        animation: pending ? "tab-pending 900ms ease-in-out 150ms infinite" : "none",
      }}
    />
  );
}
