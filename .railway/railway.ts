/**
 * The Railway project, in source.
 *
 * Everything that was previously only in Railway's own database — which image
 * each service runs, the schedules, the start commands, the volume, which
 * continent each one sits on — is described here instead. Before this file the
 * repo could rebuild the app but not the thing that runs it.
 *
 * Secrets are not here and must never be. `preserve()` means "this variable
 * exists on the service and its value is Railway's business", so the file can
 * name every variable without carrying one.
 *
 * Change this file, run `railway config plan` to see the difference against
 * the live project, and only then apply. A plan that reports changes you did
 * not intend is drift, and worth reading rather than applying.
 */
import { defineRailway, github, image, preserve, project, service, volume } from "railway/iac";

export default defineRailway(() => {
  /**
   * The sync service's memory between runs.
   *
   * Its containers are destroyed after every weekly run, so GarminDB's OAuth
   * token and its downloaded FIT files would not survive without this. Small
   * on purpose: the server keeps a rolling month, not the 638 MB history that
   * Postgres already holds.
   */
  const syncVolume = volume("sync-volume", {
    // The zone, not the region. Railway stores the zone a volume was created
    // in, and a volume cannot be moved: `VolumeUpdateInput` takes a name and
    // nothing else. Writing the broader `europe-west4` here leaves a diff that
    // no apply can ever close, which teaches you to ignore the plan.
    region: "europe-west4-drams3a",
    sizeMB: 500,
    allowOnlineResize: true,
    alerts: { usage: { "80": {}, "95": {}, "100": {} } },
  });

  /** The app. The only service that is awake between requests. */
  const corpus = service("corpus", {
    // The branch, not a commit. The import pinned the SHA that happened to be
    // deployed when it ran, which would have frozen every future deploy to it.
    source: github("do88/corpus", { branch: "main" }),
    // `/offline` because it answers 200 without a session and touches no
    // database. Railway rejected `/manifest.webmanifest` — it will not take a
    // path with a dot in the filename.
    healthcheck: "/offline",
    replicas: { "europe-west4": 1 },
    // Long enough for an estimate that is still running after its response
    // went out. Without it a deploy kills work the app already acknowledged.
    deploy: { drainingSeconds: 30 },
    domains: ["dofit.dmitry-o.co.uk"],
    env: {
      APP_URL: preserve(),
      CRON_SECRET: preserve(),
      DATABASE_URL: preserve(),
      GEMINI_API_KEY: preserve(),
      HEVY_API_KEY: preserve(),
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: preserve(),
      NEXT_PUBLIC_SUPABASE_URL: preserve(),
      SUPABASE_SECRET_KEY: preserve(),
    },
  });

  /**
   * The weekly data pull: Hevy, then Garmin. Two runtimes in one image, which
   * is why it builds from its own Dockerfile rather than being sniffed.
   */
  const sync = service("sync", {
    source: github("do88/corpus", { branch: "main" }),
    build: { builder: "DOCKERFILE", dockerfilePath: "Dockerfile.sync" },
    // Beside the database it writes to. The import had this in Virginia, which
    // put every one of its several thousand row writes across the Atlantic.
    replicas: { "europe-west4": 1 },
    // A schedule is not a setting on a long-running service; it changes what
    // the service is. Railway keeps nothing alive and starts a fresh container
    // on Monday morning, which exits when the script does.
    deploy: { cronSchedule: "0 5 * * 1", restartPolicyType: "NEVER" },
    volumeMounts: { "/data": syncVolume },
    env: {
      DATABASE_URL: preserve(),
      HEVY_API_KEY: preserve(),
      // Fallback only. The real credential is the OAuth token below, which
      // seeds the volume once and is then owned by GarminDB.
      GARMIN_USER: preserve(),
      GARMIN_PASSWORD: preserve(),
      GARMIN_TOKENS: preserve(),
      GARMIN_WINDOW_DAYS: preserve(),
    },
  });

  /**
   * The stuck-meal sweep. No code of ours: a stock Alpine image running one
   * request. Alpine rather than a curl image because that one declares curl as
   * its entrypoint, so the start command was appended to it and every run
   * printed usage and exited.
   */
  const reconcile = service("reconcile", {
    source: image("alpine:latest"),
    start: 'wget -q -O- --header="Authorization: Bearer $CRON_SECRET" "$RECONCILE_URL"',
    replicas: { "europe-west4": 1 },
    // Never restart: a failed run waits for its next slot rather than looping.
    deploy: { cronSchedule: "*/15 * * * *", restartPolicyType: "NEVER" },
    env: {
      CRON_SECRET: preserve(),
      // `${{corpus.APP_URL}}/api/cron/reconcile`, so it follows the domain.
      RECONCILE_URL: preserve(),
    },
  });

  return project("do.fit", {
    resources: [corpus, sync, reconcile, syncVolume],
  });
});
