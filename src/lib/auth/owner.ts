/**
 * The one account allowed in.
 *
 * Enforced twice, on purpose. RLS in migration 20260824103821 is the boundary
 * that actually protects the data — it holds even if the app is wrong. This
 * constant is the app-level guard on top, so a stranger who signs in with
 * Google is turned away at the door rather than shown an empty, broken-looking
 * app and left wondering.
 *
 * Both copies must change together. The SQL policy cannot read this file.
 */
export const OWNER_EMAIL = "dmitryosipchuk@gmail.com";

export function isOwner(email: string | null | undefined): boolean {
  return email?.toLowerCase() === OWNER_EMAIL;
}
