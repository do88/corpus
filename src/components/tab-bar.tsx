"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dumbbell, House } from "lucide-react";

/**
 * The bottom tab bar — the single biggest tell that something is an app rather
 * than a page.
 *
 * Fixed, frosted, and padded for the home indicator via `safe-area-inset`.
 * Without that inset the labels sit under the gesture bar on any modern iPhone,
 * which is the detail people notice without being able to name.
 *
 * Two routes, so two tabs. The composer is not a third: logging happens inline
 * on Today rather than behind a modal, so a centre "+" would open the screen
 * you are already looking at.
 */
const TABS = [
  { href: "/", label: "Today", icon: House },
  { href: "/training", label: "Training", icon: Dumbbell },
] as const;

export function TabBar() {
  const pathname = usePathname();

  // Nothing to navigate to before you are signed in, and a tab bar over a
  // login screen advertises two destinations that would both bounce straight
  // back here. It lives in the root layout, so hiding it is its own job.
  if (pathname.startsWith("/login") || pathname.startsWith("/auth")) return null;

  return (
    <nav
      className="frosted fixed inset-x-0 bottom-0 z-50 border-t border-[var(--rule)]"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Main"
    >
      <div className="mx-auto flex w-full max-w-md items-stretch">
        {TABS.map((tab) => {
          // `/` must match exactly or it would light up on every route.
          const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
          const Icon = tab.icon;

          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className="tappable flex flex-1 flex-col items-center gap-1 py-2 pt-2.5"
              style={{ color: active ? "var(--ink-protein)" : "var(--muted-foreground)" }}
            >
              <Icon
                className="size-[1.4rem]"
                // Filled when active, outlined when not — the iOS convention,
                // and it carries the state without relying on colour alone.
                strokeWidth={active ? 2.4 : 1.9}
                aria-hidden
              />
              <span className="text-[0.6875rem] font-medium tracking-[0.01em]">
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
