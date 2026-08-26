"use client";

import { useEffect } from "react";
import { SerwistProvider } from "@serwist/next/react";
import { OUTBOX_TAG } from "@/lib/outbox/tag";

const SERVICE_WORKER_ENABLED = process.env.NODE_ENV === "production";
let developmentResetStarted = false;

/**
 * Registers the service worker, and asks Android to wake it when signal
 * returns.
 *
 * Background Sync is the only flush trigger that works with the app closed —
 * a meal logged in a basement, the phone pocketed, nobody looking at it again
 * for an hour. Chromium only, which is where this app lives; everywhere else
 * the registration quietly does nothing and the other two triggers (opening the
 * app, the `online` event) carry it.
 */
export function Offline({ children }: { children: React.ReactNode }) {
  return (
    <SerwistProvider
      swUrl="/sw.js"
      disable={!SERVICE_WORKER_ENABLED}
      register
      reloadOnOnline={false}
    >
      {SERVICE_WORKER_ENABLED ? <RegisterBackgroundSync /> : <ResetDevelopmentWorker />}
      {children}
    </SerwistProvider>
  );
}

/**
 * A production build leaves `public/sw.js` on disk. Next dev serves that file,
 * so merely disabling the Serwist webpack plugin is not enough: a previously
 * registered worker keeps controlling localhost and asks for the old build's
 * hashed assets. Remove it once and reload the controlled page cleanly.
 */
function ResetDevelopmentWorker() {
  useEffect(() => {
    if (developmentResetStarted || !("serviceWorker" in navigator)) return;
    developmentResetStarted = true;

    void (async () => {
      const wasControlled = navigator.serviceWorker.controller !== null;
      const registrations = await navigator.serviceWorker.getRegistrations();
      if (registrations.length === 0) return;

      await Promise.all(registrations.map((registration) => registration.unregister()));

      if ("caches" in window) {
        const names = await caches.keys();
        await Promise.all(
          names
            .filter((name) => /serwist|precache|workbox/i.test(name))
            .map((name) => caches.delete(name)),
        );
      }

      // Unregistering stops the next navigation from being controlled; it does
      // not release the current page. One reload completes that transition.
      if (wasControlled) window.location.reload();
    })().catch((error) => {
      console.warn("[offline] Could not clear the development service worker", error);
    });
  }, []);

  return null;
}

function RegisterBackgroundSync() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    // `ready` resolves once a worker is controlling the page — the provider
    // above does the registering, this only needs the result of it.
    void navigator.serviceWorker.ready
      .then((registration) => {
        const withSync = registration as ServiceWorkerRegistration & {
          sync?: { register: (tag: string) => Promise<void> };
        };
        return withSync.sync?.register(OUTBOX_TAG);
      })
      .catch(() => {
        // Denied, unsupported, or simply not Chromium. Not a failure: the app
        // already flushes on open and on `online`.
      });
  }, []);

  return null;
}
