<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# do.fit — how it works, and why

The README covers installing and running it. This file is the reasoning: the
decisions, the failures that produced them, and the measurements behind them.

## The name

The name is user-facing only. The IndexedDB outbox, the Background Sync tag and
the local Supabase `project_id` are all still `corpus-*`: renaming the database
would orphan any meal queued on a phone, renaming the sync tag would leave a
registered sync nobody answers, and renaming the project would spin up an empty
Docker stack beside the ported one.

## Build and development environment

### Why the build opts out of Turbopack

`pnpm build` runs `next build --webpack`. Serwist, which compiles the service
worker, is a webpack plugin, and Next 16 is Turbopack-first — the two do not
compose, so the build opts out of Turbopack. It costs a few seconds and buys a
real precache manifest rather than a hand-rolled worker. Revisit when Serwist
supports Turbopack.

`next.config.ts` therefore declares an empty `turbopack: {}` alongside it. Next
refuses to start when it finds a `webpack` config with no `turbopack` config
beside it — a sensible guard against a config nobody migrated, but here both are
deliberate. Without it `pnpm dev` exits rather than starting. Dev stays on
Turbopack, which is faster, and does not register a service worker. If a
production worker was already controlling localhost, the app unregisters it
and clears its precache once. Meal estimation still works under plain
`pnpm dev`: the client calls a development-only Next route that delegates to
the same `processMeal` function as production, which uses the immediate-202
`/api/meals/process` route.

### The branded-product lookup

Set `MEAL_PRODUCT_LOOKUP=off` to skip the branded-product label lookup. It is
on by default and adds one Gemini call per meal with a description, but it only
runs a *search* when the description names a brand — and Google Search
grounding is billed per search rather than per token, so that gate is the whole
cost story. Turning it off restores the previous behaviour exactly: estimates
from the model's own knowledge, with no web access.

### Two environment files

#### Local development is isolated from the hosted project

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
local while `GEMINI_API_KEY` is still picked up from the first. Reversed, the
production lever would quietly operate on the local database.

It used to be the other way round — `.env.local` was the hosted project — which
is why `test:recovery` had to override `NEXT_PUBLIC_SUPABASE_URL` before it
would write anything, and why ordinary development signed in through Google
against production data.

#### No login screen locally

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

### Averages are over days you logged, not days that elapsed

`/progress` rolls a week or a month up, and that sentence is the only real
decision in it. A Tuesday with nothing on it is almost always a Tuesday you did
not open the app, not one where you ate nothing — and counting it as a zero
drags the mean down until the number says you are eating 1,400 kcal when you are
not. That is worse than useless: it is a figure you would act on.

The cost is that the average says nothing about consistency, so coverage is
reported beside it and never folded into it. "2,256 average across 10 of 31
days" is two honest facts; "728 average" is one misleading one.

Two smaller rules follow from the same instinct. Pending and failed meals are
excluded entirely rather than counted as zero — a pending meal has no numbers
yet, and marking the day logged at nothing would understate it. And protein is
scored as a floor you clear while calories are scored as a ceiling you stay
under, because "within 10%" would flatter one and punish the other.

The chart is hand-rolled rather than recharts: one series of at most 31 values
with a reference line. The chart library earns its ~390 KB on the training page
where four multi-series charts share it; here it would be the heaviest thing on
the screen to draw thirty rectangles. Unlogged days are drawn as empty slots
rather than skipped, so a gap looks like a gap — compressing the axis to only
the days with data would make a fortnight of three entries look like three
solid days.

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

1. Resize on the client — a 4000×3000 photo is several MB; the 1024px copy is
   roughly 200 KB and uses far fewer billable image tokens
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

The browser's own `SpeechRecognition` — the Web Speech API — not Gemini's audio
input. No audio reaches the estimator: Gemini only receives the text that comes
back. Cheaper, faster, and a better prompt than audio would be. Where the
browser can't do it the button isn't rendered; typing is already the fallback.

**It is not on-device, though this said so for a while.** Chrome's implementation
streams the audio to Google's speech servers — the same recognition behind
everything else Chrome dictates into. Android *can* recognise locally, but it is
not guaranteed and this code does not ask for it. So the honest statement is that
your voice goes to Google and not to us, which is a different promise from the
one originally written here and worth stating correctly: it is the difference
between "nobody hears this" and "the same company that already runs the browser
hears this".

### Recovery is ours, not the platform's

`src/app/api/cron/reconcile/route.ts` is the **primary** recovery path, and
nothing retries anything unless it does. Documented platform retries were
measured and never fired (see Phase 0), so recovery has never been anyone's job
but ours.

**The schedule is ours now, which is most of why this moved.** A hosted scheduler
sets the interval and is quiet when it fails: `*/10 * * * *` was once accepted at
deploy and simply never fired, so the safety net sat unarmed and nothing said so.
Railway runs a separate `reconcile` service on `*/15 * * * *`: a
`curlimages/curl` container that wakes, calls this route with the shared secret,
and exits. Cron services are billed for the seconds they run, so quarter-hourly
costs about what daily did.

**Authentication is the secret and nothing else.** This is an ordinary route
handler on a public URL, not a scheduled function something else refuses to
invoke over HTTP, so the bearer check at the top of it *is* the boundary rather
than a second line behind one. The proxy cannot help: it authenticates by cookie, and `/api/cron/` is excluded from its matcher
precisely because a scheduler has no cookie jar.

It is also still the only thing that can recover a meal whose worker was never
invoked at all: signal lost between writing the row and firing the request, or a
deploy mid-flight. No queue can retry a job it never saw; a sweep finds it
because the row *is* the job.

Both paths call the same `processMeal`, which is what makes them genuinely
equivalent rather than merely similar. The sweep works to a 240-second budget
inside a 300-second ceiling and logs what it deferred — a sweep that silently
truncates reads as "all clear" when it isn't.

`pnpm test:recovery` proves it: insert a meal that looks stuck, run the real
processing path, check macros came back, delete the row. It refuses to run
against anything but the local database — writing invented meals into the real
log would put food that was never eaten into a record whose entire value is
being true.

---

## The Body dashboard

Alpha 1's dashboard, ported mobile-first. It is served at `/body` since
Training became Body, and `next.config.ts` keeps a permanent redirect from the
old path for anything still linking to it. `metrics.ts`,
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

It is **eight** now. A second trim took out what another app already draws
better — sleep, resting heart rate and weekly movement are Garmin Connect's
own screens, recent sessions is Hevy's — and turned the quarterly strength
chart into one number, and each section's query left the page with it. The
watch series were deleted outright. `getStrengthByQuarter`,
`getRecentSessions` and `getHeadline` stay in `queries.ts`, because db:gate
diffs them against Alpha 1 and the advisor reads recent sessions.

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
sessions      474  (2021-10-05 → 2026-09-07)
cadence       Holding: 7 against 7, to 2026-09-07
protein       175 g from 79.44 kg lean
strength      455 kg, 96% of 474, 4× bodyweight
watch         161 active min a week, 59 bpm, 6.6 h (30 days to 2026-09-01)
```

### Windows end where the data does

Hevy and the watch arrive once a week, when the sync runs on Monday
mornings, so "the last 28 days" has three possible end points and two of them
are wrong.

- **Today** is wrong six days in seven. By Sunday the newest six days have
  not arrived, so a window ending today holds three weeks of data and one of
  nothing. An average survives that; a *total* over a fixed divisor does not.
  The watch's active minutes were thirty days of minutes divided by thirty
  days, and read up to a fifth low every week until Monday put them back.
- **The last workout** is Alpha 1's anchor, and `since()` still uses it for
  the training queries db:gate diffs. It cannot see a break: a month off
  still reads "7 against 7", because the window simply ends at the last
  session.
- **The last synced day** is right. `getCadence` ends both windows on the
  later of the last workout and the last day the watch sent — the watch
  reports every day whether or not you lifted, and Hevy still covers a week
  the watch failed. `getWatchSummary` ends on its own last day and divides by
  the days actually present. The headline says the date in words, so the
  comparison can be checked rather than trusted.

### The figure that turns

"Where the sets go" draws a real body with every muscle grown and warmed by
how much it was trained, and turns it on a drag. The body is one base mesh
with the muscles painted onto it: each vertex is pushed out along its normal
by its muscles' growth and tinted by their share of the sets. The sizes are
still numbers `lib/training/physique.ts` computed and tested — the mesh
changed what the figure looks like, not what it says.

It began as ellipsoids on a mannequin of capsules. Same encoding, and it
looked like a molecule model. The brief for the rebuild was the cortical
homunculus: a recognisable person with the data's proportions, pushed far
enough that nobody reads them as an accident.

The decisions, in the order they matter:

- **Sets, not tonnage.** A squat moves several times the weight of a curl, so
  sizing by kilograms would draw a picture of which lifts are heavy rather than
  where the work went.
- **Radius from the square root** of each muscle's share of the top muscle,
  treating sets as cross-sectional area. Linear left everything outside the
  top three looking absent; the cube root flattened the differences until the
  figure said nothing. Bounded to half and 1.9× resting size, so a
  never-trained muscle is drawn small rather than as a hole — and the top
  end is grotesque on purpose. At 1.5× the figure read as a plausible body,
  and the eye forgives a plausible body its differences.
- **Two windows, because the data demanded it.** Over twelve months biceps and
  triceps are ten sets and seven; over all time triceps is seven hundred. A
  twelve-month figure alone draws pencil arms on someone who knows they
  trained arms for years, and a picture that contradicts what you know reads as
  broken. The switch is where the figure earns its place: it shows the
  programme changing shape.
- **`full_body`, `cardio` and `other` stay off it.** None is a place on a body,
  and spreading them across every muscle would be inventing where the work
  went. They do not set the scale either, or a month of burpees would shrink
  every real muscle.
- **Heat, not ink.** Skin stays grey and each muscle warms from a darker grey
  through the energy amber to red by its share of the sets. It used to be the
  page's own ink, on the rule that colour belongs to metrics; it was asked
  for in colour, and the warm ramp is the heat map every gym app draws, so it
  is the reading anyone reaches for. Every stop is a token read at runtime,
  so dark mode is the same figure rather than a second palette.

#### Painting muscles onto one skin

`pnpm build:body-mesh <obj>` turns a base-mesh OBJ into
`public/models/body.bin`, once. The output is committed and the OBJ is not.

- **Regions are rules, not placed shapes.** `body-regions.ts` labels each
  vertex from a band of the body plus the way its skin faces: the chest and
  the upper back are the same height and the same distance from the midline,
  and only the normal tells them apart. The arm is found by distance from its
  centre line, which the script fits from the mesh — an A-pose arm hangs at an
  angle no box follows, and typed coordinates fit one mesh and miss the next.
- **The labels are blurred across the mesh.** A hard label per vertex paints
  patches with cut edges, and a patch pushed outward lifts off the body in one
  piece, like a plate. Fourteen passes of neighbour-averaging turn every seam
  into a gradient, so a muscle swells from its middle and fades into the skin
  around it — colour and shape at once. Eight was tried first and the quads
  came out as padded shorts: the blur has to be wider than the bulge is tall.
- **A bespoke binary rather than glTF.** Four arrays with one writer and one
  reader, both in `body-mesh.ts`, positions at 16 bits. A glTF loader would be
  a second three.js add-on to read the same four arrays out of a more general
  container. The muscle numbers index `BODY_MUSCLES`, so the file stores the
  count and refuses to load against a different list rather than painting
  the wrong muscles in silence.

The file passes through the proxy like a page does — only images are exempt —
so it is served to a signed-in session and nobody else. It is also not in the
service worker's precache, and that rests on a detail of Serwist worth
knowing: `additionalPrecacheEntries` *replaces* its glob of `public/` rather
than adding to it, so naming `/offline` there means nothing under `public/` is
precached at all. Keep it that way. Precaching the mesh would put 573 KB on
every install for one card, and a precache request made before sign-in would
be redirected by the proxy and could store the login page under its name.

It turns on the vertical axis only, with `touch-action: pan-y` so a vertical
swipe still scrolls the page. It spins slowly when idle and not at all under
reduced motion, and renders only while something moves and it is on screen.
three.js loads behind `next/dynamic`, so the other four screens never pay for
it.

Two windows are two calls to `getMuscleBalance` rather than one wider query, because that function
is one of those `db:gate` diffs against Alpha 1's own code, and changing its
shape would take it out of the gate for a feature that does not need it.

**`DATABASE_URL` missing in production is React error #441.** The training page
needs a direct Postgres connection, and `db.ts` used to fall back to the local
Docker stack when the variable was unset — which on any deployed server means
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
timeout`. In production that was a hard crash on the dashboard while each of its
queries was individually healthy. The same code against `:5432` returns
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
deploy build for a script that only ever runs locally. There are no native
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

A throwaway background function existed to prove three things:

| | Verified |
|---|---|
| Returns immediately, runs long | yes — **202 in 21 ms**, ran **40.2 s** |
| Writes a result that outlives the request | yes — read back through a status route |
| Retries on failure | **no — measured, and none fired** |

Documented retries promised one at a minute and another at two. Measured against
a deployed site, a background function that threw was **still at `attempts=1`
after 220 seconds**, and the local emulator did not simulate them either — so
the behaviour was identical in both places: absent.

The conclusion for the design is what survived the move:
**do not depend on platform retries.** The scheduled reconciler is the primary
recovery path, `attempts` is driven by our own code, and both behave the same
locally and in production.

### Choosing the model, measured

The comparison script ran the Phase 0 reference meals — the ones whose values
were measured by hand — through every candidate on the *same* system prompt and
the *same* schema, and printed error against those labels beside the measured
cost. Same prompt matters: give each model its own tuned prompt and you are
comparing the prompting, not the models. The script and the Anthropic SDK it
needed were removed once the choice was made; both are in git history if the
question is ever reopened. The numbers it produced are kept here.

Measured August 2026, text-only, with low thinking/effort:

```
                         kcal   protein   vague kcal    $/meal   latency
claude-opus-5            7.1%      8.9%        11.0%   $0.01161    4.5 s
claude-sonnet-5          8.6%      7.6%        11.5%   $0.00406    4.1 s
claude-haiku-4-5        15.0%     13.0%        22.8%   $0.00154    1.9 s
gemini-3.7-flash          6.3%      7.6%         9.1%   $0.00164    4.4 s
gemini-3.6-flash          6.7%      9.8%         8.6%   $0.00094    2.1 s
gemini-3.5-flash          6.4%      9.8%         9.7%   $0.00540    3.0 s
gemini-3.5-flash-lite     8.3%     11.1%        11.3%   $0.00053    1.2 s
gemini-3.1-flash-lite     6.7%      8.5%        12.5%   $0.00058    1.5 s
```

Twenty meals: the four Phase 0 measured by hand, twelve composed from published
per-100g values, and four deliberately vague — "a handful of almonds", "a
supermarket meal deal sandwich". The vague column is the interesting one.
Anything can estimate "200g grilled chicken breast"; the spread opens up on the
phrasing real logging actually uses, and it roughly doubles every model's error.

**The sample size mattered more than the models did.** At four meals Sonnet
looked half again as wrong as Opus on protein (14.6% against 9.7%) and that was
noise: at twenty it is 7.6% against 8.9%, which is *better*. Opus keeps a small
lead on calories, Sonnet a small lead on protein, and at this sample size
neither gap is worth defending. Haiku is the one clear result — worse on every
measure, and worst where it matters most, at 22.8% on vague meals.

So the honest reading is that Opus and Sonnet are indistinguishable here and
Sonnet is a third of the price. Haiku is not a candidate. Gemini changes the
decision again: 3.1 Flash-Lite lands in the same accuracy band at about a
seventh of Sonnet's cost and lower latency.

3.5 Flash-Lite is newer and five thousandths of a cent cheaper per meal, but it
gave up 1.6 points on calories and 2.6 on protein. That saves less than one cent
per month at six meals a day. 3.7 Flash has the strongest Gemini row, but its
small gains are below what these labels and this sample can defend; it costs
2.8 times as much and takes nearly three times as long. The cost-first choice
would therefore be 3.1 Flash-Lite; production deliberately uses
`gemini-3.7-flash` as the quality-first choice, especially for vague meals.

Three things the runs themselves taught: `output_config.effort` is rejected by
Haiku 4.5, so its first attempts were `invalid_request_error` and no numbers at
all. The bench keeps low thinking/effort wherever the model accepts it so model
rows retain the same latency and cost posture; production deliberately uses
medium thinking as a quality-first choice. Gemini's billed output includes
thinking tokens, which are reported separately from visible candidate tokens.
And free-tier quota errors carry a retry delay; the bench respects it instead
of immediately burning every remaining meal on the same 429.

### What a call actually cost

The table above was measured once, by a benchmark script that has since been
deleted. Everything after it — the branded-product lookup, and then an advisor
that can make eight model calls with a growing transcript behind each — was
added without anyone knowing what it cost. The tokens were not even missing:
`estimate.ts` had read Gemini's usage since the day it was written, and nothing
consumed the figure.

`lib/ai/cost.ts` attaches a price to the number already in hand. Both the
advisor and the meal estimator log one line per call, so the running app states
what the benchmark used to.

Three things in it are there because of how a price table goes wrong quietly:

- **Two rates, chosen by date.** Gemini 3.7 Flash is on introductory pricing
  that **doubles on 1 January 2027**. A table holding only today's price would
  silently halve every figure that morning, and the numbers would still look
  plausible. Both rates are written down and the date picks.
- **Unpriced is `null`, never `0`.** A model missing from the table is
  reported as unpriced. Zero would be indistinguishable from a free call and
  would understate the total in silence — the same shape of bug as the
  analytics row cap.
- **Cached prompt tokens are subtracted, not added.** Gemini's
  `promptTokenCount` *includes* the cached ones, which is the opposite of
  Anthropic's convention; adding them would bill the cached portion twice and
  at ten times its rate. Thinking tokens are billed as output and reported
  separately from the answer, which is the correction `estimate.ts` was already
  making inline and now shares.

Pricing uses the model **requested**, not the version Gemini reports back:
that comes dated (`…-001`), which no table can hold, and prefix matching would
cheerfully price `flash-lite` at `flash`'s rate.

Every call is also written to `ai_call`, because a log line answers "what did
that question cost" and cannot answer "what did September cost", which is the
only version anybody asks. `ai_spend(days)` aggregates it in SQL rather than in
Node — the sister project's dashboard read rows into JavaScript behind a limit
and silently dropped the oldest days once it outgrew the cap — and reports an
`unpriced` count beside the total, so a sum containing a model with no price on
file is visibly a floor rather than passing as a figure.

Two properties of the write are deliberate. It **never throws**: a book-keeping
row must not be able to fail the meal it describes, so a refused insert is a
warning and nothing else. Which means a missing GRANT here would be *silent* —
nothing would break, the table would just stay empty and every total would read
zero — so `check:access` asserts the insert and the function, and asserts the
row reads back rather than only that no error was raised.

There is no grant for update or delete. A record of what was spent is not a
thing to edit.

### Why the model isn't asked for totals

It returns line items only; `totalsFor` sums them. Asking for both invites a
card whose total disagrees with its own rows — a bug the user can see and can't
act on. Deriving removes the failure mode and spends the model's tokens on
portions instead of arithmetic.

### Two API shapes worth knowing

- **`server-only` throws on import outside Next.** It can't sit in a module the
  maintenance scripts share, so the marker lives on the route handler instead.
- **The proxy matcher excludes `/api/meals/process` and `/api/cron/`.** The
  proxy authenticates by cookie; the outbox calls the first with a Bearer token
  and the `reconcile` cron service calls the second with the cron secret. Left in the
  matcher, both valid requests were answered with a redirect to `/login`. Each
  route verifies its own caller, which is the right check for one with no
  cookie jar.
