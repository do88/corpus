import { createBrowserClient } from "@supabase/ssr";

/**
 * The browser's Supabase client — auth, Storage uploads and Realtime.
 *
 * Carries the publishable key, so every request arrives as the signed-in user
 * and RLS decides what it can see. That is the whole security model: the key is
 * public by design, the policy is what protects the data.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
