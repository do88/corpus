import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { NetworkFirst, NetworkOnly, Serwist } from "serwist";
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
    {
      /*
       * Supabase's data and storage APIs, never cached.
       *
       * `defaultCache` ends with a catch-all cross-origin NetworkFirst holding
       * responses for an hour, which quietly included every PostgREST read.
       * That is wrong twice over. `retryStalePending` asks which meals are
       * still pending; answered from an hour-old cache it re-fires estimates
       * for meals that have long since finished. And a stale read of the day's
       * meals shows numbers that have already changed.
       *
       * Placed before the spread because the first matching entry wins — the
       * same mechanism the auth rule above relies on.
       */
      matcher: ({ url }) =>
        url.pathname.startsWith("/rest/v1/") || url.pathname.startsWith("/storage/v1/"),
      handler: new NetworkOnly(),
    },
    {
      /*
       * Navigations and their RSC payloads, with a timeout.
       *
       * `defaultCache`'s page entries are NetworkFirst with no
       * `networkTimeoutSeconds` — only its API and cross-origin entries set
       * one. Without it, "network first" means waiting out the browser's own
       * connection timeout before falling back to a shell that is already on
       * disk, which is tens of seconds of blank screen on a phone that has
       * signal but no throughput.
       *
       * That is the exact failure `navigationPreload: false` was turned off to
       * avoid, so leaving it unbounded undid the reasoning below. Three seconds
       * is longer than a working connection needs and far shorter than a broken
       * one takes to admit it.
       */
      matcher: ({ request, url, sameOrigin }) =>
        sameOrigin &&
        (request.mode === "navigate" || url.searchParams.has("_rsc")) &&
        !url.pathname.startsWith("/api/"),
      handler: new NetworkFirst({
        cacheName: "pages",
        networkTimeoutSeconds: 3,
      }),
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
