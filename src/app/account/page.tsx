import { Screen } from "@/components/screen";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { AccountForm } from "@/components/account-form";
import { avatarUrl, readProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";

/**
 * Name, picture, sign out.
 *
 * Rendered per request because it reads the signed-in user, and the signed
 * URL for a private avatar is minted here rather than in the client — the
 * browser has no business holding the credential that mints it.
 */

export default async function Account() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The proxy already turns away anyone without a session, so this is a
  // type-narrowing guard as much as a check — but it is the one that holds if
  // the matcher ever changes underneath it.
  if (!user) redirect("/login?next=/account");

  const profile = readProfile(user);

  return (
    <Screen>
      <AppHeader title="Account" />
      <AccountForm
        profile={profile}
        avatarSrc={await avatarUrl(supabase, profile)}
        userId={user.id}
      />
    </Screen>
  );
}
