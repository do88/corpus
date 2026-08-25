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
 * Typed here rather than imported: `lib.webworker` does not declare it, and the
 * two properties actually used are the whole surface needed.
 */
type CookieStore = {
  getAll: () => Promise<{ name: string; value: string }[]>;
  set: (options: {
    name: string;
    value: string;
    path?: string;
    domain?: string;
    expires?: number;
    sameSite?: "strict" | "lax" | "none";
  }) => Promise<void>;
};

function cookieStore(): CookieStore | undefined {
  return (globalThis as unknown as { cookieStore?: CookieStore }).cookieStore;
}

/** True inside a service worker: no `window`, so no `document.cookie`. */
function isServiceWorker(): boolean {
  return typeof window === "undefined" && typeof self !== "undefined";
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
        setAll: async (cookies) => {
          if (!store) return;
          // A refreshed token is written back so the next sync does not have to
          // refresh again.
          for (const { name, value, options } of cookies) {
            // Mapped field by field rather than spread: the two APIs disagree
            // on how an expiry is spelled. `cookie`'s options carry a `Date`
            // (or a relative `maxAge`); `cookieStore` wants epoch milliseconds.
            // Spreading compiles to `expires: Date`, which the Cookie Store
            // silently treats as invalid — a session that appears to save and
            // is gone by the next sync.
            await store.set({
              name,
              value,
              // `/` to match what the page writes, or the worker would create a
              // second cookie at a different path and the two would diverge.
              path: options?.path ?? "/",
              domain: options?.domain,
              expires: options?.expires
                ? options.expires.getTime()
                : options?.maxAge
                  ? Date.now() + options.maxAge * 1000
                  : undefined,
              // `cookie` allows a boolean here; the Cookie Store does not.
              sameSite:
                options?.sameSite === true
                  ? "strict"
                  : options?.sameSite === false
                    ? "none"
                    : options?.sameSite,
            });
          }
        },
      },
    });
  }

  return createBrowserClient(url, key);
}
