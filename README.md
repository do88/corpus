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
    meal-logger.tsx      the Phase 0 test harness
    ui/                  shadcn/ui primitives
  lib/
    anthropic/schema.ts  zod -> the JSON Schema structured outputs will accept
    db.ts                the one Postgres connection
    sql.ts               shared SQL fragments: knee load, working volume
    queries.ts           SQL only — rows in, rows out
    jobs/job.ts          the shape of a queued estimate
    meal/
      schema.ts          the contract: items in, totals derived
      prompt.ts          UK portions, consistency over cleverness
      estimate.ts        the one call to Claude
      compress.ts        client-side resize before upload
      format.ts          display
netlify/functions/       background worker + status reader
supabase/migrations/     the schema
scripts/
  port-sqlite.mjs        one-time load of Alpha 1's data
  verify-migrations.sh   replay every migration into a throwaway schema
  verify-port.mts        the verification gate
```

## Running it

```bash
pnpm install
pnpm dev                 # http://localhost:3000 — app only
netlify dev --offline    # http://localhost:8888 — app + functions + blobs

pnpm db:start            # local Supabase (Docker)
pnpm db:up               # apply pending migrations
pnpm db:verify           # prove they replay cleanly from nothing
pnpm db:port             # load Alpha 1's SQLite data into Postgres
pnpm db:gate             # the verification gate — see below
pnpm design:contrast     # every colour token against WCAG AA, both themes
pnpm test:recovery       # a stuck meal, recovered — local database only
pnpm test                # the 49 metrics tests, carried over from Alpha 1
pnpm check:dashboard     # the training view model against real rows
pnpm check:access        # what the signed-in role can actually do
```

`check:access` runs against whatever `DATABASE_URL` points at, so run it against
the hosted project too:

```bash
DATABASE_URL=<hosted> pnpm check:access
```

`pnpm build` runs `next build --webpack`. Serwist, which compiles the service
worker, is a webpack plugin, and Next 16 is Turbopack-first — the two do not
compose, so the build opts out of Turbopack. It costs a few seconds and buys a
real precache manifest rather than a hand-rolled worker. Revisit when Serwist
supports Turbopack.

Needs `ANTHROPIC_API_KEY` in `.env.local`. Everything else runs locally: the
database is the Supabase CLI's Docker stack, not the hosted project.

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
2. Upload to the private `meal-photos` bucket
3. **Insert the `meal_log` row** — the meal is now on screen and safe
4. Fire the background worker, which returns 202 immediately
5. Worker estimates and writes back; Realtime swaps pending for the result

**Step 3 happens before anything slow.** The estimate is an enrichment that
arrives later, not a precondition for the entry existing. If the worker never
runs there is still a row saying you ate, which the reconciler can pick up. A
logger that loses entries while "thinking" is one you stop trusting.

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

`netlify/functions/reconcile.mts` runs every 10 minutes and is the **primary**
recovery path. Netlify's documented retries do not fire (measured — see Phase 0),
so nothing retries anything unless this does.

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
`format.ts`, `glossary.ts`, `nutrition.ts` and all **49 tests** came across
untouched — they were always pure domain rules with no SQL and no JSX, which is
exactly what made the port a copy rather than a rewrite. `dashboard.ts` needed
one change: the queries are awaited now, because Postgres is a socket where
SQLite was a file.

`pnpm check:dashboard` proves the data layer end to end without a browser:

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
