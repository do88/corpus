# do.fit

Food logging by photo and a sentence. Point the phone at a plate, say what it
is, and get kcal and macros back. Installable PWA, Supabase behind it, Claude
Opus 5 doing the estimating.

The name is user-facing only. The IndexedDB outbox, the Background Sync tag and
the local Supabase `project_id` are all still `corpus-*`: renaming the database
would orphan any meal queued on a phone, renaming the sync tag would leave a
registered sync nobody answers, and renaming the project would spin up an empty
Docker stack beside the ported one.

The plan is in [docs/IMPLEMENTATION-PLAN.md](docs/IMPLEMENTATION-PLAN.md).

```
src/
  app/
    api/meals/analyze/   synchronous estimate — the boundary for the browser
  components/
    account-form.tsx     name, picture, sign out
    app-header.tsx       the oversized iOS title
    tab-bar.tsx          bottom navigation, safe-area padded
    metric-card.tsx      a figure, its ring, and its target
    ui/ring.tsx          the SVG progress ring
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

Native iOS, or as close as a web app gets. The rules, in the order they matter:

1. **Depth is the grid.** A cool grey ground with white cards floating on it,
   and hierarchy carried by elevation and radius rather than rules. Every card
   gets two shadows — a tight contact shadow that grounds it and a wide ambient
   one that lifts it. Either alone reads as a sticker or a smudge.
2. **The system typeface.** `-apple-system` resolves to SF Pro on Apple
   hardware, which is the single biggest thing that stops a web app feeling like
   a web page: the type is literally the system's. No webfont means no download
   and no swap flash.
3. **Generous radii.** 22px on cards, fully round on controls. iOS radii are
   larger than web instinct suggests, and being timid is what makes a page read
   as a website with rounded corners.
4. **Colour is per metric.** Each figure owns a hue and keeps it everywhere it
   appears — ring, value, icon. Amber for energy, blue for protein.
5. **Tabular numerals**, so a changing figure never reflows its row.

Navigation is a bottom tab bar, padded for the home indicator with
`env(safe-area-inset-bottom)` — the detail people notice without being able to
name it. The title is oversized and scrolls away, iOS-style, rather than sitting
in a fixed bar.

### The mark

An arc with its head broken off as a dot. It is the **"o"** and the **"."** of
do.fit, it is a **progress ring** — already the app's whole visual language —
and it is **open**, because a closed circle says finished and a tracker never
is.

The dot sits at the arc's head rather than in the middle, and that is the
design rather than a flourish. Centred, it was a **power button**: an open ring
around a dot is one of the most worn symbols there is, and at 29px the mark lost
to it outright. Moving the dot out leaves an asymmetric silhouette with nothing
in the centre, which reads as a progress head and as nothing else.

Decided by drawing four candidates and looking at them at 88, 44, 29 and 18px
and again in greyscale, which is where a logo is actually settled — one of the
rejects was a fingerprint, another a loading spinner. `components/brand.tsx`
exports `Logomark` and `Wordmark`; `app/icon.svg` is the favicon and
`app/icons/[size]` renders the PWA icons from the same geometry.

### The depth, specifically

Four things carry it, and they are cheap:

- **A hairline ring** on every card, drawn as the first layer of the shadow.
  Shadow alone leaves the top edge undefined, which is exactly where the eye
  looks for an object's boundary — a pale card on a pale ground dissolves
  without it.
- **A specular top edge**: a bright hairline fading out by the shoulder, masked
  so it follows the radius round the corners. A real surface lit from above is
  brightest precisely there. This is the single detail doing the most work.
- **Gradients rather than fills.** Two percent of lightness across a card is
  invisible as colour and unmistakable as a lit surface. Rings get the same
  treatment along the arc, plus a drop shadow in their own hue so they lift off
  the track without a grey haze.
- **Presses that sink.** Tapping scales to 0.965 *and* collapses the shadow, so
  it reads as pushed toward the page rather than merely shrunk. Scaling alone
  looks like a zoom; losing the shadow is the part the hand believes.

Recessed things get the inverse — the composer field and the ring tracks take a
shadow falling inward from their top edge, so they sit *into* the surface rather
than on it.

Dark mode inverts the whole trick: cards go **lighter** than the ground, because
a shadow is invisible against near-black. Elevation becomes luminance, and the
ring does the work the shadow does in daylight.

The theme follows the phone by default, with a toggle in the header cycling
system → light → dark. Three states rather than a switch, because "follow the
device" is a real preference — dropping it would mean telling the app to go dark
twice a day.

### The targets compute themselves

Four numbers, and only two are decisions. `lib/meals/targets.ts`:

- **BMR** uses **Katch–McArdle** when a lean-mass reading exists, falling back to
  Mifflin–St Jeor when it does not. Mifflin works off total bodyweight, which
  treats a kilo of fat as metabolically equal to a kilo of muscle; at 30% body
  fat that overstates the burn. On the reading on file it returns 2086 against
  the scale's own measured 2105 — a 1% disagreement between a formula and a
  bioimpedance device, which is about as much validation as either deserves.
- **Activity** is read from sessions actually logged in the last 28 days, not
  chosen from a dropdown where everyone picks "moderately active" and is wrong
  in the same direction.
- **The deficit is a percentage**, not a fixed −500. A fixed number gets
  progressively harsher as bodyweight falls — 500 off 2900 is 17%, 500 off 2300
  is 22% — so a plan that starts comfortable ends up punishing exactly when it
  gets hard.
- **Protein is allocated first**, at 2.4 g per kg of *lean* mass, and never
  moves. A deeper deficit comes out of carbs and fat. That is the difference
  between saying protein comes first and meaning it.
- **Fat has a floor** at 0.8 g/kg of *goal* weight — anchored to the target so
  it stays still while the weight moves. A floor that falls as you lose is not a
  floor.
- **Carbs take the remainder**, so the four always sum back to the calorie
  target. Picking three numbers independently is how a tracker ends up showing
  macros that add to a different total than the one printed above them.

Ten tests cover the properties rather than the arithmetic: that BMR ignores added
fat, that protein holds steady as the deficit deepens, that the fat floor does
not follow the weight down, that carbs never go negative, and that the projected
rate of loss stays under 1% of bodyweight a week.

### Two sets of hues, because AA demands it

`pnpm design:contrast` checks every token in both themes, and it survived the
redesign unchanged in spirit. Every hue exists twice: an `--accent-*` vivid
enough to read as a ring, and an `--ink-*` dark enough to read as an 11px
label. WCAG asks 4.5:1 of text and only 3:1 of a graphic, and one token trying
to be both ends up too dark to be vivid and too light to be legible.

Six tokens came in below threshold on the palette's first run, the separators
among them. Every one was tuned until it passed, and none was eyeballed — which
is the entire point of having the script rather than an opinion.

```
light                          dark
  --foreground      16.84:1      --foreground      17.40:1
  --muted-foreground 5.35:1      --muted-foreground 7.88:1
  --accent-energy    3.21:1      --accent-energy    8.76:1
```

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

The browser's own `SpeechRecognition` — the Web Speech API — not a model of
ours. No Anthropic call, no audio anywhere near Claude: the model only ever
receives the text that comes back. Cheaper, faster, and a better prompt than
audio would be. Where the browser can't do it the button isn't rendered; typing
is already the fallback.

**It is not on-device, though this said so for a while.** Chrome's implementation
streams the audio to Google's speech servers — the same recognition behind
everything else Chrome dictates into. Android *can* recognise locally, but it is
not guaranteed and this code does not ask for it. So the honest statement is that
your voice goes to Google and not to us, which is a different promise from the
one originally written here and worth stating correctly: it is the difference
between "nobody hears this" and "the same company that already runs the browser
hears this".

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

One page view is **17 statements**, down from 33. `getLiftSummary` asked three
questions per lift, one lift at a time — twelve round trips answered now by a
single `distinct on`; `getRecentSessions` asked for each session's exercises
separately, which is one query over `workout_id = any(...)`. Parallelising them
had not helped: on a pooled connection `prepare` is off, so every parameterised
query holds its connection until it returns and the rest queue behind it.

Collapsing the first one surfaced a tie nobody had noticed. A 140kg × 6 deadlift
appears on 2026-07-13 and on 2022-12-17, identical e1RM, so "the best set" was
decided by whichever row the plan reached first. Changing the query changed the
plan and the peak date jumped back four years. The old answer was never chosen,
only observed — `date desc` now states the intended reading and makes it
plan-independent. Same shape as the `string_agg` ordering below, caught the same
way.

`pnpm check:dashboard` proves the data layer end to end without a browser — and
calls the *uncached* builder, because a smoke check answered from cache proves
nothing about the database:

```
sessions      468  (2021-10-05 → 2026-08-15)
protein       175 g from 79.44 kg lean
knee          median 39/wk, peak 114
strength      Deadlift 168kg, Squat 96kg, Bench 113.3kg, OHP 72kg
```

**`DATABASE_URL` missing in production is React error #441.** The training page
needs a direct Postgres connection, and `db.ts` used to fall back to the local
Docker stack when the variable was unset — which on a Netlify server means
connecting to nothing. The server component threw, and production reported it as
"an error occurred in the Server Components render" with the specifics omitted,
while the log said ECONNREFUSED against `127.0.0.1` rather than naming the
variable nobody set. Outside development the variable is now required and its
absence says so.

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

### The service worker could delete a sign-in in progress

Giving the worker cookie *reads* fixed Background Sync. Giving it cookie
*writes* — which came in the same change — could break sign-in, and that is a
much worse trade than it looks.

`getSession()` does more than read. If it finds a session in storage that is
expired or malformed it calls `_removeSession()`, and that runs
`removeAllPKCEVerifiers()`, wiping every `…-code-verifier` cookie. The worker
flushes the outbox on a Background Sync event, which can fire at any moment —
including the thirty seconds spent on Google's consent screen. Come back, and
the verifier the sign-in was about to exchange has been deleted by your own
service worker. Supabase's error even says the storage was cleared; it just
cannot say who cleared it.

The worker now reads cookies and never writes them: `setAll` is a no-op, and
`set` is left off the `CookieStore` type so it is unavailable rather than merely
discouraged. A token it refreshes is not persisted, costing one refresh next
time the page opens. In exchange, a background process cannot sign you out or
invalidate a sign-in in flight — and nothing running with nobody watching should
be able to do either.

### The proxy ate the PKCE verifier

Google sign-in failed with *"PKCE code verifier not found in storage"*, which
reads like a browser problem and was not.

The OAuth return lands on `/auth/callback?code=…`, and `src/proxy.ts` matched
that path. It builds a server client and calls `getUser()` to refresh the
session, and `@supabase/ssr` writes back through `setAll` when it does. That
cookie set includes `sb-<ref>-auth-token-code-verifier` — the PKCE verifier the
callback is about to need — and with no session to validate, the refresh cleared
it. The handler then called `exchangeCodeForSession` and was told the verifier
was missing, having had it deleted a few milliseconds earlier by its own
middleware.

`/auth/` is excluded from the matcher now. There was never anything for the
proxy to do there: those paths are already public, so it was refreshing a
session for the one request whose entire purpose is to create one.

The login button also swallowed thrown errors — only the *returned* error was
handled, so a throw left `busy` stuck true and the button dead with nothing on
screen. Silence is the worst outcome on a sign-in screen.

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

`DATABASE_URL` should name the **session** pooler — port **5432** on the pooler
host — and not the transaction pooler on 6543.

Transaction mode is the usual serverless advice and it broke this app. Every
dashboard query is fast against the hosted database on its own (24–179 ms,
measured), but the ten that `getDashboardData` runs through `Promise.all` either
hung past seven minutes or returned `canceling statement due to statement
timeout`. In production that was a hard function crash on `/training` while each
of its queries was individually healthy. The same code against `:5432` returns
the whole dashboard immediately.

The likely mechanism is the `prepare: false` that transaction mode requires:
postgres.js needs a Describe round trip before Bind and Execute for every
parameterised query, and transaction mode is free to hand those to different
server connections. Session mode gives each client a real connection for its
lifetime, so prepared statements work and the ordering holds. This app makes a
handful of requests a day and does not need the multiplexing it was paying for.

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

### Choosing the model, measured

`pnpm compare:models` runs the Phase 0 reference meals — the ones whose values
were measured by hand — through every candidate on the *same* system prompt and
the *same* schema, and prints error against those labels beside the measured
cost. Same prompt matters: give each model its own tuned prompt and you are
comparing the prompting, not the models. Add a filter to run a subset
(`pnpm compare:models claude`); every row is real API calls against real money.

Measured August 2026, text-only:

```
                    kcal err   protein err   $/meal    latency
claude-opus-5          4.5%          9.7%   $0.0116     4.5 s
claude-sonnet-5        4.2%         14.6%   $0.0040     4.0 s
claude-haiku-4-5      14.6%          8.5%   $0.0015     3.0 s
```

Opus stays. Sonnet matches it on calories at a third of the price but is half
again as wrong on protein, and protein is the number this app exists to hit —
the calorie target is a ceiling you approach, the protein target is a floor you
clear. Haiku is cheapest and reads a tin of mackerel 30% low.

The spread is £2.10 a month against £0.28. That is not enough to buy a worse
estimate of the one figure that matters.

One thing the run itself taught: `output_config.effort` is rejected by Haiku
4.5, so its first four attempts were `invalid_request_error` and no numbers at
all. The comparison keeps `effort: "low"` wherever the model accepts it, because
that is what the app sends — dropping it everywhere would measure something the
app does not do.

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
