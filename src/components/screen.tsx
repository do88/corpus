/**
 * The column every screen is poured into.
 *
 * It was written out at all ten call sites — five pages and five loading
 * files — and had already drifted: the account skeleton was `lg:max-w-4xl`
 * while the account page was `lg:max-w-2xl`, so the placeholder stood in at
 * the wrong width and the column jumped when the real thing arrived. That is
 * the ordinary cost of a copied class list, and the reason to name it once.
 *
 * `pb-28` clears the phone's tab bar; without it the last card hides behind
 * it. `lg:pl-28` clears the desktop rail, which carries labels and is
 * therefore wider than the icons alone would need.
 */
/**
 * One width for every screen.
 *
 * There were two — a wide one for the screens with four metric cards and a
 * narrower one for the screens without — and on a desktop the difference just
 * read as pages that could not agree how big they were. Moving between tabs
 * resized the column under you, which is a worse cost than a little extra room
 * around a single column of prose.
 */
const COLUMN =
  "mx-auto w-full max-w-md px-5 pb-28 pt-4 lg:max-w-4xl lg:pb-12 lg:pl-28 lg:pt-8";

/**
 * A page: the column.
 *
 * There used to be a React `<ViewTransition>` around this, and it never once
 * fired. Cache Components keeps visited routes mounted through React's
 * `<Activity>` — measured, three `<main>` elements in the document at the same
 * time — so a boundary wrapped around a page is never inserted or removed. Its
 * `enter` and `exit` are for mounting, and nothing here mounts.
 *
 * The animation lives in CSS instead, keyed to the transition type with
 * `:active-view-transition-type()`. That matches on the transition rather than
 * on a component's lifecycle, which is the only thing that still happens.
 */
export function Screen({ children }: { children: React.ReactNode }) {
  return <main className={COLUMN}>{children}</main>;
}

/** A page's skeleton. Same column, so nothing shifts when content replaces it. */
export function LoadingScreen({ children }: { children: React.ReactNode }) {
  return <main className={COLUMN}>{children}</main>;
}
