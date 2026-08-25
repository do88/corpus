/**
 * Ensure the local sign-in user exists.
 *
 * Run for you by `pnpm dev:local`; there is no need to invoke it directly.
 *
 * Creates a confirmed password user carrying the owner's email in the **local**
 * Supabase stack. Because the email matches, the RLS policy, `isOwner` and the
 * proxy treat it exactly as they treat the real account — which is the point.
 * Nothing is bypassed, so nothing behaves differently while you develop.
 *
 * Refuses to run against anything but the local stack, on the same reasoning as
 * `test-recovery.mts`: this creates a credential, and creating one on the
 * hosted project would add a second way into the real food log.
 */
import { createClient } from "@supabase/supabase-js";
import { DEV_EMAIL, DEV_PASSWORD } from "@/lib/auth/dev";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

if (!/^http:\/\/(127\.0\.0\.1|localhost):54321/.test(url)) {
  console.error(
    `Refusing to run against ${url || "(unset)"}.\n` +
      "This creates a password user, so it only ever runs against local Supabase.",
  );
  process.exit(1);
}

const secret = process.env.SUPABASE_SECRET_KEY;
if (!secret) {
  console.error("SUPABASE_SECRET_KEY is not set — see `supabase status`.");
  process.exit(1);
}

const supabase = createClient(url, secret, { auth: { persistSession: false } });

// `email_confirm` so there is no confirmation step; the local stack has
// confirmations off anyway, and saying it here means this works whatever
// config.toml happens to be set to.
const { error } = await supabase.auth.admin.createUser({
  email: DEV_EMAIL,
  password: DEV_PASSWORD,
  email_confirm: true,
});

if (!error) {
  console.log(`created local sign-in user ${DEV_EMAIL}`);
  process.exit(0);
}

// Already existing is the ordinary case on every run after the first. Reset the
// password rather than failing, so this is safe to run before every dev server.
const alreadyExists =
  error.status === 422 || /already been registered|already exists/i.test(error.message);

if (!alreadyExists) {
  console.error(`Could not create the dev user: ${error.message}`);
  process.exit(1);
}

const { data: list, error: listError } = await supabase.auth.admin.listUsers();
if (listError) {
  console.error(`Could not list users: ${listError.message}`);
  process.exit(1);
}

const existing = list.users.find((u) => u.email?.toLowerCase() === DEV_EMAIL.toLowerCase());
if (!existing) {
  console.error(`${DEV_EMAIL} reported as existing but was not found.`);
  process.exit(1);
}

const { error: updateError } = await supabase.auth.admin.updateUserById(existing.id, {
  password: DEV_PASSWORD,
  email_confirm: true,
});
if (updateError) {
  console.error(`Could not reset the dev user's password: ${updateError.message}`);
  process.exit(1);
}

process.exit(0);
