"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Layers, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PromptField } from "@/components/prompt-field";
import { localDay } from "@/lib/time";
import { enqueue, type OutboxMeal } from "@/lib/outbox/store";
import { toastDone, toastFailed } from "@/lib/notify";
import { createSseParser } from "@/lib/advisor/events";
import type { AdvisorTurn } from "@/lib/advisor/thread";
import type { Advice } from "@/lib/meal/advise";

/**
 * "I have these three things — which one?", and anything else about the log.
 *
 * A screen rather than a disclosure on Today. Deciding what to eat is a
 * different activity from recording what you ate, it takes a conversation
 * rather than a tap, and it wants the day's remaining numbers on screen while
 * you think. None of that fits in a row that has to stay out of the way.
 *
 * Two things changed when it learned to look things up. It keeps the thread
 * now, because a standing preference — no more fish, the shake is every
 * morning — is worth more than a clean slate, and it can only act on one if
 * it can still read it. And it narrates itself while it works: an answer that
 * takes three look-ups behind a still screen reads as broken, so each look-up
 * says what it is, in words rather than a spinner.
 */

/** What the thread shows, whether it came from the server or has just arrived. */
type Entry =
  | { kind: "asked"; text: string }
  | { kind: "answer"; text: string; advice: Advice | null }
  | { kind: "folded"; text: string };

function toEntries(turns: AdvisorTurn[]): Entry[] {
  return turns.map((turn): Entry => {
    if (turn.role === "summary") return { kind: "folded", text: turn.text };
    if (turn.role === "user") return { kind: "asked", text: turn.text };
    return { kind: "answer", text: turn.text, advice: turn.advice };
  });
}

/**
 * What to ask, for a screen that has never been used.
 *
 * The advisor grew look-ups and its own front door still described the thing
 * it used to be: a placeholder listing three foods, which sells it as the
 * feature that picks between options you type out. It can now read the log,
 * the watch and the targets, and nobody would guess that from a blank box.
 *
 * Four questions, each of which works with nothing else typed. Tapping one
 * sends it, because a chip that only fills the box is a chip you have to
 * press twice.
 */
const OPENERS = [
  "What should I have?",
  "How has this week gone?",
  "What did I eat yesterday?",
  "Why is my calorie target what it is?",
];

/** The turn being answered right now, built up as the stream arrives. */
type Live = { asked: string; text: string; advice: Advice | null; doing: string | null };

export function Advisor({ initial }: { initial: AdvisorTurn[] }) {
  const router = useRouter();
  const [entries, setEntries] = useState<Entry[]>(() => toEntries(initial));
  const [options, setOptions] = useState("");
  const [live, setLive] = useState<Live | null>(null);
  const [logging, setLogging] = useState(false);
  const busy = live !== null || logging;

  async function ask(question?: string) {
    const asked = (question ?? options).trim();
    if (!asked || busy) return;
    setOptions("");
    setLive({ asked, text: "", advice: null, doing: null });

    try {
      const response = await fetch("/api/advise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: asked }),
      });
      // Only a refusal before the stream opens can still be a status code; once
      // it is open, a failure arrives as an `error` event instead.
      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "Could not get an answer");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const parse = createSseParser();
      let failure: string | null = null;
      let text = "";
      let advice: Advice | null = null;

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const event of parse(decoder.decode(value, { stream: true }))) {
          if (event.type === "text") {
            text += event.delta;
            setLive((current) => (current ? { ...current, text, doing: null } : current));
          } else if (event.type === "tool") {
            setLive((current) => (current ? { ...current, doing: event.label } : current));
          } else if (event.type === "advice") {
            advice = event.advice;
            setLive((current) => (current ? { ...current, advice, doing: null } : current));
          } else if (event.type === "error") {
            failure = event.message;
          }
        }
      }
      if (failure) throw new Error(failure);

      setEntries((previous) => [
        ...previous,
        { kind: "asked", text: asked },
        { kind: "answer", text, advice },
      ]);
    } catch (thrown) {
      toastFailed(thrown, "Could not get an answer");
      // Give the words back rather than making you retype them.
      setOptions((current) => (current.trim() ? current : asked));
      // The question was written down before the answer was attempted, so the
      // server's thread has it either way; re-reading is what keeps the two
      // in step after a failure.
      router.refresh();
    } finally {
      setLive(null);
    }
  }

  async function clear() {
    try {
      const response = await fetch("/api/advise", { method: "DELETE" });
      if (!response.ok) throw new Error("Could not clear the conversation");
      setEntries([]);
      setOptions("");
      toastDone("Conversation cleared");
      router.refresh();
    } catch (thrown) {
      toastFailed(thrown, "Could not clear the conversation");
    }
  }

  async function logPick(advice: Advice) {
    setLogging(true);
    try {
      const loggedAt = new Date();
      const meal: OutboxMeal = {
        clientId: crypto.randomUUID(),
        loggedAt: loggedAt.toISOString(),
        localDate: localDay(loggedAt),
        // The advice's own figures are not carried over: this goes through the
        // ordinary estimator like any other meal, so a logged row is always
        // something the estimator produced rather than a number from a
        // different call with a different job.
        note: advice.pick,
        attempts: 0,
      };
      await enqueue(meal);
      // Back to Today, where the meal it just queued will appear. Staying here
      // would leave you looking at advice you have already taken.
      router.push("/");
    } catch (thrown) {
      toastFailed(thrown, "Could not log that");
      setLogging(false);
    }
  }

  const started = entries.length > 0 || live !== null;
  const lastAnswer = entries.findLastIndex((entry) => entry.kind === "answer");

  /*
    Follow the thread down. Each turn adds a screenful and the composer moves
    with it, so without this you end up scrolling by hand after every send —
    the one bit of chat behaviour you notice only when it is missing. Anchored
    to the end of the list rather than the newest answer, so the input you are
    about to type in comes along too.
  */
  const foot = useRef<HTMLDivElement>(null);
  const beat = entries.length + (live ? live.text.length + (live.doing ? 1 : 0) : 0);
  useEffect(() => {
    if (beat === 0) return;
    foot.current?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "nearest",
    });
  }, [beat]);

  return (
    /*
      A thread, not a form with results underneath. Alternating sides is what
      every messaging app uses to carry that, and it costs nothing to borrow —
      what you said sits right in its own tint, what came back sits left and
      plain.
    */
    <div className="mt-5">
      <ol className="space-y-5">
        {entries.map((entry, index) => (
          <li key={index}>
            {entry.kind === "asked" && <Asked>{entry.text}</Asked>}
            {entry.kind === "folded" && <Folded>{entry.text}</Folded>}
            {entry.kind === "answer" && (
              <Answer
                text={entry.text}
                advice={entry.advice}
                /* Only the newest recommendation is loggable. An older one is a
                   step in the conversation, not a standing offer. */
                onLog={index === lastAnswer ? logPick : undefined}
                busy={busy}
              />
            )}
          </li>
        ))}

        {live && (
          <li className="space-y-5">
            <Asked>{live.asked}</Asked>
            {live.text || live.advice ? (
              <Answer text={live.text} advice={live.advice} busy />
            ) : (
              <Working label={live.doing} />
            )}
          </li>
        )}
      </ol>

      <div ref={foot} />

      {!started && (
        <div className="mb-4 flex flex-wrap gap-2">
          {OPENERS.map((question) => (
            <button
              key={question}
              type="button"
              onClick={() => void ask(question)}
              disabled={busy}
              className="surface tappable min-h-11 px-3.5 text-left text-[0.8125rem] font-medium disabled:opacity-60"
              style={{ borderRadius: 999 }}
            >
              {question}
            </button>
          ))}
        </div>
      )}

      {/* The composer, after the thread rather than floating over it — the
          page is short and the tab bar already owns the bottom edge. */}
      <div className={started ? "mt-6 space-y-3" : "space-y-3"}>
        <PromptField
          value={options}
          onChange={setOptions}
          onSubmit={() => {
            if (options.trim() && !busy) void ask();
          }}
          placeholder={
            started
              ? "not the fish… or ask about last week"
              : "say what you have in, or ask about any day you have logged"
          }
          label="What do you have in?"
          rows={2}
          onTranscript={(text) =>
            setOptions((current) => (current.trim() ? `${current.trim()} ${text}` : text))
          }
          onDictationError={(message) => toastFailed(new Error(message), "Dictation failed")}
        />
        <Button onClick={() => ask()} disabled={busy || !options.trim()} className="w-full">
          {live !== null ? "Thinking…" : started ? "Ask again" : "Ask"}
        </Button>
      </div>

      {started && (
        <div className="mt-3 flex items-center justify-between gap-3 px-1">
          <p className="text-xs text-muted-foreground">
            Kept between visits, so it remembers what you have told it.
          </p>
          <Button
            size="sm"
            variant="ghost"
            onClick={clear}
            disabled={busy}
            className="shrink-0 text-muted-foreground"
          >
            <RotateCcw className="size-3.5" /> Clear
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * An answer: what it said, and the card if it recommended something.
 *
 * No bubble. It is the substance of the screen, and boxing it would make it
 * look like an aside to the question.
 */
function Answer({
  text,
  advice,
  onLog,
  busy,
}: {
  text: string;
  advice: Advice | null;
  onLog?: (advice: Advice) => void;
  busy: boolean;
}) {
  return (
    <div className="space-y-2.5 px-1">
      {advice && (
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <h2 className="text-[1.125rem] font-semibold tracking-[-0.01em]">{advice.pick}</h2>
          {/* Approximate, and said so: logging it runs the real estimator,
              which is allowed to disagree. */}
          <span className="flex flex-wrap items-center gap-1.5 text-xs tabular-nums">
            <Chip>≈ {advice.kcal.toLocaleString("en-GB")} kcal</Chip>
            <Chip tone="protein">{advice.protein_g}g protein</Chip>
          </span>
        </div>
      )}

      {advice && <p className="text-[0.9375rem] leading-relaxed">{advice.why}</p>}
      {text && <p className="text-[0.9375rem] leading-relaxed">{text}</p>}

      {advice?.instead.trim() && (
        <p className="border-l-2 border-[var(--rule)] pl-3 text-xs leading-relaxed text-muted-foreground">
          {advice.instead}
        </p>
      )}

      {advice && onLog && (
        <Button onClick={() => onLog(advice)} disabled={busy} className="mt-1">
          Log it
        </Button>
      )}
    </div>
  );
}

/**
 * What it is doing, while it does it.
 *
 * The three dots said only "waiting". With look-ups the wait has a reason, and
 * naming it is the difference between a slow screen and a screen at work.
 */
function Working({ label }: { label: string | null }) {
  return (
    <div className="flex items-center gap-2 px-1" aria-live="polite">
      <span className="flex items-center gap-1.5" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="size-1.5 rounded-full bg-muted-foreground"
            style={{ animation: `thinking 1.2s ease-in-out ${i * 160}ms infinite` }}
          />
        ))}
      </span>
      <span className="text-xs text-muted-foreground">{label ?? "Thinking"}</span>
    </div>
  );
}

/**
 * Where the old end of the conversation used to be.
 *
 * Shown rather than hidden, because the model is still reading it and a person
 * ought to be able to see what it thinks it knows about them.
 */
function Folded({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 px-1 text-xs leading-relaxed text-muted-foreground">
      <Layers className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <p>
        <span className="font-medium">Earlier, folded up. </span>
        {children}
      </p>
    </div>
  );
}

/** What you said, on the side every messaging app puts it. */
function Asked({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-end">
      <p
        className="max-w-[85%] px-4 py-2.5 text-[0.9375rem] leading-normal"
        style={{
          // Square corner on the sending side, the shape a bubble has when it
          // is the tail of the thread.
          borderRadius: "18px 18px 4px 18px",
          background: "color-mix(in oklch, var(--accent-protein) 14%, transparent)",
          color: "var(--foreground)",
        }}
      >
        <span className="sr-only">You asked: </span>
        {children}
      </p>
    </div>
  );
}

/** A figure worth reading at a glance, set apart from the prose around it. */
function Chip({ children, tone }: { children: React.ReactNode; tone?: "protein" }) {
  return (
    <span
      className="rounded-full px-2 py-0.5 font-medium"
      style={
        tone === "protein"
          ? {
              background: "color-mix(in oklch, var(--accent-protein) 13%, transparent)",
              color: "var(--ink-protein)",
            }
          : { background: "var(--muted)", color: "var(--muted-foreground)" }
      }
    >
      {children}
    </span>
  );
}
