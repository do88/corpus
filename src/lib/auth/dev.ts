import { OWNER_EMAIL } from "./owner";

/**
 * Signing in locally without Google.
 *
 * **This is not an auth bypass, and it deliberately isn't one.** It signs you
 * in for real, with a password user that exists only in the local Supabase
 * stack, carrying the same email the owner policy checks.
 *
 * That distinction is the whole design. RLS is the actual boundary here, and it
 * matches on `auth.jwt() ->> 'email'` — so a bypass that waved the proxy
 * through would hand you an app that loads and then shows nothing, because
 * every query would return zero rows. Storage uploads would fail, Realtime
 * would deliver nothing, and the outbox would have no access token to send the
 * worker. You would be debugging the workaround rather than the app.
 *
 * A real session means every one of those paths behaves exactly as it does in
 * production. The only thing that changes is which identity provider issued the
 * token.
 *
 * Create the user with `pnpm dev:user`, then set `NEXT_PUBLIC_DEV_AUTH=true`
 * in `.env.local`.
 */

/**
 * Both conditions are required, and the first is the one that matters.
 *
 * `next build` sets `NODE_ENV=production`, so in any real deployment this is a
 * compile-time `false` — the bundler then removes the sign-in path below as
 * dead code, and the button cannot be rendered by a flag someone sets on the
 * host by mistake. The env var alone is not enough to turn it on anywhere it
 * shouldn't be.
 */
export const DEV_AUTH_ENABLED =
  process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_DEV_AUTH === "true";

/** The local user's email — the same one the RLS policy and `isOwner` expect. */
export const DEV_EMAIL = OWNER_EMAIL;

/**
 * A fixed local password. Not a secret and not treated as one: it only ever
 * authenticates against the Supabase container on this machine, whose service
 * key is printed by `supabase status` anyway. Keeping it a constant means the
 * script and the button cannot disagree about it.
 */
export const DEV_PASSWORD = "corpus-local-dev";
