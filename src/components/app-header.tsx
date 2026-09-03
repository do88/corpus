/**
 * The large title, iOS style.
 *
 * Not a bar. iOS puts the screen's name in the content as oversized type and
 * lets it scroll away, which is why an iPhone app feels roomier than a website
 * with a header. Navigation lives at the bottom in `TabBar`, within thumb
 * reach, so nothing needs to compete up here.
 */
export function AppHeader({
  title,
  caption,
  action,
}: {
  /** A node, not a string, so a screen can shorten its own title on a phone. */
  title: React.ReactNode;
  caption?: string;
  /**
   * A screen-specific control, beside the persistent ones.
   *
   * Today uses it for the way back to the current day. It lives up here
   * rather than above the day strip because the header is where the screen
   * already says which day you are on — putting the escape beside that
   * statement is one idea in one place, and it costs no row of its own.
   */
  action?: React.ReactNode;
}) {
  return (
    <header className="px-1 pb-1 pt-2">
      {/*
        The persistent controls — streak, theme, account — are drawn over this
        row by the layout (see `header-controls.tsx`), so the title reserves
        their full width: a streak pill, the theme toggle and the avatar come
        to about 140px. Reserving less looked fine until a screen also had an
        action, at which point "Today" was drawn on top of "Wednesday".
      */}
      <div className="flex items-start gap-4">
        <h1 className="min-w-0 text-[2.125rem] font-bold leading-tight tracking-[-0.03em]">
          {title}
        </h1>
        <span aria-hidden className="h-9 w-[8.75rem] shrink-0" />
      </div>

      {/*
        The caption and the screen's own action share the second row. The
        action used to sit in the title row beside the persistent controls,
        where it competed with the title for the width those controls leave —
        on a phone, "Today" and "Wednesday" ended up in the same place. Down
        here it sits at the end of "8 days ago", which is the sentence it
        answers, with the whole width to itself.
      */}
      {(caption || action) && (
        <div className="mt-0.5 flex items-center justify-between gap-3">
          {caption ? (
            <p className="min-w-0 text-[1rem] text-muted-foreground">{caption}</p>
          ) : (
            <span />
          )}
          {action && <div className="flex shrink-0 items-center">{action}</div>}
        </div>
      )}
    </header>
  );
}
