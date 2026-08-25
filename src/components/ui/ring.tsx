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
  size = 74,
  width = 7,
  children,
}: {
  value: number;
  target: number;
  /** A CSS colour — pass the `--accent-*` token for the metric. */
  colour: string;
  size?: number;
  width?: number;
  children?: React.ReactNode;
}) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  const radius = (size - width) / 2;
  const circumference = 2 * Math.PI * radius;
  const over = target > 0 && value > target;

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
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colour}
          strokeWidth={width}
          // The track is the same hue at low alpha rather than a grey, so the
          // ring reads as one object with a dim half instead of two rings.
          opacity={0.14}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colour}
          strokeWidth={width}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - (pct / 100) * circumference}
          style={{ transition: "stroke-dashoffset 700ms cubic-bezier(0.2, 0, 0, 1)" }}
        />
      </svg>

      <div className="absolute inset-0 grid place-items-center">
        {children ?? (
          <span
            className="text-[0.8125rem] font-semibold tabular-nums"
            style={{ color: over ? colour : undefined }}
          >
            {Math.round(pct)}%
          </span>
        )}
      </div>
    </div>
  );
}
