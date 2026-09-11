"use client";

import { useMemo, useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PhysiqueModel } from "./physique-lazy";
import {
  describePhysique,
  muscleName,
  offFigure,
  physique,
  type MuscleSets,
  type MuscleShape,
} from "@/lib/training/physique";

/** The figure's untrained grey, as CSS. */
const COOL = "color-mix(in oklch, var(--card), var(--foreground) 34%)";

/**
 * The figure's heat ramp in CSS, so the list and the legend are drawn in the
 * same colours as the muscles they name: grey, through amber at half the top
 * muscle, to red. The figure mixes the same three tokens in three.js.
 */
function heat(share: number): string {
  const pct = (n: number) => `${Math.round(Math.min(1, Math.max(0, n)) * 100)}%`;
  return share <= 0.5
    ? `color-mix(in oklch, var(--accent-energy) ${pct(share * 2)}, ${COOL})`
    : `color-mix(in oklch, var(--destructive) ${pct((share - 0.5) * 2)}, var(--accent-energy))`;
}

type Span = "recent" | "all";

/** "full body, cardio and other". */
function listOf(names: string[]): string {
  return names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function sentenceCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Where the sets go: a figure that turns, and the list it is drawn from.
 *
 * Two windows rather than one, and the data is the reason. Over the last
 * twelve months biceps and triceps are ten sets and seven; over all time
 * triceps is seven hundred. A twelve-month figure alone draws pencil arms on
 * someone who knows perfectly well they trained arms for years — and a
 * picture that contradicts what you know reads as broken, not as insight.
 * Switching between the two is where the figure earns its place: it shows the
 * programme changing shape.
 *
 * The list stays, under the figure. It is the table this chart would otherwise
 * be missing: exact counts, readable without WebGL, and the only place the
 * rows that are not a body part appear.
 */
export function MusclesPanel({ recent, all }: { recent: MuscleSets[]; all: MuscleSets[] }) {
  const [span, setSpan] = useState<Span>("recent");
  const rows = span === "recent" ? recent : all;
  const shape = useMemo(() => physique(rows), [rows]);
  const { largest, smallest } = useMemo(() => describePhysique(shape), [shape]);
  const left = offFigure(rows);
  const max = rows[0]?.sets ?? 1;

  const label =
    `A figure with each muscle sized by its sets, ${span === "recent" ? "last twelve months" : "all time"}. ` +
    (largest.length ? `Largest: ${largest.join(", ")}. ` : "") +
    `Smallest: ${smallest.join(", ")}. Drag or use the arrow keys to turn it.`;

  return (
    <div className="space-y-4">
      <Tabs value={span} onValueChange={(value) => setSpan(value as Span)}>
        <TabsList className="h-11 w-full group-data-horizontal/tabs:h-11">
          <TabsTrigger value="recent">12 months</TabsTrigger>
          <TabsTrigger value="all">All time</TabsTrigger>
        </TabsList>
      </Tabs>

      <PhysiqueModel shape={shape} label={label} />

      {/* The key to the colour, now that the figure has one. */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground" aria-hidden>
        <span>Fewer sets</span>
        <span
          className="h-2 flex-1 rounded-full"
          style={{ background: `linear-gradient(to right, ${COOL}, var(--accent-energy), var(--destructive))` }}
        />
        <span>More</span>
      </div>

      {/* It used to say these were "in the list", and the list stops at ten
          rows — cardio was eleventh, so the sentence was contradicted by the
          page it sat on. It now says only what is true everywhere. */}
      {left.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {sentenceCase(listOf(left.map((row) => muscleName(row.muscle))))}{" "}
          {left.length === 1 ? "isn’t drawn: it isn’t" : "aren’t drawn: they aren’t"} a place on a body.
        </p>
      )}

      <ul>
        {rows.slice(0, 10).map((row) => {
          // A body part takes its colour on the figure; a row that is not one
          // (full body, cardio) has no colour there, so it gets none here.
          const onFigure = (shape as Record<string, MuscleShape | undefined>)[row.muscle];
          return (
            <li key={row.muscle} className="border-b py-2 last:border-b-0">
              <div className="flex items-baseline justify-between gap-4 text-sm">
                <span className="capitalize">{muscleName(row.muscle)}</span>
                <span className="tabular-nums text-muted-foreground">
                  {row.sets} sets{row.pct !== undefined ? ` · ${row.pct}%` : ""}
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(row.sets / max) * 100}%`,
                    background: onFigure ? heat(onFigure.share) : "var(--muted-foreground)",
                  }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
