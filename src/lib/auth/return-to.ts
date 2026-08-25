/**
 * Where to go after signing in.
 *
 * Kept in the tab's own storage rather than as a query parameter on the OAuth
 * redirect. Supabase matches that redirect against an allow-list whose `**`
 * wildcard does not cover query strings, so a `?next=` on the end fails the
 * match without saying so and the auth code is delivered to the Site URL
 * instead — where nothing is listening for it.
 */
export const RETURN_TO = "corpus:return-to";
