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
    jobs/job.ts          the shape of a queued estimate
    meal/
      schema.ts          the contract: items in, totals derived
      prompt.ts          UK portions, consistency over cleverness
      estimate.ts        the one call to Claude
      compress.ts        client-side resize before upload
      format.ts          display
netlify/functions/       background worker + status reader
```

## Running it

```bash
pnpm install
pnpm dev                 # http://localhost:3000 — app only
netlify dev --offline    # http://localhost:8888 — app + functions + blobs
```

Needs `ANTHROPIC_API_KEY` in `.env.local`.

## Phase 0 — is this idea viable?

Two questions had to be answered before building anything real.

### 1. Are the estimates good enough?

Eight text-only meals, measured through the live API:

| | |
|---|---|
| Latency | p50 **5.2 s**, p95 **7.2 s** |
| Cost | **$0.013** per meal (text only; a photo adds roughly $0.008) |
| Sanity | 2 Weetabix + milk + banana → 305 kcal · 2 scoops whey → 232 kcal, 47 g protein · pint + peanuts → 505 kcal |

Those land within a few percent of the labels. **Photo accuracy is still
unmeasured** — that needs real plates against a weighed reference, and it is the
one number that decides whether the product works.

### 2. Does the background worker hold up?

`netlify/functions/estimate-background.mts` exists to prove three things:

| | Verified |
|---|---|
| Returns immediately, runs long | yes — **202 in 21 ms**, ran **40.2 s** |
| Writes a result that outlives the request | yes — Netlify Blobs, read back via `/jobs/status/:id` |
| Retries on failure | **not yet** — see below |

The 40 s matters: **Scheduled Functions cap at 30 s**, which is exactly why the
queue is a *background* function (15 min) instead.

Retries can't be verified locally. `netlify dev` runs a background function but
does not simulate the platform's retry schedule — a deliberate failure sat at
`attempts=1` well past both the 1-minute and 2-minute retry marks. Proving it
needs a real deploy.

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
