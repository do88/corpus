import Link from "next/link";

/**
 * Two screens, so two words. A tab bar would be furniture for a choice this
 * small; these sit in the header where the eye already is.
 */
export function Nav({ current }: { current: "today" | "training" }) {
  const items = [
    { href: "/", label: "Today", key: "today" },
    { href: "/training", label: "Training", key: "training" },
  ] as const;

  return (
    <nav className="flex gap-4">
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          aria-current={current === item.key ? "page" : undefined}
          className={`label ${current === item.key ? "!text-foreground" : ""}`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
