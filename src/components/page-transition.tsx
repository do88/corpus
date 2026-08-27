import { ViewTransition } from "react";

/**
 * The boundary each screen animates across.
 *
 * One component rather than a wrapper per page, because the decision it
 * encodes is the same everywhere and worth stating once.
 *
 * `default="none"` is load-bearing. Without it every transition anywhere —
 * a Suspense resolving, a background revalidation, a deferred update — fires
 * the browser's default cross-fade, and the screen flickers at moments that
 * have nothing to do with navigation.
 *
 * The transition types are what let one boundary serve several purposes. Each
 * link tags its own navigation, so:
 *
 *   - navigating between tabs cross-fades, because Today, Progress, Training
 *     and Account are peers and a slide would imply a hierarchy that is not
 *     there;
 *   - moving a day at a time *does* slide, and directionally, because the
 *     days are an ordered sequence: tomorrow comes from the right, yesterday
 *     from the left. This is the one place in the app where direction carries
 *     meaning rather than implying a hierarchy;
 *   - a skeleton giving way to its content carries no type, falls through to
 *     `default`, and is not animated at all.
 *
 * That last one used to lift as it fades, and it was wrong. A tab tap fires
 * two transitions, not one: the navigation, and then the Suspense reveal when
 * the data lands a moment later. Animating both meant the page faded in and
 * then immediately slid again — read as a stutter, because it was one.
 *
 * Only a navigation carries a transition type, so keying every animation to a
 * type and leaving `default` at `none` means only navigation animates. The
 * reveal swaps the content in place, which is what it should have been doing:
 * the skeleton and the content occupy the same box by construction, and there
 * is nothing to communicate about a box whose contents were always going to
 * arrive.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition
      enter={{
        tab: "fade-in",
        "day-forward": "slide-from-right",
        "day-back": "slide-from-left",
        default: "none",
      }}
      exit={{
        tab: "fade-out",
        "day-forward": "slide-to-left",
        "day-back": "slide-to-right",
        default: "none",
      }}
      default="none"
    >
      {children}
    </ViewTransition>
  );
}

/**
 * The skeleton's side of the same swap.
 *
 * It only has an exit, and only on a navigation: leaving a tab should take the
 * skeleton with it the same way it takes the page. When the content simply
 * arrives underneath it, the fallback is replaced rather than animated away —
 * see above for why animating that read as a stutter.
 */
export function LoadingTransition({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition exit={{ tab: "fade-out", default: "none" }} default="none">
      {children}
    </ViewTransition>
  );
}
