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
  decorative = false,
}: {
  size?: number;
  /** A CSS colour for the dot. Omit for a single-colour mark. */
  accent?: string;
  className?: string;
  /**
   * Hide it from screen readers, for when the name is already written beside
   * it. `Wordmark` is exactly that case: labelled, it announced "do.fit
   * do.fit", and that now sits at the top of every screen rather than one.
   */
  decorative?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": "do.fit" })}
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
 * The mark beside the name. It stands at the top of every screen.
 *
 * It used to be Today's alone, because Today's title was the date and the date
 * was already stated three times below it. Every other screen carried its own
 * name in thirty-four point type — which is a website habit: a website needs a
 * title because you might have arrived from anywhere, and an app does not
 * because you tapped the tab that says where you are, and it is still lit at
 * the bottom of the screen. The name was answering a question nobody had.
 *
 * So the mark takes that row everywhere and the screens are told apart by the
 * tab bar and by what they contain. The names still exist for anyone who
 * cannot see either — see `AppHeader`.
 */
export function Wordmark({ size = 28 }: { size?: number }) {
  return (
    <span className="flex items-center gap-2">
      <Logomark size={size} accent="var(--accent-protein)" decorative />
      <span className="font-bold tracking-[-0.03em]" style={{ fontSize: size * 0.86 }}>
        do
        <span style={{ color: "var(--accent-protein)" }}>.</span>
        fit
      </span>
    </span>
  );
}
