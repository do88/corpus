import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

/**
 * The same header on both screens: name, navigation, the Bauhaus mark.
 *
 * Navigation is two shadcn Buttons rather than a Tabs bar — Tabs implies
 * panels swapping inside one page, and these are two routes.
 */
export function PageHeader({
  current,
  caption,
}: {
  current: "today" | "training";
  caption?: string;
}) {
  const items = [
    { href: "/", label: "Today", key: "today" },
    { href: "/training", label: "Training", key: "training" },
  ] as const;

  return (
    <header>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <h1 className="text-xl font-bold tracking-tight">Corpus</h1>
          {/* Circle, triangle, square — used once, as a mark. */}
          <span aria-hidden className="flex items-center gap-[3px]">
            <span className="size-1.5 rounded-full bg-mark-red" />
            <span className="size-0 border-x-[3px] border-b-[5px] border-x-transparent border-b-mark-yellow" />
            <span className="size-1.5 bg-mark-blue" />
          </span>
        </div>

        <nav className="flex items-center gap-1">
          {items.map((item) => (
            // Base UI composes with `render`, not shadcn's older `asChild`.
            <Button
              key={item.key}
              size="sm"
              variant={current === item.key ? "secondary" : "ghost"}
              render={
                <Link
                  href={item.href}
                  aria-current={current === item.key ? "page" : undefined}
                />
              }
            >
              {item.label}
            </Button>
          ))}
        </nav>
      </div>

      {caption && <p className="mt-3 text-sm text-muted-foreground">{caption}</p>}
      <Separator className="mt-4" />
    </header>
  );
}
