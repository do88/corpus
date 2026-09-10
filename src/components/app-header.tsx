import { Wordmark } from "@/components/brand";

/**
 * The mark, and what the screen wants to say under it.
 *
 * Not a bar, and no longer a title either. iOS puts the screen's name in the
 * content as oversized type, and that was the pattern here — but a title is a
 * website's answer to "where am I", and an app already answered it: you tapped
 * the tab, and the tab is still lit at the bottom of the screen. "Progress" in
 * thirty-four point type above a page of progress was restating the one thing
 * you could not be unsure about, and taking the top of every screen to do it.
 *
 * So the mark stands there instead — the same row on every screen, which is
 * what makes it read as one app rather than five pages. There was a caption
 * under it for a while, saying how much was left or how many foods there
 * were, and it went the same way as the title: every one of those sentences
 * restated the card immediately below it.
 *
 * The name does not disappear, it stops being *drawn*. It stays in the `h1` for
 * anyone navigating by headings or landing here from a screen reader's rotor,
 * who has no lit tab to look at — which is the one audience the visible title
 * was genuinely serving.
 */
export function AppHeader({
  name,
  action,
}: {
  /**
   * The screen's name, announced but not drawn. Still required: a page whose
   * only heading is a logo tells a screen reader which app it is and nothing
   * about where it is.
   */
  name: string;
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
        to about 164px. Reserving less looked fine until a screen also had an
        action, at which point "Today" was drawn on top of "Wednesday".
      */}
      <div className="flex items-start gap-4">
        <h1 className="min-w-0 leading-tight">
          <Wordmark size={30} />
          <span className="sr-only">{name}</span>
        </h1>
        <span aria-hidden className="h-9 w-[10.25rem] shrink-0" />
      </div>

      {/*
        The caption and the screen's own action share the second row. The
        action used to sit in the title row beside the persistent controls,
        where it competed with the title for the width those controls leave —
        on a phone, "Today" and "Wednesday" ended up in the same place. Down
        here it sits at the end of "8 days ago", which is the sentence it
        answers, with the whole width to itself.
      */}
      {/*
        The screen's own control, on its own row.

        There was a caption here too — how much was left, how many foods —
        and it went because it was restating what the screen below already
        said in full. A subtitle that summarises the card underneath it is a
        row of the screen spent on nothing.
      */}
      {action && <div className="mt-2 flex items-center justify-end">{action}</div>}
    </header>
  );
}
