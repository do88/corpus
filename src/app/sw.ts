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
       * Navigations and their RSC payloads: the network, with the last copy
       * seen as a fallback.
       *
       * `defaultCache`'s page entries are NetworkFirst with no
       * `networkTimeoutSeconds`, so "network first" meant waiting out the
       * browser's own connection timeout before falling back — tens of seconds
       * of blank screen on a phone with signal but no throughput. A bound is
       * needed. The question is how tight.
       *
       * It was three seconds, argued as "longer than a working connection
       * needs". That was measured from a laptop on wifi against a warm edge,
       * and it is not what a phone cold-opening a home-screen app sees: the
       * radio waking, TLS, and a Netlify function that has to start before it
       * can render the authenticated page. The result was a PWA that opened
       * on yesterday — the cache won the race, and a document rendered before
       * midnight was served as this morning.
       *
       * Ten seconds. On a working connection the network still answers first,
       * every time; the cache is now genuinely a fallback for no signal rather
       * than a shortcut taken on a slow one. The page itself also checks the
       * date on open and re-renders if it is stale (see `Today`), so even a
       * cached copy that does get served corrects itself.
       */
      matcher: ({ request, url, sameOrigin }) =>
        sameOrigin &&
        (request.mode === "navigate" || url.searchParams.has("_rsc")) &&
        !url.pathname.startsWith("/api/"),
      handler: new NetworkFirst({
        cacheName: "pages",
        networkTimeoutSeconds: 10,
      }),
    },
    ...defaultCache,
  ],
  /*
   * Something to answer a navigation with when nothing else can.
   *
   * Live threw `no-response` on the root and the browser showed its own error
   * page. The reason is visible in the caches: the precache holds forty-eight
   * entries and not one of them is a document. So a navigation that missed the
   * network and found nothing in `pages` — a first visit, a URL not opened
   * before, a dead connection — left `NetworkFirst` with no response to give,
   * and a strategy with no response to give throws.
   *
   * That made the claim above only half true. The app opened with no signal
   * for pages already opened with signal, and showed a browser error for the
   * rest, which on a home-screen icon reads as the app being broken.
   *
   * `/offline` is static and precached, so it can always be served. It is a
   * last resort and stays behind the runtime cache: a real page already on
   * disk is a better answer than a message about not having one.
   */
  fallbacks: {
    entries: [
      {
        url: "/offline",
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
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
