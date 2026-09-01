import { WifiOff } from "lucide-react";
import { Screen } from "@/components/screen";

/**
 * What gets shown when a page cannot be reached and has never been cached.
 *
 * The service worker's story was that the app opens with no signal. That was
 * only true of pages you had already opened *with* signal: the precache holds
 * scripts, styles and icons and not one document, so a navigation that missed
 * both the network and the runtime cache had nothing to be answered with. The
 * strategy threw, and the browser showed its own "site can't be reached" —
 * which, for something installed to a home screen, reads as the app being
 * broken rather than the kitchen having thick walls.
 *
 * So there is a document to fall back to now. It is deliberately the plainest
 * page in the app: it must render from the precache alone, so it asks nothing
 * of the network, the session, or the database.
 *
 * Nothing queued is lost while this is on screen. Meals logged offline sit in
 * the outbox and send themselves when the signal returns, which is the one
 * thing worth saying here.
 */
/*
 * No `dynamic = "force-static"` here: Cache Components rejects the segment
 * config outright, and it would be redundant anyway. This page reads no
 * cookies, no session and no database, so there is nothing to make it dynamic
 * and its shell prerenders on its own.
 */
export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <Screen>
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <div
          className="flex size-14 items-center justify-center rounded-full"
          style={{ background: "var(--muted)" }}
        >
          <WifiOff className="size-6 text-muted-foreground" aria-hidden />
        </div>
        <div className="space-y-1.5">
          <h1 className="text-xl font-semibold tracking-[-0.01em]">No connection</h1>
          <p className="mx-auto max-w-xs text-sm leading-relaxed text-muted-foreground">
            This page has not been opened on this device yet, so there is no copy to
            show. Anything you logged while offline is queued and will send itself.
          </p>
        </div>
      </div>
    </Screen>
  );
}
