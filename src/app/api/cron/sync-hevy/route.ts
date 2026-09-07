import "server-only";
import type { NextRequest } from "next/server";
import postgres from "postgres";
import { syncHevy } from "@/lib/hevy/sync";

/**
 * Pull Hevy into Postgres, on a schedule.
 *
 * The same shape as the reconcile sweep beside it: an ordinary route handler
 * authenticated by CRON_SECRET, woken by a container that wakes, sends one
 * request and exits. That header is the whole boundary, which is why the
 * proxy excludes `/api/cron/` — it authenticates by cookie and a scheduler has
 * no cookie jar.
 *
 * It runs here rather than as a script on a build server for one reason: the
 * app already holds a Postgres connection and the credentials, so a scheduled
 * HTTP call needs no second deployment, no second copy of the environment and
 * no toolchain that has to survive a production install.
 *
 * A full run is a few dozen requests to Hevy and one transaction, measured at
 * well under a minute for several hundred workouts.
 */

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const key = process.env.HEVY_API_KEY;
  if (!key) return new Response("HEVY_API_KEY is not set", { status: 500 });

  const url = process.env.DATABASE_URL;
  if (!url) return new Response("DATABASE_URL is not set", { status: 500 });

  // Its own connection, closed at the end. The app's pool in `db.ts` is sized
  // for short dashboard reads; a sync holds one connection for a transaction
  // that writes thousands of rows, and it has no business competing for those.
  const sql = postgres(url, {
    transform: { undefined: null },
    prepare: !url.includes("pooler.supabase.com:6543"),
  });

  try {
    const counts = await syncHevy(sql, key);
    console.log(
      `hevy sync: ${counts.workouts} workouts, ${counts.sets} sets` +
        (counts.keptOrphans ? " (partial fetch — nothing deleted)" : ""),
    );
    return Response.json(counts);
  } catch (thrown) {
    const reason = thrown instanceof Error ? thrown.message : "unknown error";
    console.error(`hevy sync failed: ${reason}`);
    return new Response(reason, { status: 500 });
  } finally {
    await sql.end();
  }
}
