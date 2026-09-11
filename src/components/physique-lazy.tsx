"use client";

import dynamic from "next/dynamic";
import { FIGURE_HEIGHT } from "@/lib/training/physique";

/**
 * The 3D figure, loaded only when the Body page wants it.
 *
 * three.js is the largest single dependency this app has — larger than
 * recharts — and it draws one ornamental thing near the bottom of one page.
 * Behind `dynamic` it costs nothing until that section renders, and nothing at
 * all on the four screens that never show it.
 *
 * `ssr: false` because WebGL has no server to run on. The placeholder holds the
 * canvas's exact height so the list below does not jump when the chunk lands,
 * and its height comes from the pure module rather than the model, since
 * importing the model to read a constant would pull three.js in statically.
 */
export const PhysiqueModel = dynamic(() => import("./physique-model").then((m) => m.PhysiqueModel), {
  ssr: false,
  loading: () => (
    <div aria-hidden style={{ height: FIGURE_HEIGHT }} className="w-full animate-pulse rounded-2xl bg-muted/40" />
  ),
});
