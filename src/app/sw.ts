import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { NetworkOnly, Serwist } from "serwist";
import { flushOutbox } from "@/lib/outbox/sync";
import { OUTBOX_TAG } from "@/lib/outbox/tag";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

/**
 * The service worker: what makes the app open with no signal, and what lets a
 * queued meal send itself while the app is closed.
 *
 * `navigationPreload` is off deliberately. It races the network against the
 * cache for navigations, which is the right default for a content site and the
 * wrong one here — on a bad connection the race is what produces a spinner
 * rather than a page.
 */
const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: false,
  runtimeCaching: [
    {
      /*
       * Anything to do with signing in goes straight to the network, cached
       * never. This is not an optimisation, it is a bug fix: the default
       * navigation strategy tried to serve the OAuth callback, met a redirect
       * it could not follow, and had no fallback — so the browser showed "this
       * page couldn't load" on a sign-in that was otherwise fine. Auth
       * responses are single-use and redirect-heavy; a cache has no business
       * anywhere near them.
       */
      matcher: ({ url }) =>
        url.pathname.startsWith("/auth") ||
        url.pathname.startsWith("/login") ||
        url.searchParams.has("code"),
      handler: new NetworkOnly(),
    },
    ...defaultCache,
  ],
});

/**
 * Background Sync: Android fires this when connectivity returns, even with the
 * app closed. It is the only trigger that works when nobody is looking, which
 * is exactly the case the outbox exists for — a meal logged in a basement and
 * then forgotten about.
 *
 * It is not reliable on its own: it does not fire in every state, and it does
 * not exist outside Chromium. The app also flushes on open and on the `online`
 * event, and the server-side reconciler catches whatever still falls through.
 * Three cheap triggers beat one clever one.
 */
self.addEventListener("sync", (event) => {
  const sync = event as SyncEvent;
  if (sync.tag !== OUTBOX_TAG) return;
  sync.waitUntil(flushOutbox());
});

type SyncEvent = ExtendableEvent & { tag: string };

serwist.addEventListeners();
