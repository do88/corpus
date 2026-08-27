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
      <div className="flex items-start justify-between gap-4">
        <h1 className="min-w-0 text-[2.125rem] font-bold leading-tight tracking-[-0.03em]">
          {title}
        </h1>

        {/*
          The streak and the theme toggle used to sit here. They are in the
          layout now — they belong to the app rather than to any one screen,
          and living inside a page meant vanishing every time a page was
          replaced by its skeleton. See `header-controls.tsx`.

          The space they occupied is still reserved, so a long title wraps in
          the same place whether or not the screen has an action of its own.
        */}
        <div className="flex h-9 shrink-0 items-center gap-2 pr-[5.5rem]">{action}</div>
      </div>

      {/*
        Below the row, not beside the badges. It used to share a column with
        the title, which meant a caption competed for width with a streak chip
        and a theme toggle it never sits next to — about 90px of a phone's
        header, spent on nothing. Full width here, it says what it needs on
        one line.
      */}
      {caption && <p className="mt-0.5 text-[1rem] text-muted-foreground">{caption}</p>}
    </header>
  );
}
