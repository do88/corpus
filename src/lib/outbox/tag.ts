/**
 * The Background Sync tag, shared by the page that registers the sync and the
 * service worker that answers it.
 *
 * Its own module because the worker cannot import from a client component and
 * the client component cannot import from the worker — a shared constant is the
 * only thing both may safely reach.
 */
export const OUTBOX_TAG = "corpus-outbox";
