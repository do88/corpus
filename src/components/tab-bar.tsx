"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChartColumn, CircleUser, Dumbbell, House, Salad } from "lucide-react";
import { Logomark } from "@/components/brand";
import { TabPending } from "@/components/tab-pending";

/**
 * Navigation, in two shapes.
 *
 * **On a phone** it is the bottom tab bar — the single biggest tell that
 * something is an app rather than a page. Fixed, frosted, and padded for the
 * home indicator via `safe-area-inset`; without that inset the labels sit under
 * the gesture bar on any modern iPhone.
 *
 * **On a desktop** the same destinations become a floating rail down the
 * left. A bottom bar on a 1440px screen is wrong twice over: the controls are
 * a mouse-journey away from the content, and pinning anything to the bottom
 * edge of a large window is a phone idiom that reads as a mistake. The rail
 * floats rather than filling the edge — it is the same card material as
 * everything else, so the layout stays one system rather than two.
 *
 * One component rather than two rendered conditionally, because the active-tab
 * logic and the route list are the parts worth not duplicating; only the
 * container and the label placement differ.
 */
const TABS = [
  { href: "/", label: "Today", icon: House },
  // Next to Today because the two are both about right now — one records the
  // hour just gone, the other decides the next one.
  { href: "/advisor", label: "Advisor", icon: Salad },
  { href: "/progress", label: "Progress", icon: ChartColumn },
  { href: "/training", label: "Training", icon: Dumbbell },
  { href: "/account", label: "Account", icon: CircleUser },
] as const;

export function TabBar() {
  const pathname = usePathname();

  // Nothing to navigate to before you are signed in, and a tab bar over a
  // login screen advertises destinations that would all bounce straight back
  // here. It lives in the root layout, so hiding it is its own job.
  if (pathname.startsWith("/login") || pathname.startsWith("/auth")) return null;

  // `/` must match exactly or it would light up on every route.
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <>
      {/* Phone: bottom bar. Hidden once there is room for the rail. */}
      <nav
        className="frosted fixed inset-x-0 bottom-0 z-50 border-t border-[var(--rule)] lg:hidden"
        // Pulled out of the page's transition snapshot: the bar is on screen
        // before and after every navigation, so animating it would be animating
        // something that never moved.
        style={{
          paddingBottom: "env(safe-area-inset-bottom)",
          viewTransitionName: "persistent-nav",
        }}
        aria-label="Main"
      >
        <div className="mx-auto flex w-full max-w-md items-stretch">
          {TABS.map((tab) => {
            const active = isActive(tab.href);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                // Lateral: these four are peers, so the page cross-fades
                // rather than sliding. See `page-transition.tsx`.
                transitionTypes={["tab"]}
                aria-current={active ? "page" : undefined}
                className="tappable relative flex flex-1 flex-col items-center gap-1 py-2 pt-2.5"
                style={{ color: active ? "var(--ink-protein)" : "var(--muted-foreground)" }}
              >
                <Icon
                  className="size-[1.4rem]"
                  // Heavier when active — the iOS convention, and it carries the
                  // state without relying on colour alone.
                  strokeWidth={active ? 2.4 : 1.9}
                  aria-hidden
                />
                <span className="text-[0.8125rem] font-medium tracking-[0.01em]">
                  {tab.label}
                </span>
                <TabPending />
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Desktop: a floating rail, vertically centred so it sits with the
          content rather than at the top of an empty column. */}
      <nav
        className="fixed left-5 top-1/2 z-50 hidden -translate-y-1/2 lg:block"
        // Its own name, not the phone bar's: two elements may not share a
        // view-transition-name, and both are in the DOM at once with only a
        // media query deciding which is visible.
        style={{ viewTransitionName: "persistent-rail" }}
        aria-label="Main"
      >
        <div className="surface flex flex-col items-center gap-1 p-2" style={{ borderRadius: 26 }}>
          <Link
            href="/"
            aria-label="do.fit — Today"
            className="tappable mb-1 grid size-11 place-items-center rounded-2xl"
          >
            <Logomark size={22} accent="var(--accent-protein)" />
          </Link>

          <span aria-hidden className="mb-1 h-px w-7 bg-[var(--rule)]" />

          {TABS.map((tab) => {
            const active = isActive(tab.href);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                // Lateral: these four are peers, so the page cross-fades
                // rather than sliding. See `page-transition.tsx`.
                transitionTypes={["tab"]}
                aria-current={active ? "page" : undefined}
                // The label is a tooltip rather than always-on: a column of
                // icons in a 56px rail reads fine, and permanent labels would
                // make it a sidebar competing with the content for width.
                title={tab.label}
                className="tappable relative grid size-11 place-items-center rounded-2xl transition-colors"
                style={
                  active
                    ? {
                        background:
                          "color-mix(in oklch, var(--accent-protein) 14%, transparent)",
                        color: "var(--ink-protein)",
                      }
                    : { color: "var(--muted-foreground)" }
                }
              >
                <Icon className="size-[1.3rem]" strokeWidth={active ? 2.4 : 1.9} aria-hidden />
                <span className="sr-only">{tab.label}</span>
                <TabPending />
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
