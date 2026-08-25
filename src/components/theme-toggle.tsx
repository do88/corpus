"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun, SunMoon } from "lucide-react";

/**
 * Cycles system → light → dark → system.
 *
 * Three states rather than a two-way switch, because "follow the phone" is a
 * real preference and not the same as either fixed choice — losing it would
 * mean the app stops going dark at night unless you tell it to twice a day.
 * The icon says which of the three is active rather than what tapping will do,
 * which is the only version people read correctly.
 *
 * `mounted` guards the first paint: the resolved theme is unknown on the
 * server, so rendering a sun that flips to a moon on hydration is a visible
 * flicker on every load. An empty box of the same size holds the space.
 *
 * Via `useSyncExternalStore` rather than `useState` in an effect — the server
 * snapshot is `false` and the client's is `true`, which is the same shape the
 * dictation check uses, and it keeps React 19's ban on setting state from an
 * effect intact.
 */
const ORDER = ["system", "light", "dark"] as const;

const LABEL = {
  system: "Following your device",
  light: "Light",
  dark: "Dark",
} as const;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const current = (ORDER as readonly string[]).includes(theme ?? "") ? theme! : "system";
  const Icon = current === "light" ? Sun : current === "dark" ? Moon : SunMoon;

  if (!mounted) return <div className="size-9 shrink-0" aria-hidden />;

  return (
    <button
      type="button"
      onClick={() => setTheme(ORDER[(ORDER.indexOf(current as never) + 1) % ORDER.length])}
      className="surface tappable grid size-9 shrink-0 place-items-center text-muted-foreground"
      style={{ borderRadius: 999 }}
      aria-label={`Theme: ${LABEL[current as keyof typeof LABEL]}. Tap to change.`}
    >
      <Icon className="size-[1.1rem]" />
    </button>
  );
}
