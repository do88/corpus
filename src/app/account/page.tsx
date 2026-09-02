import { Screen } from "@/components/screen";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { AccountForm } from "@/components/account-form";
import { avatarUrl, readProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { loadTargets } from "@/lib/meals/load-targets";
import { measuredMaintenance, recentGarminDays } from "@/lib/garmin/repository";
import { EnergyCard } from "@/components/energy-card";

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

  // The watch's last week. Optional in the strictest sense: an empty table,
  // a table that does not exist yet, or a read that fails all render as "no
  // watch data yet" rather than as a broken settings screen.
  const [avatarSrc, targets, watch] = await Promise.all([
    avatarUrl(supabase, profile),
    loadTargets(supabase),
    recentGarminDays(supabase, 7).catch(() => []),
  ]);

  return (
    <Screen>
      <AppHeader title="Account" />
      <AccountForm profile={profile} avatarSrc={avatarSrc} userId={user.id} />
      <div className="mt-3">
        <EnergyCard
          goal={targets.kcal}
          estimated={targets.basis.tdee}
          measured={measuredMaintenance(watch)}
        />
      </div>
    </Screen>
  );
}
