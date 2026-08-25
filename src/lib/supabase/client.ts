import { createBrowserClient } from "@supabase/ssr";

/**
 * The browser's Supabase client — auth, Storage uploads and Realtime.
 *
 * Carries the publishable key, so every request arrives as the signed-in user
 * and RLS decides what it can see. That is the whole security model: the key is
 * public by design, the policy is what protects the data.
 *
 * Works in the service worker as well as the page, which it did not before —
 * see below.
 */

/**
 * The Cookie Store API, which service workers have and `document.cookie` is not.
 *
 * Typed here rather than imported: `lib.webworker` does not declare it, and
 * `getAll` is the whole surface used. `set` is deliberately absent — the worker
 * reads cookies and never writes them, for the reason spelled out below, and
 * leaving the method off the type makes that unavailable rather than merely
 * discouraged.
 */
type CookieStore = {
  getAll: () => Promise<{ name: string; value: string }[]>;
};

function cookieStore(): CookieStore | undefined {
  return (globalThis as unknown as { cookieStore?: CookieStore }).cookieStore;
}

/**
 * True inside a service worker: no `window`, so no `document.cookie`.
 *
 * A runtime `in` check on `globalThis`, and it has to be. The obvious version —
 * `typeof window === "undefined"` — reads correctly and does not survive the
 * build: webpack's DefinePlugin constant-folds `typeof window` to `"object"`
 * for the web target, so the comparison became `false` at compile time and the
 * entire worker branch below was removed as dead code.
 *
 * That is a nasty way to fail, because the source stays right while the bundle
 * quietly reverts to the broken behaviour, and the only symptom is the silent
 * one this whole file exists to fix. Caught by grepping the built worker for
 * `cookieStore` and finding nothing.
 *
 * `"X" in globalThis` is a property lookup on a live object, so there is
 * nothing for the bundler to fold.
 */
function isServiceWorker(): boolean {
  return "ServiceWorkerGlobalScope" in globalThis;
}

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

  /**
   * In the service worker, the session has to be read through `cookieStore`.
   *
   * This is a bug fix, not a nicety, and the failure it corrects was silent.
   * `@supabase/ssr` decides how to reach cookies with an `isBrowser()` check
   * that requires both `window` and `window.document`. A service worker has
   * neither, so it took the non-browser branch, where `getAll` is hardcoded to
   * return `[]`. No cookies meant no session, `flushOutbox` returned
   * `{ sent: 0 }` at its session guard, and **Background Sync never sent a
   * single meal** — the one trigger that is supposed to work with the app
   * closed, which is the case the outbox exists for.
   *
   * Nothing surfaced it because the other two triggers cover for it: open the
   * app and it flushes immediately, so the queue is always empty by the time
   * anyone looks.
   *
   * Passing the accessors explicitly puts the SDK back in charge of the parts
   * worth not reimplementing — the chunked cookie format, and refreshing an
   * access token that expired while the phone was in a pocket.
   *
   * `cookieStore` is Chromium-only, which is exactly where Background Sync
   * exists, so this covers the whole of where the feature is real.
   */
  if (isServiceWorker()) {
    const store = cookieStore();
    if (!store) {
      // Not fatal: the page's own triggers still flush, and the reconciler
      // still sweeps. Worth a line in the log rather than a silent no-op,
      // which is what this whole comment is about.
      console.warn("[outbox] no cookieStore in this worker — background sync cannot authenticate");
    }

    return createBrowserClient(url, key, {
      isSingleton: false,
      cookies: {
        getAll: async () => (store ? await store.getAll() : []),
        /**
         * Deliberately does nothing, and this is the important half.
         *
         * Giving the worker cookie *reads* fixed Background Sync. Giving it
         * cookie *writes* broke sign-in, which is a worse trade than it looks.
         *
         * `getSession()` does more than read. If it finds a session in storage
         * that is expired or malformed it calls `_removeSession()`, and that
         * runs `removeAllPKCEVerifiers()` — wiping every
         * `…-code-verifier` cookie. The worker flushes the outbox on a
         * Background Sync event, which can fire at any moment, including the
         * thirty seconds you spend on Google's consent screen. Come back, and
         * the verifier your sign-in was about to exchange has been deleted by
         * your own service worker. The error even tells you the storage was
         * cleared; it just cannot say who cleared it.
         *
         * So the worker reads and never writes. A token it refreshes is not
         * persisted, which costs one refresh next time the page opens, and in
         * exchange a background process can no longer sign you out or
         * invalidate a sign-in that is in flight. Nothing running with nobody
         * watching should be able to do either.
         */
        setAll: async () => {},
      },
    });
  }

  return createBrowserClient(url, key);
}
