"use client";

import { ThemeProvider } from "next-themes";

/**
 * Follows the phone's own light/dark setting, unless told otherwise.
 *
 * `ThemeToggle` in the header cycles system → light → dark, and `system` stays
 * the default: on a phone that switches at sunset, inheriting is the setting
 * most people want and the one they never have to think about.
 *
 * next-themes rather than a bare `prefers-color-scheme` block because the dark
 * tokens are written against `.dark` — a media query would mean keeping two
 * copies of the palette in step — and because a manual override needs somewhere
 * to persist.
 */
export function Theme({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </ThemeProvider>
  );
}
