import { toast } from "sonner";

/**
 * What the app says back when you do something.
 *
 * Every screen had rolled its own: Foods kept a `logged` string and an `error`
 * string and rendered two `<Alert>`s, Account set a `saved` boolean that drew
 * the word "Saved.", the composer used a toast, and the meal editor put its
 * failures inside the panel you were editing. Four notations for two events,
 * and the Foods one was the worst of them — its error alert rendered at the
 * very bottom of the list, so on a long list a failed archive scrolled a
 * message into a part of the page nobody was looking at. It read as nothing
 * having happened at all.
 *
 * So: one place, two verbs. A toast is the right shape for both because both
 * are *events* — they report what just happened and then stop being true.
 *
 * What stays inline, deliberately:
 *
 *   - Sign-in errors. The form is the whole screen and the message has to
 *     still be there while you decide what to do about it. A notice that
 *     dismisses itself is exactly wrong on the one screen you cannot get past.
 *   - A meal card's own `error` column. That is a property of the row — it is
 *     still true tomorrow — and it belongs on the row that has it.
 */

/** The message out of a thrown thing, or the fallback if it has nothing to say. */
export function reason(thrown: unknown, fallback: string): string {
  const message = thrown instanceof Error ? thrown.message.trim() : "";
  return message || fallback;
}

/**
 * It worked. Optionally with the one thing you might want to do next — a
 * link to what you just changed, which is the only action worth offering
 * for something that already succeeded.
 */
export function toastDone(
  message: string,
  action?: { label: string; onClick: () => void },
): void {
  toast.success(message, action ? { action } : undefined);
}

/**
 * It did not work, and here is what the failure said.
 *
 * Longer on screen than a success: a confirmation is glanced at, a failure is
 * read, and sometimes typed out to someone. `fallback` is what to say when the
 * throw carries nothing useful, and it should name the action rather than
 * apologise — "Could not archive that food", not "Something went wrong".
 */
export function toastFailed(thrown: unknown, fallback: string): void {
  toast.error(reason(thrown, fallback), { duration: 6000 });
}
