import { localDay } from "@/lib/time";
import { createClient } from "@/lib/supabase/client";
import { requestEstimate } from "@/lib/meals/enqueue";
import { type MealRow } from "@/lib/meals/repository";
import { recordSavedFoodUse } from "@/lib/meals/saved";
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

  // Named from the client id, so a retry overwrites its own earlier upload
  // instead of littering the bucket with orphans. Known before the upload
  // starts, which is what lets the two run together below.
  const photoPath = meal.photo ? `${userId}/${meal.clientId}.jpg` : null;

  // The upload and the insert go at once rather than one after the other.
  //
  // The insert does not depend on the upload's result — only on the path, which
  // is derived, not returned — and the upload is much the slower of the two on
  // a phone's uplink. Sequencing them put the slowest step in front of the one
  // that makes the meal safe, which inverts the ordering the whole design rests
  // on: the row is the job, and it should exist as early as possible.
  //
  // A row that briefly names a photo not yet uploaded is already handled:
  // `processMeal` reports "Photo missing" and `recordFailure` leaves the row
  // pending for the reconciler, which is the same path as any other transient
  // failure.
  const [upload, insert] = await Promise.all([
    photoPath
      ? supabase.storage
          .from("meal-photos")
          .upload(photoPath, meal.photo!, { contentType: "image/jpeg", upsert: true })
      : Promise.resolve(null),
    supabase
      .from("meal_log")
      .insert({
        client_id: meal.clientId,
        logged_at: meal.loggedAt,
        local_date: meal.localDate || localDay(new Date(meal.loggedAt)),
        note: meal.note.trim() || null,
        photo_path: photoPath,
        /*
         * A meal from the saved list arrives finished.
         *
         * Its macros were established once, by an estimate a person read and
         * accepted, and copying them is the entire point of saving it — the
         * same shake priced the same way every morning. So the row is written
         * `analyzed` with the figures in place, and the worker is never asked.
         *
         * That also makes it the only kind of meal that is complete without a
         * network round trip beyond this insert: no model call to wait for, no
         * pending state to sweep up, nothing for the reconciler to find.
         */
        ...(meal.saved
          ? {
              status: "analyzed" as const,
              saved_food_id: meal.saved.id,
              items: meal.saved.estimate.items,
              kcal: meal.saved.estimate.kcal,
              protein_g: meal.saved.estimate.protein_g,
              carbs_g: meal.saved.estimate.carbs_g,
              fat_g: meal.saved.estimate.fat_g,
              confidence: meal.saved.estimate.confidence,
              assumptions: meal.saved.estimate.assumptions,
            }
          : { status: "pending" as const }),
      })
      .select()
      .single(),
  ]);

  // The upload is checked *first*, and this order is load-bearing.
  //
  // Checking the insert first looks natural and is wrong: a failed upload
  // alongside a successful insert would leave a row naming a photo that does
  // not exist, and the retry would then hit the duplicate check, return
  // "already sent", and never upload it. The photo would be lost permanently
  // while everything reported success.
  //
  // Throwing on the upload first means the retry runs both again — the upload
  // for real, the insert into a conflict it treats as success.
  if (upload?.error) throw new Error(`Photo upload failed: ${upload.error.message}`);

  if (insert.error) {
    if (insert.error.code === ALREADY_SENT) return; // landed on an earlier attempt
    throw new Error(insert.error.message);
  }

  // Priced already: there is nothing to estimate, and the counter that orders
  // the saved list is nudged instead. Deliberately not awaited for its result —
  // see `recordSavedFoodUse`; a meal must not fail to log because a sort key
  // did not update.
  if (meal.saved) {
    await recordSavedFoodUse(supabase, meal.saved.id, meal.saved.timesUsed);
    return;
  }

  await requestEstimate((insert.data as MealRow).id, accessToken);
}
