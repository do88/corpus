import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * The server's Supabase client, acting *as the signed-in user*.
 *
 * Still the publishable key, so RLS still applies — this reads the session from
 * cookies rather than escalating past it. Use this in route handlers and server
 * components; reach for the secret-key client only where RLS genuinely has to
 * be bypassed.
 *
 * Cookies are handled with `getAll`/`setAll` only. The older `get`/`set`/
 * `remove` trio is removed in @supabase/ssr and silently desynchronises the
 * session when it half-works.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component, which cannot set cookies. Safe to
            // ignore: the proxy refreshes the session on every request.
          }
        },
      },
    },
  );
}
