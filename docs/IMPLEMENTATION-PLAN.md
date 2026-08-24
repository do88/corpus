# Corpus — implementation plan

*Corpus*: a body, and a body of collected data. Both meanings intended — it's a
corpus of data about your corpus, kept under your own roof.

Alpha 2.0. A personal health PWA: log food by photo, voice or text; pull Hevy;
drop Garmin CSVs and RENPHO screenshots; see everything in one dashboard under
your own account.

**Greenfield.** Nothing from Alpha 1 is preserved for its own sake. The parts
worth carrying over are named explicitly in Phase 1 and Phase 4; everything else
gets rewritten or dropped.

---

## Agreed specs

| Decision | Choice | Why |
|---|---|---|
| Platform | Next.js PWA, **Android only** | Background Sync works; no app store; one codebase |
| Data, auth, files | **Supabase** — Postgres, Google auth, Storage, Realtime | One service instead of three; already familiar |
| Hosting | **Netlify** | Background Functions: 15 min on the free tier; existing projects there |
| Vision model | **`claude-opus-5`**, `effort: low`, structured outputs | ~£2.20/mo at 6 entries/day; strongest at portion size and regional food |
| Background work | **Netlify Background Function + DB-as-queue** | No fourth service; the `meal_log` row *is* the job record |
| Sync cadence | Hevy monthly cron; Garmin + RENPHO manual upload | Agreed connectivity level |

**Out of scope:** iOS, Google Health / Health Connect, Apple Health, the Garmin
API, micronutrients, multi-user.

---

## Architecture

```
Android PWA  ──────────────────────────────────────────────
  camera / mic / text
  client-side resize (1024px, q0.8)      <- cost + storage critical
  IndexedDB outbox
  service worker: precache + Background Sync
  Supabase Realtime  <- analysis result pushed back

Next.js on Netlify  ───────────────────────────────────────
  POST /api/meals            upload, insert pending row, invoke the worker
       /api/import/garmin    CSV upload
       /api/import/renpho    screenshot -> same vision pipeline

netlify/functions/  ───────────────────────────────────────
  analyze-meal.mts     background: true  — 15 min, auto-retried, returns 202
  reconcile.mts        schedule: */10    — sweep stuck rows (belt and braces)
  hevy-sync.mts        schedule: monthly — invokes a background function

Supabase  ─────────────────────────────────────────────────
  Postgres · Google auth + RLS · Storage · Realtime

Claude Opus 5  ────────────────────────────────────────────
  vision + structured output
```

### Why Netlify Background Functions rather than Inngest

Netlify covers everything we'd have reached for Inngest to do:

- **15 minute limit** — a 3–8 second vision call is nowhere near it
- **Immediate 202, no result returned to the caller** — already our design: the
  worker writes to Postgres and Realtime pushes the row to the phone
- **Automatic retries** at 1 min and 2 min after a failed invocation
- **Free tier**

Background work is a Netlify Function (`config.background = true`) rather than a
Next.js route handler — the worker sits beside the app, not inside it. The
`meal_log` row remains the job record, and a scheduled reconciler sweeps anything
that fell through all the retries.

---

## Phase 0 — Spike

One genuine unknown, one cheap smoke test. Everything downstream is wasted effort
if the first fails.

**1. Are the estimates good enough?** Ten real meals — photo plus a short
description — compared against a weighed reference. This is the whole product
risk in one experiment.

**2. Does a background function behave as documented?** Invoke it, run past 30s,
confirm it writes its result and that a forced failure retries. Half an hour.

Also worth recording: p50/p95 latency. Not a gate any more — 15 minutes is
enormous headroom — but it sets how long the pending state shows in the UI.

Build one route and one throwaway page. No auth, no Supabase, no persistence,
running against the current local setup.

**Exit criteria**
- Estimates within ~20% on kcal and protein for familiar meals
- A background function runs long, writes its result, and retries on failure

If estimates come back poor, the fallbacks in order are: richer prompt with
worked examples → require a text description alongside every photo → a higher
effort setting. Only if all three fail is the concept wrong.

---

## Phase 1 — Foundation

**Supabase project** — Postgres, Google auth provider, Storage buckets
(`meal-photos`, `renpho-shots`), RLS on every table.

**Schema carried over from Alpha 1, ported to Postgres**
`workouts`, `workout_exercises`, `sets`, `exercise_templates`, `routines`,
`activities`, `body_composition`, `profile`, plus views `v_sets`, `v_workouts`.

**Schema — new**
```sql
create table meal_log (
  id            uuid primary key default gen_random_uuid(),
  logged_at     timestamptz not null default now(),
  local_date    date not null,          -- the day it counts toward
  status        text not null default 'pending',   -- pending|analyzed|failed
  attempts      int  not null default 0,
  photo_path    text,
  note          text,                   -- typed or transcribed
  kcal          int,
  protein_g     int,
  carbs_g       int,
  fat_g         int,
  items         jsonb,                  -- [{name, qty, kcal, protein_g, ...}]
  confidence    text,                   -- low|medium|high
  assumptions   text,                   -- shown in the UI
  edited        boolean not null default false,  -- user corrected the estimate
  model         text,
  raw_response  jsonb,
  error         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on meal_log (local_date);
create index on meal_log (status) where status = 'pending';
```

**SQL port — the mechanical changes**

| SQLite | Postgres |
|---|---|
| `strftime('%Y-%m', date)` | `to_char(date, 'YYYY-MM')` |
| `date(date, '-12 months')` | `date - interval '12 months'` |
| `GROUP_CONCAT(x, ' · ')` | `string_agg(x, ' · ')` |
| `CAST(strftime('%w', date) AS INT)` | `EXTRACT(DOW FROM date)` |
| dates stored as TEXT | real `date` columns |

`COALESCE`, `CASE WHEN`, `ROUND`, `substr` and `||` are unchanged.

**Carried over unchanged — the genuinely reusable parts**
- `lib/metrics.ts` — pure domain rules, no SQL, no JSX. Ports as-is.
- `lib/nutrition.ts`, `lib/glossary.ts`, `lib/format.ts`
- `metrics.test.ts` — 49 tests, still valid
- Design tokens and the validated colour palette

**RLS — single user**
```sql
create policy "owner only" on <table>
  for all using (auth.jwt() ->> 'email' = '<your email>');
```
Plus a server-side guard in every route handler.

**Verification gate:** a script that runs every dashboard query against both the
old SQLite and the new Postgres and diffs the output. Numbers must match exactly
before Phase 2 starts — a silent off-by-one in a date bucket is very hard to
spot later.

---

## Phase 2 — The logging loop

The core product. Everything else is supporting cast.

**Capture**
- Camera: `<input type="file" accept="image/*" capture="environment">`
- Voice: Web Speech API (Android Chrome, free, instant) → text
- Free-text field, always available

Voice is transcribed **client-side to text**; the model receives text, never
audio. Cheaper, faster, and a better prompt.

**Client-side resize before anything else** — 1024px longest edge, JPEG q0.8,
~200 KB. Non-negotiable for two reasons:
- A raw 4000×3000 photo is ~16,000 image tokens vs ~1,600 resized: **10× cost**
- 4 MB blobs blow the IndexedDB quota within a few meals

**Flow**
1. Resize → write to IndexedDB outbox → **entry appears immediately, pending**
2. Upload photo to Storage; insert `meal_log` row
3. Invoke `analyze-meal` background function (returns 202 instantly)
4. Worker calls Claude, writes macros, sets `status='analyzed'`
5. Realtime pushes the row back; UI swaps pending → result

**Structured output contract**
```jsonc
{
  "items":     [{ "name": "tin of mackerel", "qty": "1 tin (125g)",
                  "kcal": 280, "protein_g": 26, "carbs_g": 0, "fat_g": 20 }],
  "kcal": 460, "protein_g": 32, "carbs_g": 30, "fat_g": 22,
  "confidence": "medium",
  "assumptions": "assumed standard 125g tin, in oil, drained"
}
```
`assumptions` is shown in the UI — it's how a wrong guess gets spotted fast.

**Today screen**
- Running kcal and protein against 2,490 / 175 g
- Per-entry list: thumbnail, items, confidence, assumptions
- **Tap to correct any number**, setting `edited=true`. A logger you can't
  correct is a logger you stop trusting.

---

## Phase 3 — Durability and offline

**Service worker** — Serwist. Precache the shell; network-first for data with a
cached fallback.

**Outbox** — IndexedDB holds the resized blob, note and local timestamp.

**Flush triggers** — all three, even Android-only:
1. Background Sync `sync` event (fires with the app closed)
2. App open
3. `online` event

Background Sync doesn't fire in every state, and (2) and (3) are a few lines each.

**Server reconciler** — `netlify/functions/reconcile.mts`, every 10 min. Netlify
already retries a failed invocation at 1 and 2 minutes, so this only catches what
fell through all of them (bad deploy, DB write failure):
- pick up `status='pending'` rows older than 10 min with `attempts < 3`
- on the third failure set `status='failed'` with the error
- failed rows are visible and manually retryable in the UI

**States the UI must show:** `queued (offline)` · `uploading` · `analysing` ·
`done` · `failed — retry`. Silent failure is what kills trust in a tracker.

---

## Phase 4 — Dashboard port

Port the Alpha 1 sections **mobile-first** — the existing layout is deliberately
desktop (125% root, wide multi-column grids) and won't survive a phone screen.

Sections: Overview · Body · Strength · Knee load · Volume · Weight & BMI · Runs ·
Sessions · Food.

**New panel — the actual payoff:** weekly average intake against weight change.
Turns the deficit from an assumption into a measurement, and calibrates the
model's systematic bias. Average 2,450 logged but lose 0.3 kg/week instead of
0.5, and the estimates run ~15% low — so the target moves, not the diet.

---

## Phase 5 — Imports

- `/api/import/garmin` — CSV upload, same rolling-window merge as Alpha 1
- `/api/import/renpho` — **screenshot through the same vision pipeline**, writing
  `body_composition`. Removes the manual weigh-in step entirely.
- `netlify/functions/hevy-sync.mts` — monthly schedule. **Scheduled functions cap
  at 30s** and the Hevy pull paginates ~47 pages (~10s measured), so it fits —
  but have the scheduled function invoke a background function rather than doing
  the work inline. Cheap insurance as the log grows.

Keep the durable-record export from Alpha 1: Garmin's export is a rolling
~20-activity window and RENPHO has no API, so neither can be re-fetched.

---

## Phase 6 — Polish

Manifest, icons and install prompt · empty and error states · tests for the new
nutrition logic · Lighthouse PWA pass.

---

## Running cost

| | |
|---|---|
| Supabase | free tier |
| Netlify | free tier, Background Functions included |
| Claude Opus 5 | ~£2.20/month at 6 entries/day |

Against Cal AI at £4–6/month, with the data staying yours.

---

## Open decisions

1. **Repo** — new repo `corpus`, or an `alpha-2` branch here? Recommend a new
   repo; the greenfield mindset is easier to hold without Alpha 1 in the tree.
   Worth checking `corpus.netlify.app` is free before committing to it — the
   name is common enough that the subdomain may be taken.
2. **Timezone** — `local_date` needs an explicit rule for meals logged after
   midnight. Recommend a day boundary at 04:00 local.
3. **Photo retention** — keep indefinitely, or purge after 90 days? Storage is
   cheap; recommend keeping and revisiting if it grows.

---

## Sequence

Phase 0 gates everything. Phase 1's verification gate — numbers match — gates
Phase 2. Phases 2 and 3 must be consecutive: an offline-broken logger is worse
than no logger. Phases 4–6 can be interleaved as time allows.
