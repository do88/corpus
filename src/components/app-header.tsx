import { Flame } from "lucide-react";

/**
 * The large title, iOS style.
 *
 * Not a bar. iOS puts the screen's name in the content as oversized type and
 * lets it scroll away, which is why an iPhone app feels roomier than a website
 * with a header. Navigation lives at the bottom in `TabBar`, within thumb
 * reach, so nothing needs to compete up here.
 */
export function AppHeader({
  title,
  caption,
  streak,
}: {
  title: string;
  caption?: string;
  /** Days in a row with something logged. Hidden at zero rather than shown as 0. */
  streak?: number;
}) {
  return (
    <header className="flex items-start justify-between gap-4 px-1 pb-1 pt-2">
      <div className="min-w-0">
        <h1 className="text-[2rem] font-bold leading-tight tracking-[-0.03em]">{title}</h1>
        {caption && (
          <p className="mt-0.5 text-[0.9375rem] text-muted-foreground">{caption}</p>
        )}
      </div>

      {streak !== undefined && streak > 0 && (
        <div
          className="surface flex shrink-0 items-center gap-1 px-2.5 py-1.5"
          style={{ borderRadius: 999 }}
          aria-label={`${streak} day streak`}
        >
          <Flame className="size-4" style={{ color: "var(--ink-energy)" }} aria-hidden />
          <span className="text-sm font-semibold tabular-nums">{streak}</span>
        </div>
      )}
    </header>
  );
}
