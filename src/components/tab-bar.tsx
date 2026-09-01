"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bookmark, ChartColumn, CircleUser, Dumbbell, House, Salad } from "lucide-react";
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
  // Beside the advisor rather than under Account: this is a logging tool, not
  // a setting. The one-tap path lives on Today; this is where the list is kept.
  { href: "/foods", label: "Foods", icon: Bookmark },
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
                {/*
                  An explicit 13px rather than `text-xs`, which this app has
                  lifted to 14 as a floor for *content* type. A tab label is
                  not content: it is two or three repeated words under an icon
                  that also carries the meaning, and at six across a 320px
                  phone the difference is between fitting and not. Left as its
                  own size so that raising the content floor again does not
                  silently overflow the bar.
                */}
                <span className="text-[0.8125rem] font-medium tracking-[0.01em]">
                  {tab.label}
                </span>
                <TabPending />
              </Link>
            );
          })}
        </div>
      </nav>

      {/*
        Desktop: a floating rail, vertically centred so it sits with the
        content rather than at the top of an empty column.

        The labels used to be `title` tooltips, on the reasoning that a column
        of icons reads fine and permanent labels would turn the rail into a
        sidebar competing for width. Half of that was wrong: a tooltip requires
        a hover and a wait to answer "which one is this", which is not a
        question a primary navigation should ask you to work for — and there is
        no hover at all on the phone-sized version of the same problem. Six
        destinations is also past the point where an icon carries a name on its
        own; a bowl and a bookmark are not self-evidently Advisor and Foods.

        The width it costs is real but small, and it comes out of a gutter that
        was empty. `Screen` reserves the extra.
      */}
      <nav
        className="fixed left-5 top-1/2 z-50 hidden -translate-y-1/2 lg:block"
        // Its own name, not the phone bar's: two elements may not share a
        // view-transition-name, and both are in the DOM at once with only a
        // media query deciding which is visible.
        style={{ viewTransitionName: "persistent-rail" }}
        aria-label="Main"
      >
        <div className="surface flex flex-col items-center gap-0.5 p-2" style={{ borderRadius: 26 }}>
          <Link
            href="/"
            aria-label="do.fit — Today"
            className="tappable mb-1 grid size-11 w-16 place-items-center rounded-2xl"
          >
            <Logomark size={22} accent="var(--accent-protein)" />
          </Link>

          <span aria-hidden className="mb-1 h-px w-8 bg-[var(--rule)]" />

          {TABS.map((tab) => {
            const active = isActive(tab.href);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className="tappable relative flex w-16 flex-col items-center gap-1 rounded-2xl py-2 transition-colors"
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
                <span className="text-[0.6875rem] font-medium leading-none tracking-[0.01em]">
                  {tab.label}
                </span>
                <TabPending />
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
