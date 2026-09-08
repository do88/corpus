import type { SupabaseClient } from "@supabase/supabase-js";
import type { Advice } from "@/lib/meal/advise";

/**
 * The advisor's one running conversation.
 *
 * It used to live in React state and vanish when you left the screen, which
 * was right while the advisor could see nothing but the options you typed: an
 * answer built on what was in the kitchen on Tuesday is worse than no answer.
 * Now that it can look up your own history, the thread is where a standing
 * preference lives — "no more fish", "the shake is every morning" — and that
 * is worth keeping.
 *
 * One thread rather than many. There is one person here and one conversation;
 * a list of threads would be a filing system for something nobody files. It is
 * emptied by the person and folded up by the app, and those are the only two
 * ways it ever gets shorter.
 */

export type TurnRole = "user" | "model" | "summary";

export type AdvisorTurn = {
  id: string;
  role: TurnRole;
  text: string;
  /** The recommendation a model turn attached, if it made one. */
  advice: Advice | null;
  created_at: string;
};

const COLUMNS = "id, role, text, advice, created_at";

/**
 * How many turns are kept word for word.
 *
 * Past this, the oldest fold into a summary. Twenty is well beyond the point
 * where anyone is still deciding what to eat, so in practice this only bites
 * on a thread that has run for weeks — which is exactly the thread whose early
 * turns are about a Tuesday nobody remembers.
 */
export const KEEP_VERBATIM = 20;

/** The thread, oldest first. A summary sits where the turns it replaced were. */
export async function listTurns(supabase: SupabaseClient): Promise<AdvisorTurn[]> {
  const { data, error } = await supabase
    .from("advisor_turn")
    .select(COLUMNS)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw new Error(`Could not read the conversation: ${error.message}`);
  return (data ?? []) as AdvisorTurn[];
}

export async function appendTurn(
  supabase: SupabaseClient,
  turn: { role: TurnRole; text: string; advice?: Advice | null; createdAt?: string },
): Promise<AdvisorTurn> {
  const { data, error } = await supabase
    .from("advisor_turn")
    .insert({
      role: turn.role,
      text: turn.text,
      advice: turn.advice ?? null,
      ...(turn.createdAt ? { created_at: turn.createdAt } : {}),
    })
    .select(COLUMNS)
    .single();
  if (error) throw new Error(`Could not save that turn: ${error.message}`);
  return data as AdvisorTurn;
}

/** Start again. The one destructive thing on the screen, and the person's to press. */
export async function clearThread(supabase: SupabaseClient): Promise<void> {
  // A predicate that matches everything, because PostgREST refuses an
  // unqualified delete — a guard against exactly the statement this means to be.
  const { error } = await supabase.from("advisor_turn").delete().not("id", "is", null);
  if (error) throw new Error(`Could not clear the conversation: ${error.message}`);
}

/**
 * Which turns a fold would replace, and which it would keep.
 *
 * Pure, so the rule can be tested without a database. An existing summary is
 * always part of the fold: a summary of a summary keeps one paragraph at the
 * head of the thread rather than accumulating one per compaction.
 *
 * Returns nothing to do when the thread is short enough, which is the common
 * case and must not cost a model call.
 */
export function planCompaction(
  turns: AdvisorTurn[],
  keep = KEEP_VERBATIM,
): { fold: AdvisorTurn[]; keep: AdvisorTurn[] } | null {
  const spoken = turns.filter((turn) => turn.role !== "summary");
  if (spoken.length <= keep) return null;

  const keptIds = new Set(spoken.slice(-keep).map((turn) => turn.id));
  const fold = turns.filter((turn) => !keptIds.has(turn.id));
  if (fold.length === 0) return null;
  return { fold, keep: turns.filter((turn) => keptIds.has(turn.id)) };
}

/** Replace the folded turns with the one paragraph that stands for them. */
export async function applyCompaction(
  supabase: SupabaseClient,
  fold: AdvisorTurn[],
  summary: string,
): Promise<void> {
  // The summary takes the oldest folded turn's timestamp so it sorts into the
  // thread where those turns were, rather than jumping to the end.
  const oldest = fold.reduce((a, b) => (a.created_at <= b.created_at ? a : b));
  await appendTurn(supabase, { role: "summary", text: summary, createdAt: oldest.created_at });

  const { error } = await supabase
    .from("advisor_turn")
    .delete()
    .in(
      "id",
      fold.map((turn) => turn.id),
    );
  if (error) throw new Error(`Could not fold the conversation: ${error.message}`);
}
