import type { SupabaseClient, User } from "@supabase/supabase-js";

/**
 * The display name and picture, read from and written to the auth user's own
 * metadata.
 *
 * No `profiles` table, deliberately. A table would need a row created on first
 * sign-in, a trigger or a fallback for when that did not happen, RLS of its
 * own, and a join on every read — for two fields belonging to exactly one
 * person. `user_metadata` is already there, already scoped to the user, and
 * already returned by `getUser()` with no extra round trip.
 *
 * Google supplies `name`, `full_name` and `avatar_url` on first sign-in, so
 * both fields start populated and editing is an override rather than a chore.
 */

export type Profile = {
  name: string;
  /** A Google `avatar_url`, or a path inside the private `avatars` bucket. */
  avatarPath: string | null;
  email: string;
};

/** Where this user's uploaded avatar lives. One object, overwritten in place. */
export function avatarObjectPath(userId: string): string {
  return `${userId}/avatar.jpg`;
}

export function readProfile(user: User): Profile {
  const meta = user.user_metadata ?? {};
  return {
    // `name` is ours once edited; the Google-supplied fields are the fallback,
    // and the email's local part is the last resort so the UI is never blank.
    name:
      (meta.name as string | undefined)?.trim() ||
      (meta.full_name as string | undefined)?.trim() ||
      user.email?.split("@")[0] ||
      "You",
    // An uploaded avatar wins; Google's picture is the fallback. Storing them
    // in separate keys is what lets an upload be undone back to the Google one
    // rather than to nothing.
    avatarPath:
      (meta.avatar_path as string | undefined) ??
      (meta.avatar_url as string | undefined) ??
      (meta.picture as string | undefined) ??
      null,
    email: user.email ?? "",
  };
}

/**
 * The URL to render the avatar from.
 *
 * Two sources, and they need different handling. An uploaded avatar lives in a
 * private bucket, so it needs a signed URL minted for each render — the bucket
 * is private for the same reason `meal-photos` is, and a public one would make
 * a photo of the owner readable by anyone who guessed the path. A Google
 * picture is already a public HTTPS URL and is returned unchanged.
 *
 * An hour is a deliberately long TTL for a signed URL: this one grants read
 * access to a single small image the viewer is already entitled to see, and a
 * short TTL would mean the picture breaking while the page sat open.
 */
export async function avatarUrl(
  supabase: SupabaseClient,
  profile: Profile,
): Promise<string | null> {
  if (!profile.avatarPath) return null;
  if (profile.avatarPath.startsWith("https://")) return profile.avatarPath;

  const { data, error } = await supabase.storage
    .from("avatars")
    .createSignedUrl(profile.avatarPath, 60 * 60);

  // A missing picture is not worth failing a page render over — the UI falls
  // back to initials.
  if (error) return null;
  return data.signedUrl;
}
