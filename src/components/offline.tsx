"use client";

import { useEffect } from "react";
import { SerwistProvider } from "@serwist/next/react";
import { OUTBOX_TAG } from "@/lib/outbox/tag";

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
    <SerwistProvider swUrl="/sw.js" register reloadOnOnline={false}>
      <RegisterBackgroundSync />
      {children}
    </SerwistProvider>
  );
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
