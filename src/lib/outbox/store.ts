import { openDB, type DBSchema, type IDBPDatabase } from "idb";

/**
 * The outbox: meals captured on the phone that have not reached the server yet.
 *
 * IndexedDB rather than localStorage for one reason — it stores the photo as a
 * Blob. localStorage only holds strings, so a photo would have to be base64,
 * which is a third larger and has to be decoded on every read.
 *
 * A meal lives here from the moment it is captured until the server confirms
 * it, and it is written *before* any network call is attempted. The order is
 * the whole point: a meal logged in a basement is already saved, and sending is
 * something that happens to it later.
 */

export type OutboxMeal = {
  /** Minted on the phone, so the same meal keeps its identity across retries. */
  clientId: string;
  loggedAt: string;
  localDate: string;
  note: string;
  photo?: Blob;
  attempts: number;
  lastError?: string;
};

interface OutboxDB extends DBSchema {
  meals: {
    key: string;
    value: OutboxMeal;
    indexes: { loggedAt: string };
  };
}

let database: Promise<IDBPDatabase<OutboxDB>> | null = null;

function db() {
  database ??= openDB<OutboxDB>("corpus-outbox", 1, {
    upgrade(instance) {
      const store = instance.createObjectStore("meals", { keyPath: "clientId" });
      store.createIndex("loggedAt", "loggedAt");
    },
  });
  return database;
}

export async function enqueue(meal: OutboxMeal): Promise<void> {
  await (await db()).put("meals", meal);
  await refresh();
}

export async function pending(): Promise<OutboxMeal[]> {
  return (await db()).getAllFromIndex("meals", "loggedAt");
}

export async function remove(clientId: string): Promise<void> {
  await (await db()).delete("meals", clientId);
  await refresh();
}

/** Record a failed send without losing the meal. */
export async function markFailed(clientId: string, error: string): Promise<void> {
  const instance = await db();
  const meal = await instance.get("meals", clientId);
  if (!meal) return;
  await instance.put("meals", { ...meal, attempts: meal.attempts + 1, lastError: error });
  await refresh();
}

export async function count(): Promise<number> {
  return (await db()).count("meals");
}

/* ------------------------------------------------------- subscribing to it */

/**
 * The outbox as an external store, for `useSyncExternalStore`.
 *
 * React 19 rejects setting state synchronously inside an effect, and a
 * component that mirrored IndexedDB into `useState` would do exactly that. This
 * is what the hook is for: IndexedDB is the source of truth, the snapshot is a
 * cached view of it, and components read the view.
 *
 * `getSnapshot` must return a stable reference between changes or React
 * re-renders forever, so the array is only replaced in `refresh`.
 */
let snapshot: OutboxMeal[] = [];
const listeners = new Set<() => void>();

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): OutboxMeal[] {
  return snapshot;
}

/** There is no outbox on the server, and the reference must be stable. */
const EMPTY: OutboxMeal[] = [];
export function getServerSnapshot(): OutboxMeal[] {
  return EMPTY;
}

/** Re-read IndexedDB and tell everyone watching. */
export async function refresh(): Promise<OutboxMeal[]> {
  snapshot = await pending();
  for (const listener of listeners) listener();
  return snapshot;
}
