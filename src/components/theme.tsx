"use client";

import { ThemeProvider } from "next-themes";

/**
 * Follows the phone's own light/dark setting.
 *
 * There is no toggle, deliberately — the design has one accent mark in the
 * header and a switch beside it would be the second thing competing for the
 * eye. next-themes rather than a `prefers-color-scheme` block because the dark
 * tokens are already written against `.dark`; a media query would mean keeping
 * two copies of the palette in step. It also leaves an explicit choice one prop
 * away if it ever earns its place.
 */
export function Theme({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </ThemeProvider>
  );
}
