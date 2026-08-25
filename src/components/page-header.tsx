import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

/**
 * The same header on both screens: name, navigation, the Bauhaus mark.
 *
 * Navigation is two links wearing shadcn's button styles, rather than a Tabs
 * bar — Tabs implies panels swapping inside one page, and these are two
 * routes. Links rather than Buttons for the same reason: they navigate.
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
            /*
             * A link wearing the button's styles, rather than Base UI's Button
             * rendering a link.
             *
             * The Button primitive is a button all the way down: given a
             * `render` that is not a native `<button>` it warned on every page
             * load, and setting `nativeButton={false}` to quiet it made things
             * worse — that prop tells Base UI to *simulate* button semantics on
             * the element, so these came out as `button "Today"` with no href
             * at all. Silencing the warning cost the thing the warning was
             * about.
             *
             * These are two routes. A link is what they are: real href, real
             * `link` role, middle-click and open-in-new-tab intact, and no
             * button behaviour bolted onto an anchor. `buttonVariants` is
             * exported for exactly this, so the styling stays identical.
             */
            <Link
              key={item.key}
              href={item.href}
              aria-current={current === item.key ? "page" : undefined}
              className={buttonVariants({
                size: "sm",
                variant: current === item.key ? "secondary" : "ghost",
              })}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>

      {caption && <p className="mt-3 text-sm text-muted-foreground">{caption}</p>}
      <Separator className="mt-4" />
    </header>
  );
}
