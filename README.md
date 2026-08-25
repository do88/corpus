# Corpus

Food logging by photo and a sentence. Point the phone at a plate, say what it
is, and get kcal and macros back. Android PWA, Supabase behind it, Claude Opus 5
doing the estimating.

The plan is in [docs/IMPLEMENTATION-PLAN.md](docs/IMPLEMENTATION-PLAN.md).

```
src/
  app/
    api/meals/analyze/   synchronous estimate — the boundary for the browser
  components/
    charts-lazy.tsx      recharts, behind next/dynamic
    today.tsx            the day's log, sent and still queued
    meal-logger.tsx      say what you ate; photo optional
    meal-entry.tsx       one meal, and the ability to overrule it
    training-sections.tsx  the dashboard, one section per thing worth knowing
    ui/                  shadcn/ui primitives
  lib/
    anthropic/schema.ts  zod -> the JSON Schema structured outputs will accept
    db.ts                the one Postgres connection
    sql.ts               shared SQL fragments: knee load, working volume
    queries.ts           SQL only — rows in, rows out
    meal/
      schema.ts          the contract: items in, totals derived
      prompt.ts          UK portions, consistency over cleverness
      estimate.ts        the one call to Claude
      compress.ts        client-side resize before upload
      format.ts          macro labels and meal times, shared by the two views
    meals/
      repository.ts      every read and write of meal_log, in one place
      process.ts         the one estimate path, shared by worker and sweep
      enqueue.ts         asking the worker, shared by flush and retry
    outbox/              IndexedDB queue: captured before the network is touched
    supabase/
      client.ts          the browser, as the signed-in user
      server.ts          the server, as the signed-in user
      worker.ts          the secret key — no session, bypasses RLS
netlify/functions/       background worker + hourly reconciler
supabase/migrations/     the schema
scripts/
  port-sqlite.mjs        one-time load of Alpha 1's data
  verify-migrations.sh   replay every migration into a throwaway schema
  verify-port.mts        the verification gate
```

## Running it

```bash
pnpm install
pnpm db:start            # local Supabase (Docker) — start this first
pnpm dev:user            # the local sign-in user; once, and after a db reset
pnpm dev                 # http://localhost:3000 — local, no login screen
netlify dev --offline    # http://localhost:8888 — app + functions + blobs

pnpm db:up               # apply pending migrations
pnpm db:verify           # prove they replay cleanly from nothing
pnpm db:port             # load Alpha 1's SQLite data into Postgres
pnpm db:gate             # the verification gate — see below
pnpm design:contrast     # every colour token against WCAG AA, both themes
pnpm test:recovery       # a stuck meal, recovered — local database only
pnpm test                # the 49 metrics tests, carried over from Alpha 1
pnpm check:dashboard     # the training view model against real rows
pnpm check:access        # what the signed-in role can actually do — local
pnpm check:access:hosted # the same assertions against the hosted project
```

`pnpm build` runs `next build --webpack`. Serwist, which compiles the service
worker, is a webpack plugin, and Next 16 is Turbopack-first — the two do not
compose, so the build opts out of Turbopack. It costs a few seconds and buys a
real precache manifest rather than a hand-rolled worker. Revisit when Serwist
supports Turbopack.

`next.config.ts` therefore declares an empty `turbopack: {}` alongside it. Next
refuses to start when it finds a `webpack` config with no `turbopack` config
beside it — a sensible guard against a config nobody migrated, but here both are
deliberate. Without it `pnpm dev` exits rather than starting. Dev stays on
Turbopack, which is faster and unaffected, because Serwist is disabled in
development anyway.

Needs `ANTHROPIC_API_KEY` in `.env.local`. Everything else runs locally: the
database is the Supabase CLI's Docker stack, not the hosted project.

### Local development is isolated from the hosted project

`.env.local` holds the **local** Supabase coordinates, so `pnpm dev`, the tests
and every `check:` command work against the Docker stack. Nothing in the ordinary
loop can reach the real food log.

The hosted coordinates live in `.env.hosted`, which Next does not load. Only the
two commands that mean to touch production name it, and they name it explicitly:

```bash
pnpm reconcile:now        # the stuck-meal lever — hosted
pnpm check:access:hosted  # grants and RLS as actually deployed
```

Both pass `--env-file=.env.local --env-file=.env.hosted`, in that order. The
order is load-bearing: Node lets the **last** file win, so hosted overrides
local while `ANTHROPIC_API_KEY` is still picked up from the first. Reversed, the
production lever would quietly operate on the local database.

It used to be the other way round — `.env.local` was the hosted project — which
is why `test:recovery` had to override `NEXT_PUBLIC_SUPABASE_URL` before it
would write anything, and why ordinary development signed in through Google
against production data.

### No login screen locally

`pnpm dev:user` creates a password user in the local stack carrying the owner's
email, and `NEXT_PUBLIC_DEV_AUTH=true` in `.env.local` makes the login page sign
in with it on mount. Run it once, and again after a database reset.

The screen is skipped by **signing in**, not by bypassing the proxy, and the
difference matters. RLS is the real boundary and it matches on the email in the
JWT — so a bypass would render an app where every query returns nothing, every
upload is refused and the outbox has no token for the worker. You would be
debugging the workaround. A real session means every path behaves exactly as it
does in production; only the identity provider changes.

Two things keep it out of production: the flag is only honoured when
`NODE_ENV === "development"`, which `next build` never is, so it is a
compile-time `false` and the bundler drops the sign-in path as dead code.
Verified by building with the flag forced on — the password, the button label
and the error string appear in zero files.

`pnpm db:verify` exists because `supabase db reset` drops the database to prove
the same thing. This replays each migration into a throwaway schema inside one
transaction and rolls back, so a clean run leaves the database untouched.

## The look

Swiss, with Bauhaus marks. The rules, in the order they matter:

1. **The grid does the work.** One column, flush left, separated by hairline
   rules rather than boxes. Radius is `0` globally, so every shadcn primitive
   inherits it. No shadows.
2. **One humanist typeface at four sizes.** Source Sans 3 rather than a
   grotesque: Helvetica is the reflex for Swiss work, but its closed apertures
   collapse at the 11px the labels use on a phone.
3. **Near-black on warm paper**, never `#000` on `#fff` — pure black on pure
   white vibrates on the OLED screen this actually runs on.
4. **Colour is information.** The three primaries carry confidence and nothing
   else: red low, yellow medium, blue high.
5. **Tabular numerals everywhere**, so a figure that changes doesn't shove the
   text beside it.

Dark mode follows the phone's own setting via `next-themes`. There is no toggle
— the header has one accent mark and a switch beside it would be the second
thing competing for the eye.

### Two sets of primaries, because AA demands it

`pnpm design:contrast` checks every token in both themes. It exists because this
mistake has now happened twice in this project: a colour chosen as a poster
primary, then used as a small mark, measuring far below threshold.

The medium-confidence dot started at **1.81:1** on paper — fine on a desktop
monitor, invisible on a phone in daylight. So there are two sets:
`--bauhaus-*` darkened until they clear 4.5:1 as type, and `--mark-*` held as
vivid as 3:1 allows for fills. Yellow is the one that can't have both, so its
mark is an ochre rather than a primary.

```
light                          dark
  --foreground      18.02:1      --foreground      16.28:1
  --muted-foreground 6.83:1      --muted-foreground 7.82:1
  --mark-yellow      3.04:1      --mark-yellow     11.01:1
```

Every value measured, none eyeballed.

---

## Phase 2 — the logging loop

Photo and a sentence in, macros back. The order is the design:

1. Resize on the client — a 4000×3000 photo is ~10× the image tokens
2. **Insert the `meal_log` row** — the meal is now on screen and safe —
   *concurrently* with uploading the photo to the private `meal-photos` bucket
3. Fire the background worker, which returns 202 immediately
4. Worker estimates and writes back; Realtime swaps pending for the result

**Nothing slow happens before the row exists.** The estimate is an enrichment
that arrives later, not a precondition for the entry existing. If the worker
never runs there is still a row saying you ate, which the reconciler can pick
up. A logger that loses entries while "thinking" is one you stop trusting.

The upload used to run *before* the insert, which put the slowest step in front
of the one that makes the meal safe. It can be concurrent because the object
path is derived from the client id rather than returned by the upload. The
check order that follows is load-bearing, though: the upload is inspected
first, because a failed upload beside a successful insert would leave a row
naming a photo that does not exist — and the retry would hit the duplicate
check, report success, and never upload it.

### Offline

The meal goes into the phone's own storage **before** the network is touched.
That ordering is the difference between an app that works in a basement and one
that appears to have lost your lunch — the worst case here is a meal that is
saved and not yet sent, which is visible on screen and self-healing.

IndexedDB rather than localStorage, because it holds the photo as a Blob;
base64 in localStorage would be a third larger and decoded on every read. The
outbox is exposed to React through `useSyncExternalStore` rather than mirrored
into `useState` — IndexedDB is the source of truth, and mirroring it would mean
setting state inside an effect, which React 19 rejects.

Sending happens on **three** triggers: the app opening, the browser reporting
`online`, and a Background Sync event that fires with the app closed. None is
reliable alone — Background Sync doesn't fire in every state and is Chromium
only — and the other two are a few lines each. Three cheap triggers beat one
clever one.

#### The third one silently did nothing for months

Worth recording, because the redundancy above is exactly what hid it.
`@supabase/ssr` chooses how to reach cookies with an `isBrowser()` check that
requires both `window` and `window.document`. A service worker has neither, so
it took the non-browser branch — where `getAll` is hardcoded to return `[]`.

No cookies meant no session, and `flushOutbox` returns at its session guard
before sending anything. Background Sync fired, found nothing it could
authenticate as, and reported success having sent zero meals.

Nothing ever surfaced it. Open the app and it flushes immediately, so by the
time anyone looked the queue was always empty — the two triggers that work were
covering for the one that didn't, which is the failure mode redundancy is
supposed to prevent and instead disguised.

The fix passes cookie accessors backed by the **Cookie Store API**, which
service workers do have. The SDK stays in charge of the chunked cookie format
and of refreshing a token that expired while the phone was in a pocket — the
two parts genuinely worth not reimplementing. `cookieStore` is Chromium-only,
which is precisely where Background Sync exists, so it covers the whole of
where the feature is real.

One trap in it: `cookie` spells an expiry as a `Date`, `cookieStore` wants epoch
milliseconds, and spreading one into the other type-checks while producing a
session that quietly vanishes by the next sync. The fields are mapped
individually.

Duplicates are the database's job, not the code's: every meal carries a
`client_id` minted on the phone, with a unique index. A meal that was written
but whose response was lost comes back as a conflict on the next flush, which
is treated as success.

### Correcting a number

Tap any analysed meal and the four figures become inputs. This is the feature
that decides whether the rest is worth anything — an estimate you cannot argue
with is one you quietly stop believing.

Corrected rows set `edited` and never unset it, which matters later: once these
rows are used to judge whether the model runs high or low, a figure the user
overruled is evidence about the *meal*, not about the model. Mixing the two
would calibrate the model against our own corrections. The line items are left
alone — someone correcting a total is saying "that was more like 400", not
re-apportioning it across four foods.

### Voice

Chrome's own speech recognition, on the device. The audio never leaves the phone
and never reaches Claude; the model receives text. Cheaper, faster, and a better
prompt than audio. Where the browser can't do it the button isn't rendered —
there is no fallback to build, because typing already is the fallback.

### Recovery is ours, not the platform's

`netlify/functions/reconcile.mts` runs **hourly** and is the **primary**
recovery path. Netlify's documented retries do not fire (measured — see Phase 0),
so nothing retries anything unless this does.

Hourly is the floor, not a choice: Netlify's scheduler has no sub-hourly cron,
and an invalid expression fails silently — `*/10 * * * *` was accepted at deploy
and simply never fired, so the safety net was never armed. The gap that leaves
is covered from the client, which retries anything stale whenever the app is
opened, which is also the moment you would notice.

Nothing guards it, and nothing needs to. Netlify refuses HTTP invocation of a
scheduled function — measured against the deployed site, not assumed: GET, POST
and PUT to `/.netlify/functions/reconcile` all return **403**. `/jobs/estimate`
does answer 202 to an unauthenticated caller, but that is a background function
acknowledging before its handler runs; `verifyOwner` refuses inside it, and
nothing reaches Anthropic.

It is also the only thing that can recover a meal whose worker was never invoked
at all: signal lost between writing the row and firing the request, or a deploy
mid-flight. No queue can retry a job it never saw; a sweep finds it because the
row *is* the job.

Both paths call the same `processMeal`, which is what makes them genuinely
equivalent rather than merely similar. Scheduled functions get 30 seconds hard
and cannot be background, so the sweep works to a 22-second budget and logs what
it deferred — a sweep that silently truncates reads as "all clear" when it isn't.

`pnpm test:recovery` proves it: insert a meal that looks stuck, run the real
processing path, check macros came back, delete the row. It refuses to run
against anything but the local database — writing invented meals into the real
log would put food that was never eaten into a record whose entire value is
being true.

---

## The training dashboard

Alpha 1's dashboard, ported mobile-first at `/training`. `metrics.ts`,
`format.ts` and all **49 tests** came across untouched — they were always pure
domain rules with no SQL and no JSX, which is exactly what made the port a copy
rather than a rewrite. `dashboard.ts` needed one change: the queries are awaited
now, because Postgres is a socket where SQLite was a file.

`glossary.ts` and `nutrition.ts` came across too and were later removed: nothing
ever referenced them, and `nutrition.ts` was reachable only through a branch of
the view model that no section renders. They are in the history if a Nutrition
section ever earns its place. The same sweep dropped the unread `profile` branch
and the BMI series that fed a chart which does not exist.

The sections are **server** components. They only carried `"use client"` to
import the charts, which dragged all seven into the client bundle to satisfy the
four that draw one, and pushed the whole view model over the wire as serialised
props. recharts now sits behind `next/dynamic` — 391 KB that no longer blocks
the numbers and tables from painting. The month-grid calendar on the logging
screen is deferred the same way, for another 70 KB.

The view model is cached for an hour. These tables are loaded by hand, so the
numbers change when someone changes them, never while anyone is looking, and
recomputing a dozen multi-CTE queries per view is work for nothing. The cache
sits on the query layer rather than the route: route-segment `revalidate` makes
Next prerender at build time, where there is no database to reach, and the build
hangs until it gives up. `revalidateTag("training")` drops it after a re-port.

`pnpm check:dashboard` proves the data layer end to end without a browser — and
calls the *uncached* builder, because a smoke check answered from cache proves
nothing about the database:

```
sessions      468  (2021-10-05 → 2026-08-15)
protein       175 g from 79.44 kg lean
knee          median 39/wk, peak 114
strength      Deadlift 168kg, Squat 96kg, Bench 113.3kg, OHP 72kg
```

**Production needs two things the app cannot do for itself.** `DATABASE_URL`
must point at the hosted Postgres — the dashboard queries need real SQL, so they
use a connection rather than PostgREST — and the training data has to be loaded
there once:

```bash
CONFIRM_REMOTE_PORT=yes DATABASE_URL=<hosted> node scripts/port-sqlite.mjs
```

The confirmation is not ceremony: that script truncates every training table
before loading.

---

## Postgres gates access twice

This caused a live outage worth writing down. A **GRANT** decides whether a role
may touch a table at all; **RLS** decides which rows it then sees. They are
independent, and only the second was being tested.

RLS was correct from the first migration. The GRANT was missing, so a signed-in
request failed with `permission denied for table meal_log` before any policy was
consulted — surfacing in the browser as React error #441, which in production
says only "an error occurred in the Server Components render".

It passed locally and failed hosted because **the two apply different default
privileges**: `supabase db push` creates tables as a role whose defaults don't
include the API roles. Nothing in the migrations said what `authenticated` could
do, so each environment inherited a different answer.

Both are now stated outright — read-only on the training tables, full CRUD on
`meal_log`, and `anon` revoked rather than left to inherit. The local stack had
in fact granted `anon` full CRUD by default; RLS still returned nothing, so it
was never a leak, but "the policy happens to be empty" is a weaker guarantee
than "the role cannot reach the table".

`pnpm check:access` is the check that was missing. It runs every assertion as
`authenticated` with the owner's email in the JWT claims — what the app actually
is at runtime — and it found the `anon` discrepancy on its first run.

### The same shape again, in Storage

A later audit found the identical mistake one layer over. The photo upload uses
`upsert: true` so a retry overwrites its own earlier object instead of leaving
orphans; Storage implements that overwrite as an **UPDATE** on
`storage.objects`, and the bucket had policies for select, insert and delete
only.

So it failed exactly where it mattered and nowhere else. A first upload is an
INSERT and worked fine. The case the upsert exists for — photo uploaded,
response lost on a bad connection, outbox retries — hit the missing policy,
threw, and went back to the queue to fail the same way forever. A meal with a
photo could stick permanently on precisely the connection this app is built
for.

Two things worth keeping from it. First, `check:access` now covers Storage, and
the check was proven by dropping the policy and watching it fail — a check
nobody has seen fail is a check nobody has tested. Second, it asserts **row
counts**, not just the absence of an error: a missing UPDATE policy does not
raise. RLS simply makes no row visible to update, so the statement succeeds
having done nothing, and an error-only check passes happily while the feature
is broken.

### Sign-in could be redirected off-site

The post-login destination travels in `?next=`, which makes it attacker-chosen.
The guard was `startsWith("/") && !startsWith("//")`, which looks sufficient and
is not: the URL parser treats a backslash as a slash for special schemes and
strips tabs before parsing, so both `/\evil.com` and `/<tab>/evil.com` passed it
and resolved to another origin.

The payload is a link that sends you through a real Google sign-in on the real
domain and lands you somewhere else — about the most convincing shape a phish
can take, because every part of it up to the last hop is genuine.

The fix is to stop pattern-matching and ask the parser: resolve against the
origin, compare origins, and rebuild the path from the parsed parts. Guessing at
the syntax a browser will apply is a losing game; the browser will tell you.

---

## Two database clients, on purpose

`postgres` (postgres.js) holds the only connection the query layer uses, and
`@supabase/supabase-js` will handle auth, Storage and Realtime when Phase 2
wires them. That is a split by capability, not duplication:

| | Reaches Postgres via | Good for |
|---|---|---|
| `supabase-js` | PostgREST, over HTTP, as the signed-in user | auth session, photo upload, realtime, RLS-scoped CRUD on `meal_log` |
| `postgres.js` | a real connection, server-side | the analytics queries |

The dashboard queries are the reason for the second one. They use CTEs,
`string_agg` with an explicit ordering, correlated subqueries and window
arithmetic — `getKneeLoadByWeek` alone is five chained CTEs. PostgREST cannot
express any of that, and rewriting it to fit would mean pulling thousands of
rows into JavaScript and aggregating there, which is how a fast query becomes a
slow one.

`DATABASE_URL` should name the **transaction pooler** (`…pooler.supabase.com:6543`),
not the direct endpoint. `db.ts` keys off that to turn prepared statements off,
which the pooler requires, and to hold a small pool rather than a large one. Point
it at `:5432` and every serverless instance opens up to ten direct connections,
which exhausts the database's limit under any concurrency at all.

**Nothing in the app reads SQLite.** `scripts/port-sqlite.mjs` is the single
place that opens Alpha 1's old file, and it uses Node's built-in `node:sqlite`
rather than a driver — a native binding would put a node-gyp compile in the
Netlify build for a script that only ever runs locally. There are no native
dependencies in the tree.

---

## Phase 1 — the verification gate

Alpha 1's numbers were computed by SQLite. Alpha 2's are computed by Postgres.
`pnpm db:gate` runs all eleven dashboard queries through both and diffs the
results:

```
ok    profile          ok    strengthByQuarter   ok    muscleBalance
ok    bodyReadings     ok    liftSummary         ok    runs
ok    weightHistory    ok    sessionsByMonth     ok    recentSessions
ok    headline         ok    kneeLoadByWeek

Every query matches — every value identical.
```

Not one value needed the ±0.05 tolerance, and the tolerance reports what it
absorbed rather than swallowing it — a threshold that quietly hides a hundred
near-misses is indistinguishable from a bug.

The SQLite side runs **Alpha 1's own code**, through `tsx` against its
`lib/queries.ts`, not a copy of its SQL. A transcription that agrees with itself
proves nothing. Getting there needed a shim: those modules open with
`import "server-only"`, a package Next resolves internally and that isn't
installed in that project, so `scripts/tsconfig.dump.json` maps it to an empty
module — kept out of the root tsconfig so `next build` still enforces the guard.

**The gate caught a real bug.** SQLite's `REAL` is an 8-byte double; Postgres
`real` is 4-byte. Mapping one to the other shifted volume totals and every e1RM
by amounts that read like rounding. `double precision` is the correct mapping,
and `20260824103820_widen_floats.sql` fixes any database built before that.

The only other difference was a genuine tie — two exercises on 30 reps each,
where SQLite's ordering came from a subquery it never promised to preserve.
`string_agg(... order by reps desc, exercise)` makes it deterministic.

---

## Phase 0 — is this idea viable?

Two questions had to be answered before building anything real.

### 1. Are the estimates good enough?

Eight text-only meals, measured through the live API:

| | |
|---|---|
| Latency | p50 **5.2 s**, p95 **7.2 s** |
| Cost | **$0.013** per meal (text only; a photo adds roughly $0.008) |
| Sanity | 2 Weetabix + milk + banana → 305 kcal · 2 scoops whey → 232 kcal, 47 g protein · pint + peanuts → 505 kcal |

Those land within a few percent of the labels, and a photographed meal came back
correctly itemised in 4.9 s. At six entries a day that is about **£2.10/month**.

### 2. Does the background worker hold up?

`netlify/functions/estimate-background.mts` exists to prove three things:

| | Verified |
|---|---|
| Returns immediately, runs long | yes — **202 in 21 ms**, ran **40.2 s** |
| Writes a result that outlives the request | yes — Netlify Blobs, read back via `/jobs/status/:id` |
| Retries on failure | **no — the platform does not do this** |

The 40 s matters: **Scheduled Functions cap at 30 s**, which is exactly why the
queue is a *background* function (15 min) instead.

Netlify's docs promise a retry at 1 minute and another at 2. Measured on the
deployed site, a background function that threw was **still at `attempts=1`
after 220 seconds** — neither retry fired. `netlify dev` doesn't simulate them
either, so the behaviour is identical in both places: absent.

The likely cause is that the v2 runtime catches a thrown handler error and turns
it into a 500 *response*, which AWS treats as a successful invocation rather
than a function error. Either way, the conclusion for the design is the same:
**do not depend on platform retries.** The scheduled reconciler is the primary
recovery path, `attempts` is driven by our own code, and both behave the same
locally and in production.

### Why the model isn't asked for totals

It returns line items only; `totalsFor` sums them. Asking for both invites a
card whose total disagrees with its own rows — a bug the user can see and can't
act on. Deriving removes the failure mode and spends the model's tokens on
portions instead of arithmetic.

### Two API shapes worth knowing

- **Structured outputs reject `minimum`/`maximum` on an integer.** Zod emits
  them from `.int()` alone, before any `.min()` of yours, so a plain
  `z.toJSONSchema` is a 400. `lib/anthropic/schema.ts` strips them at the
  boundary; the zod object keeps its bounds and still enforces them on parse.
- **`server-only` throws on import outside Next.** It can't sit in a module the
  Netlify function shares, so the marker lives on the route handler instead.
- **The proxy matcher has to exclude `/jobs/*`.** In production the Next
  runtime's edge function matches before Netlify routes to a background
  function, so those requests *did* reach the proxy — which authenticates by
  cookie, while the outbox authenticates by Bearer token. A valid request was
  answered with a redirect to `/login`. The functions verify the token
  themselves, which is the right check for a caller with no cookie jar.
