import { useId } from "react";

/**
 * A progress ring.
 *
 * SVG rather than a conic-gradient, for two reasons: a round cap on the
 * stroke, which is most of what makes it look drawn rather than computed, and
 * a stroke that animates. `stroke-dasharray` on a circle is the oldest trick
 * here and still the one that behaves.
 *
 * Over-target is shown, not clamped — the arc completes and the number keeps
 * counting. A tracker that silently pins at 100% is one that hides the day you
 * most want to see.
 */
export function Ring({
  value,
  target,
  colour,
  overColour,
  size = 74,
  width = 7,
  children,
}: {
  value: number;
  target: number;
  /** A CSS colour — pass the `--accent-*` token for the metric. */
  colour: string;
  /**
   * What to draw when the value is past its target, if past it is a problem.
   *
   * Not every overshoot is one. Protein is a floor, so 130% of it is the good
   * day; calories are a ceiling, so 104% is the thing you opened the app to
   * find out. Only the caller knows which kind it is holding, so only the
   * caller decides whether over should look like anything.
   */
  overColour?: string;
  size?: number;
  width?: number;
  children?: React.ReactNode;
}) {
  /*
    Two percentages, because they answer different questions.

    The arc is clamped: a circle cannot be more than a circle, and 155% drawn
    as an arc is just a full one. The number is not, and until now it was —
    which made the docstring above a description of something the code did not
    do. Pinning the figure at 100% hides exactly the days worth looking at,
    and "100%" on a day you went 300 kcal over is not a rounding, it is the
    wrong number.
  */
  const ratio = target > 0 ? (value / target) * 100 : 0;
  const pct = Math.min(100, ratio);
  const radius = (size - width) / 2;
  const circumference = 2 * Math.PI * radius;
  const over = target > 0 && value > target;

  // Unique per instance: two rings on one screen sharing a gradient id would
  // both resolve to whichever was defined last.
  const gradientId = `ring-${useId()}`;
  const drawn = over && overColour ? overColour : colour;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        // Rotated so 0% starts at twelve o'clock rather than three.
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-hidden
      >
        <defs>
          {/*
            The arc is a gradient, not a flat stroke — brighter where it starts
            and deeper where it ends, so the ring has a light source like
            everything else on the card. Two stops of the same hue at different
            alpha, which keeps it unmistakably one colour.
          */}
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={drawn} stopOpacity={1} />
            <stop offset="100%" stopColor={drawn} stopOpacity={0.72} />
          </linearGradient>
        </defs>

        {/* The track is the same hue at low alpha rather than a grey, so the
            ring reads as one object with a dim half instead of two rings. */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={drawn}
          strokeWidth={width}
          opacity={0.13}
        />

        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={width}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - (pct / 100) * circumference}
          style={{
            transition: "stroke-dashoffset 700ms cubic-bezier(0.2, 0, 0, 1)",
            // A shadow in the arc's own colour, which lifts it off the track
            // without the grey haze a neutral shadow would leave.
            filter: `drop-shadow(0 1px 3px color-mix(in oklch, ${drawn} 45%, transparent))`,
          }}
        />
      </svg>

      <div className="absolute inset-0 grid place-items-center">
        {children ?? (
          <span
            // Scaled to the ring rather than fixed: at 52px the old 13px sat
            // shoulder to shoulder with the stroke.
            style={{
              fontSize: Math.max(11, Math.round(size * 0.22)),
              color: over ? drawn : undefined,
            }}
            className="font-semibold tabular-nums"
          >
            {Math.round(ratio)}%
          </span>
        )}
      </div>
    </div>
  );
}
