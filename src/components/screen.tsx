import { LoadingTransition, PageTransition } from "@/components/page-transition";

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
 * it. `lg:pl-24` clears the desktop rail.
 */
const WIDTH = {
  /** Four metric cards side by side, or a chart worth the room. */
  wide: "lg:max-w-4xl",
  /** A single column of prose and controls, which 4xl would strand. */
  narrow: "lg:max-w-2xl",
} as const;

type Width = keyof typeof WIDTH;

function column(width: Width) {
  return `mx-auto w-full max-w-md px-5 pb-28 pt-4 ${WIDTH[width]} lg:pb-12 lg:pl-24 lg:pt-8`;
}

/** A page: the column, inside the boundary that animates between routes. */
export function Screen({
  children,
  width = "wide",
}: {
  children: React.ReactNode;
  width?: Width;
}) {
  return (
    <PageTransition>
      <main className={column(width)}>{children}</main>
    </PageTransition>
  );
}

/**
 * A page's skeleton. Same column, so nothing shifts when the real content
 * replaces it — which is the whole job of a loading state.
 */
export function LoadingScreen({
  children,
  width = "wide",
}: {
  children: React.ReactNode;
  width?: Width;
}) {
  return (
    <LoadingTransition>
      <main className={column(width)}>{children}</main>
    </LoadingTransition>
  );
}
