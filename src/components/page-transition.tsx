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
 * The `tab` key is what lets one boundary serve two purposes. Tab links tag
 * their navigation with that transition type, so:
 *
 *   - navigating between tabs cross-fades, because Today, Progress, Training
 *     and Account are peers and a slide would imply a hierarchy that is not
 *     there;
 *   - a skeleton giving way to its content carries no type, falls through to
 *     `default`, and lifts as it fades — which reads as data arriving rather
 *     than as a page changing.
 *
 * The two never collide because they happen at different moments.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition
      enter={{ tab: "fade-in", default: "slide-up" }}
      exit={{ tab: "fade-out", default: "none" }}
      default="none"
    >
      {children}
    </ViewTransition>
  );
}

/**
 * The skeleton's side of the same swap.
 *
 * It only has an exit: the fallback is already on screen when the content
 * arrives, so it sinks and fades as the content lifts into its place. On a tab
 * navigation it fades instead, matching the page it belongs to — otherwise
 * changing tab would slide the skeleton downward for no reason.
 */
export function LoadingTransition({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition exit={{ tab: "fade-out", default: "slide-down" }} default="none">
      {children}
    </ViewTransition>
  );
}
