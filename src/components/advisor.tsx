"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PromptField } from "@/components/prompt-field";
import { localDay } from "@/lib/time";
import { enqueue, type OutboxMeal } from "@/lib/outbox/store";
import type { Advice, Turn } from "@/lib/meal/advise";

/**
 * "I have these three things — which one?"
 *
 * A screen rather than a disclosure on Today. It began as a collapsed row
 * under the composer, which undersold it: deciding what to eat is a different
 * activity from recording what you ate, it takes a conversation rather than a
 * tap, and it wants the day's remaining numbers on screen while you think.
 * None of that fits in a row that has to stay out of the way.
 *
 * It remembers the exchange, and only the exchange. You can say "not the fish"
 * or "I've also got eggs" and it keeps up; leaving the screen throws the lot
 * away. That is the intended lifetime, not a limitation — the question is
 * about what is in the kitchen right now, and an answer built on what was
 * there on Tuesday is worse than no answer. Nothing is written down anywhere.
 */

/** Ten exchanges, matching the route's cap. Nobody deliberates this long. */
const MAX_EXCHANGES = 10;

type Exchange = { asked: string; advice: Advice };

export function Advisor() {
  const router = useRouter();
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [options, setOptions] = useState("");
  // What you have just asked, held separately so it can go on screen the
  // instant you send it rather than when the answer arrives. A chat that
  // leaves your own words in the input while it thinks does not feel like one.
  const [pending, setPending] = useState<string | null>(null);
  const [logging, setLogging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = pending !== null || logging;

  async function ask() {
    const asked = options.trim();
    if (!asked || busy) return;
    setPending(asked);
    setOptions("");
    setError(null);
    try {
      // The model's own JSON goes back as its turn, so what it sees itself
      // having said is exactly what it said.
      const turns: Turn[] = [
        ...exchanges.flatMap((exchange): Turn[] => [
          { role: "user", text: exchange.asked },
          { role: "model", text: JSON.stringify(exchange.advice) },
        ]),
        { role: "user", text: asked },
      ];

      const response = await fetch("/api/advise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ turns }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not get an answer");

      setExchanges((previous) =>
        [...previous, { asked, advice: body as Advice }].slice(-MAX_EXCHANGES),
      );
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : "Could not get an answer");
      // Give the words back rather than making you retype them.
      setOptions((current) => (current.trim() ? current : asked));
    } finally {
      setPending(null);
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
      setError(thrown instanceof Error ? thrown.message : "Could not log it");
      setLogging(false);
    }
  }

  const started = exchanges.length > 0 || pending !== null;

  /*
    Follow the thread down. Each turn adds a screenful and the composer moves
    with it, so without this you end up scrolling by hand after every send —
    the one bit of chat behaviour you notice only when it is missing. Anchored
    to the end of the list rather than the newest answer, so the input you are
    about to type in comes along too.
  */
  const foot = useRef<HTMLDivElement>(null);
  const turns = exchanges.length + (pending !== null ? 1 : 0);
  useEffect(() => {
    if (turns === 0) return;
    foot.current?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "nearest",
    });
  }, [turns]);

  return (
    /*
      A thread, not a form with results underneath.

      It read as the latter: each question was a line of small grey text above
      a card, so the two halves of an exchange looked like a caption and a
      panel rather than a thing said and a thing answered. Alternating sides is
      what every messaging app uses to carry that, and it costs nothing to
      borrow — what you said sits right in its own tint, what came back sits
      left and plain.
    */
    <div className="mt-5">
      <ol className="space-y-5">
        {exchanges.map((exchange, index) => (
          <li key={index} className="space-y-3">
            <Asked>{exchange.asked}</Asked>

            {/* The answer. No bubble: it is the substance of the screen, and
                boxing it would make it look like an aside to the question. */}
            <div className="space-y-2.5 px-1">
              <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                <h2 className="text-[1.125rem] font-semibold tracking-[-0.01em]">
                  {exchange.advice.pick}
                </h2>
                {/* Approximate, and said so: logging it runs the real
                    estimator, which is allowed to disagree. */}
                <span className="flex shrink-0 items-center gap-1.5 text-xs tabular-nums">
                  <Chip>≈ {exchange.advice.kcal.toLocaleString("en-GB")} kcal</Chip>
                  <Chip tone="protein">{exchange.advice.protein_g}g protein</Chip>
                </span>
              </div>

              <p className="text-[0.9375rem] leading-relaxed">{exchange.advice.why}</p>

              {exchange.advice.instead.trim() && (
                <p className="border-l-2 border-[var(--rule)] pl-3 text-xs leading-relaxed text-muted-foreground">
                  {exchange.advice.instead}
                </p>
              )}

              {/* Only the current answer is loggable. An older one is a step in
                  the conversation, not a standing offer. */}
              {index === exchanges.length - 1 && (
                <Button onClick={() => logPick(exchange.advice)} disabled={busy} className="mt-1">
                  Log it
                </Button>
              )}
            </div>
          </li>
        ))}

        {/* The turn in flight: your words, on screen straight away, and the
            pause where the answer will land. Without it the thread sits
            perfectly still while a request runs. */}
        {pending !== null && (
          <li className="space-y-3">
            <Asked>{pending}</Asked>
            <div className="flex items-center gap-1.5 px-1" aria-live="polite">
            <span className="sr-only">Thinking</span>
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                aria-hidden
                className="size-1.5 rounded-full bg-muted-foreground"
                style={{ animation: `thinking 1.2s ease-in-out ${i * 160}ms infinite` }}
              />
            ))}
            </div>
          </li>
        )}
      </ol>

      <div ref={foot} />

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
              ? "not the fish… or say what else you have"
              : "a tin of mackerel, two bits of toast with peanut butter, or a protein yoghurt"
          }
          label="What do you have in?"
          rows={2}
        />
        <Button onClick={ask} disabled={busy || !options.trim()} className="w-full">
          {pending !== null ? "Thinking…" : started ? "Ask again" : "Ask"}
        </Button>
      </div>

      {started && (
        <div className="mt-3 flex items-center justify-between gap-3 px-1">
          <p className="text-xs text-muted-foreground">
            Remembered while you are here, then forgotten. Nothing is saved.
          </p>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setExchanges([]);
              setOptions("");
              setError(null);
            }}
            className="shrink-0 text-muted-foreground"
          >
            <RotateCcw className="size-3.5" /> Start over
          </Button>
        </div>
      )}

      {error && (
        <Alert variant="destructive" className="mt-3">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
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
