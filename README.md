# do.fit

Food logging by photo and a sentence. Point the phone at a plate, say what it
is, and get kcal and macros back. Installable PWA, Supabase behind it, Gemini
3.7 Flash doing the estimating.

Why it is built this way — the design decisions, the failures that shaped them,
and the measurements behind the model choice — is in [AGENTS.md](AGENTS.md).

## Setup

Needs Node 24, pnpm 11, Docker for the local Supabase stack, and a Gemini API
key.

```bash
pnpm install
pnpm db:start            # local Supabase in Docker — start this first
pnpm db:up               # apply pending migrations
pnpm dev:user            # the local sign-in user; once, and after a db reset
pnpm dev                 # http://localhost:3000, no login screen
```

## Environment

Two files, and the split is load-bearing: nothing in the ordinary loop can reach
the real food log.

| File | Holds | Loaded by |
| --- | --- | --- |
| `.env.local` | the **local** Supabase coordinates | Next, the tests, every `check:` command |
| `.env.hosted` | the **hosted** coordinates | only the two commands that name it explicitly |

| Variable | Needed by | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | everything | inlined at build time |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | everything | inlined at build time |
| `SUPABASE_SECRET_KEY` | the server | bypasses RLS, never sent to the browser |
| `DATABASE_URL` | the Body page | the **session** pooler on 5432, not 6543 |
| `GEMINI_API_KEY` | estimates, advice, dictation | |
| `HEVY_API_KEY` | the Hevy sync | from your Hevy account settings |
| `GARMIN_USER` / `GARMIN_PASSWORD` | the sync service | fallback only; the token store is the real credential |
| `GARMIN_TOKENS` | the sync service | seeds the volume once, then never read again |
| `GARMIN_WINDOW_DAYS` | the sync service | how many days back to fetch, default 30 |
| `CRON_SECRET` | production | the only authentication on both `/api/cron/` routes |
| `APP_URL` | production | the public origin |
| `NEXT_PUBLIC_DEV_AUTH` | development | `true` skips the login screen locally |
| `MEAL_PRODUCT_LOOKUP` | optional | `off` disables the branded-product lookup |

## Commands

| Command | Does |
| --- | --- |
| `pnpm dev` | development server on Turbopack, no service worker |
| `pnpm build` | production build, on webpack so Serwist can compile the worker |
| `pnpm test` | the full vitest suite, 182 tests |
| `pnpm lint` | eslint |
| `pnpm db:start` / `pnpm db:stop` | the local Supabase Docker stack |
| `pnpm db:up` | apply pending migrations locally |
| `pnpm db:verify` | prove the migrations replay cleanly from nothing |
| `pnpm db:port` | load Alpha 1's SQLite data into Postgres |
| `pnpm db:gate` | the verification gate |
| `pnpm design:contrast` | every colour token against WCAG AA, both themes |
| `pnpm test:recovery` | a stuck meal, recovered — refuses anything but the local database |
| `pnpm check:dashboard` | the Body view model against real rows |
| `pnpm check:access` | what the signed-in role can actually do, locally |
| `pnpm check:access:hosted` | the same assertions against the hosted project |
| `pnpm sync:hevy` | pull Hevy into Postgres, straight from their API |
| `pnpm sync:garmin` | pull Garmin — **this Mac only**, see below |
| `pnpm port:garmin` | load an already-downloaded GarminDB into Postgres |
| `pnpm probe:advice` / `pnpm probe:transcribe` | one-shot checks against the live models |
| `pnpm reconcile:now` | the stuck-meal lever — **hosted** |

## Deployment

Four Railway services in one project, all in Europe West.

| Service | Runs | Schedule |
| --- | --- | --- |
| `corpus` | this repo, built on push to `main`, `next start` on port 8080 | always on |
| `reconcile` | `curlimages/curl`, one request to `/api/cron/reconcile` | `*/15 * * * *` |
| `sync` | this repo via `Dockerfile.sync`, Hevy then Garmin | `0 5 * * 1` |

The project itself is described in `.railway/railway.ts`, so the repo can
rebuild not just the app but the thing that runs it. Secrets are not in there:
`preserve()` names a variable without carrying its value. Edit it, run
`railway config plan` to see the difference against the live project, and apply
only once the plan says what you expected.

`scripts/railway-env.sh` pushes `.env.hosted` into the `corpus` service, sets
`APP_URL` from the service domain, and generates `CRON_SECRET` on first run.
Values go over stdin, so none of them reach the process list or shell history.

```bash
./scripts/railway-env.sh
```

Supabase and Gemini are unchanged by the hosting. The database, storage, auth
and the estimating all sit outside Railway.

### The sync service

One container, two runtimes, because the two sources need different things.
Hevy has a public API and is a few dozen HTTP calls. Garmin has none, so
GarminDB signs into Garmin Connect and downloads FIT files, which needs Python.
`scripts/sync-all.sh` runs Hevy first on purpose: it is the half that always
works, and a bad night for a scraper should not cost you the half that would
have succeeded.

`HOME` is set to the mounted volume, which is the whole trick. GarminDB keeps
its config and its OAuth tokens under `$HOME/.GarminDb` and its archive under
`$HOME/HealthData`, so pointing `HOME` at a volume persists all of it without
patching a path.

**The server holds a month, not the history.** Locally the start dates reach
back to 2021, which is why the archive is 638 MB across fifteen thousand FIT
files and why an import spends twenty minutes walking files it has already
read. The server does not need any of that: Postgres already has the history
and `port-garmin` upserts by day, so `GARMIN_WINDOW_DAYS` keeps only enough to
catch what is new or revised.

**Garmin's refresh token is single-homed.** It rotates on every use and
GarminDB writes the new pair back, so `GARMIN_TOKENS` seeds the volume once and
is never applied again. Running the sync here *and* on a laptop would have the
two invalidate each other. When Garmin eventually rejects it, re-authenticate
on a machine that can prompt and replace the file with `railway volume files`.

`pnpm sync:garmin` remains for running it by hand on a machine that already has
GarminDB installed.

## Layout

```
src/
  app/
    api/meals/analyze/     synchronous estimate — the boundary for the browser
    api/meals/process/     the 202-then-work estimate job
    api/meals/transcribe/  dictation
    api/advise/            the advisor's one call
    api/cron/reconcile/    the stuck-meal sweep, woken by the reconcile service
    api/cron/sync-hevy/    the weekly Hevy pull, woken by the hevy-sync service
    body/ foods/ progress/ advisor/ account/   the tabs
  components/
    today.tsx              the day's log, sent and still queued
    meal-logger.tsx        say what you ate; photo optional
    meal-entry.tsx         one meal, and the ability to overrule it
    meal-time-field.tsx    when you ate it
    advisor.tsx            ask what to eat next
    saved-foods.tsx        the foods list, with Log on every row
    tracking-streaks.tsx   days logged, and days on target
    energy-card.tsx        the day's headline figure
    macro-lines.tsx        what is left, as lines
    body-sections.tsx      the Body dashboard, one section per thing worth knowing
    charts-lazy.tsx        recharts, behind next/dynamic
    ui/                    shadcn/ui primitives
  lib/
    db.ts                  the one Postgres connection
    sql.ts                 shared SQL fragments: knee load, working volume
    queries.ts             SQL only — rows in, rows out
    time.ts                the 04:00 London day boundary
    meal/
      schema.ts            the contract: items in, totals derived
      gemini-schema.ts     Gemini's structured-output contract
      prompt.ts            UK portions, consistency over cleverness
      estimate.ts          the one call to Gemini
      lookup.ts            the branded-product label lookup
      advise.ts            the advisor's prompt and parsing
      compress.ts          client-side resize before upload
      format.ts            macro labels and meal times, shared by the views
    hevy/
      sync.ts              the Hevy API pull, shared by route and script
    meals/
      repository.ts        every read and write of meal_log, in one place
      process.ts           the one estimate path, shared by job and sweep
      enqueue.ts           asking the worker, shared by flush and retry
      streaks.ts           logged days, and days that met both targets
      targets.ts           what the day is aiming at
    outbox/                IndexedDB queue: captured before the network is touched
    training/              the Body view model
    garmin/                the watch's numbers
    auth/                  owner check and bearer verification
    supabase/
      client.ts            the browser, as the signed-in user
      server.ts            the server, as the signed-in user
      worker.ts            the secret key — no session, bypasses RLS
supabase/migrations/       the schema
scripts/
  sync-all.sh              what the sync service runs: Hevy, then Garmin
  sync-hevy.mts            the Hevy pull, by hand
  sync-garmin.sh           the Garmin pull on a machine with GarminDB
  railway-env.sh           push .env.hosted into the Railway service
  ...                      migrations gate, data ports, probes
```
