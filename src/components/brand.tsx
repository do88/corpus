/**
 * The do.fit mark: an arc with its head broken off as a dot.
 *
 * It is doing three jobs at once, which is what earns it the place:
 *
 * - It is the **"o" in "do"** and the **"." in "do.fit"**, so the mark and the
 *   name are the same idea rather than a logo bolted onto a word.
 * - It is a **progress ring**, already the app's entire visual language — every
 *   figure on the home screen is one of these.
 * - The ring is **open**. A closed circle says finished; a tracker never is,
 *   and the gap is the difference between a full stop and something still
 *   going.
 *
 * The dot sits detached at the head of the arc rather than in the centre, and
 * that is the whole design rather than a flourish. Centred, it was a power
 * button — an open ring around a dot is one of the most worn symbols there is,
 * and at 29px the mark lost to it completely. Moving the dot out to the arc's
 * end leaves an asymmetric silhouette with nothing in the middle, which reads
 * as a progress head and as nothing else. Checked at 18px and in greyscale,
 * because that is where a logo is actually decided.
 *
 * Monochrome by default via `currentColor`, so it survives a favicon, a
 * greyscale print and a system tray. The accent is optional: the mark has to
 * work with the colour removed, or it is a picture rather than a mark.
 */
export function Logomark({
  size = 28,
  accent,
  className,
}: {
  size?: number;
  /** A CSS colour for the dot. Omit for a single-colour mark. */
  accent?: string;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      role="img"
      aria-label="do.fit"
    >
      {/* 292° drawn from twelve o'clock. Round caps overhang the path by half
          the stroke, which is why r is 11 in a 32 box rather than more. */}
      <circle
        cx="16"
        cy="16"
        r="11"
        stroke="currentColor"
        strokeWidth="3.6"
        strokeLinecap="round"
        strokeDasharray="56.06 69.12"
        transform="rotate(-90 16 16)"
      />
      {/* Sitting exactly where the arc would have continued, so the gap reads
          as travelled rather than as a circle that failed to close. */}
      <circle cx="5.80" cy="11.88" r="3.4" fill={accent ?? "currentColor"} />
    </svg>
  );
}

/**
 * The mark beside the name, for places that need to say what the app is —
 * the sign-in screen, and the top of Today.
 *
 * Every other screen has a title that does that job, and repeating the
 * product name above each of them would be a website habit rather than an app
 * one. Today is the exception because its title was the date, and the date is
 * already the one thing the screen states three times: the selected disc in
 * the strip, its neighbours either side, and the caption saying how far back
 * it is. Thirty-four point type restating it was the one line on the page
 * nobody needed to read, so the mark takes that spot instead.
 */
export function Wordmark({ size = 28 }: { size?: number }) {
  return (
    <span className="flex items-center gap-2">
      <Logomark size={size} accent="var(--accent-protein)" />
      <span className="font-bold tracking-[-0.03em]" style={{ fontSize: size * 0.86 }}>
        do
        <span style={{ color: "var(--accent-protein)" }}>.</span>
        fit
      </span>
    </span>
  );
}
