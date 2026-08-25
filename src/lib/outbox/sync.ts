import { createClient } from "@/lib/supabase/client";
import { requestEstimate } from "@/lib/meals/enqueue";
import { localDay, type MealRow } from "@/lib/meals/repository";
import { markFailed, pending, remove, type OutboxMeal } from "./store";

/**
 * Send everything the outbox is holding.
 *
 * Safe to call whenever and as often as you like — that is deliberate, because
 * it is called from three places that can all fire at once: the app opening,
 * the browser reporting it is back online, and a Background Sync event. All
 * three exist because none of them is reliable on its own; Background Sync in
 * particular doesn't fire in every state, and the other two are a few lines.
 *
 * Duplicate sends are handled by the database, not by trying to be clever here:
 * `client_id` is unique, so a meal that was actually written but whose response
 * was lost comes back as a conflict, which is treated as success.
 */

/** Postgres unique-violation. Means the row already landed on a previous try. */
const ALREADY_SENT = "23505";

export type FlushResult = { sent: number; failed: number; remaining: number };

let inFlight: Promise<FlushResult> | null = null;

export function flushOutbox(): Promise<FlushResult> {
  // Collapse concurrent calls. Three triggers firing together should send each
  // meal once, not three times.
  inFlight ??= run().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function run(): Promise<FlushResult> {
  const queued = await pending();
  if (queued.length === 0) return { sent: 0, failed: 0, remaining: 0 };

  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return { sent: 0, failed: 0, remaining: queued.length };

  let sent = 0;
  let failed = 0;

  for (const meal of queued) {
    try {
      await send(meal, session.access_token, session.user.id);
      await remove(meal.clientId);
      sent += 1;
    } catch (thrown) {
      await markFailed(meal.clientId, thrown instanceof Error ? thrown.message : String(thrown));
      failed += 1;
    }
  }

  return { sent, failed, remaining: (await pending()).length };
}

async function send(meal: OutboxMeal, accessToken: string, userId: string) {
  const supabase = createClient();

  let photoPath: string | undefined;
  if (meal.photo) {
    // Named from the client id, so a retry overwrites its own earlier upload
    // instead of littering the bucket with orphans.
    photoPath = `${userId}/${meal.clientId}.jpg`;
    const { error } = await supabase.storage
      .from("meal-photos")
      .upload(photoPath, meal.photo, { contentType: "image/jpeg", upsert: true });
    if (error) throw new Error(`Photo upload failed: ${error.message}`);
  }

  const { data, error } = await supabase
    .from("meal_log")
    .insert({
      client_id: meal.clientId,
      logged_at: meal.loggedAt,
      local_date: meal.localDate || localDay(new Date(meal.loggedAt)),
      status: "pending",
      note: meal.note.trim() || null,
      photo_path: photoPath ?? null,
    })
    .select()
    .single();

  if (error) {
    if (error.code === ALREADY_SENT) return; // landed on an earlier attempt
    throw new Error(error.message);
  }

  await requestEstimate((data as MealRow).id, accessToken);
}
