/**
 * Ask the background worker to estimate a meal.
 *
 * Two callers, and they must not drift: the outbox flush, the moment a meal
 * reaches the server, and the stale-pending retry when the app is opened. Both
 * post the same body to the same path with the same header, and both treat a
 * failure the same way.
 *
 * A failure here is deliberately swallowed. The row already exists, which is
 * the part that matters — the reconciler sweeps anything left `pending`, so
 * the worst case is a meal analysed late rather than a meal lost. Surfacing it
 * as an error would send the meal back to the outbox and duplicate the row on
 * the next flush.
 *
 * Authenticated by Bearer token rather than by cookie: `/jobs/*` is excluded
 * from the proxy, because in production the Next runtime's edge function
 * matches before Netlify routes to a background function, and the proxy would
 * answer a perfectly valid request with a redirect to /login.
 */
export async function requestEstimate(mealId: string, accessToken: string): Promise<void> {
  try {
    await fetch("/jobs/estimate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ mealId }),
    });
  } catch {
    // Left for the reconciler.
  }
}
