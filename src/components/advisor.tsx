"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { HelpCircle, Mic, Square, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { localDay } from "@/lib/time";
import { enqueue, type OutboxMeal } from "@/lib/outbox/store";
import { isDictationAvailable, startDictation, type Dictation } from "@/lib/voice/dictation";
import type { Advice, Turn } from "@/lib/meal/advise";

/**
 * "I have these three things — which one?"
 *
 * Collapsed to a single line until asked for, because it is not the reason the
 * screen exists: logging is. It sits under the composer for the same reason.
 *
 * It remembers the exchange, and only the exchange. You can say "not the fish"
 * or "I've also got eggs" and it keeps up, and closing the panel throws the lot
 * away. That is the whole intended lifetime — the question is about what is in
 * the kitchen right now, and an answer built on what was in the kitchen on
 * Tuesday is worse than no answer. Nothing is written down anywhere.
 *
 * The answer offers to log itself. Deciding on the mackerel and then having to
 * type "tin of mackerel" into the box above is the sort of small stupidity that
 * stops a feature being used, and the text is already known.
 */

/** Ten exchanges, matching the route's cap. Nobody deliberates this long. */
const MAX_EXCHANGES = 10;

type Exchange = { asked: string; advice: Advice };

export function Advisor({ onQueued }: { onQueued: () => void }) {
  const dictation = useRef<Dictation | null>(null);
  const [open, setOpen] = useState(false);
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [options, setOptions] = useState("");
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canDictate = useSyncExternalStore(() => () => {}, isDictationAvailable, () => false);

  useEffect(() => () => dictation.current?.stop(), []);

  function toggleDictation() {
    if (listening) {
      dictation.current?.stop();
      return;
    }
    setError(null);
    setListening(true);
    dictation.current = startDictation(
      (text) => setOptions(text),
      (failure) => {
        setListening(false);
        if (failure) setError(`Dictation stopped: ${failure}`);
      },
    );
  }

  async function ask() {
    dictation.current?.stop();
    const asked = options.trim();
    if (!asked) return;
    setBusy(true);
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
      setOptions("");
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : "Could not get an answer");
    } finally {
      setBusy(false);
    }
  }

  async function logPick(advice: Advice) {
    setBusy(true);
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
      close();
      onQueued();
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : "Could not log it");
    } finally {
      setBusy(false);
    }
  }

  function close() {
    dictation.current?.stop();
    setOpen(false);
    setExchanges([]);
    setOptions("");
    setError(null);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="tappable surface flex w-full items-center gap-2 px-5 py-3.5 text-left"
      >
        <HelpCircle className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="text-sm text-muted-foreground">What should I have?</span>
      </button>
    );
  }

  const started = exchanges.length > 0;

  return (
    <div className="surface space-y-3.5 p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Say what you have in. It picks one, against what is left today.
        </p>
        <Button
          size="icon"
          variant="ghost"
          onClick={close}
          aria-label="Close"
          className="-mr-1 -mt-1 size-7 shrink-0"
        >
          <X className="size-4" />
        </Button>
      </div>

      {started && (
        <ol className="space-y-3">
          {exchanges.map((exchange, index) => (
            <li key={index} className="space-y-1.5">
              <p className="text-xs text-muted-foreground">
                <span className="sr-only">You asked: </span>
                {exchange.asked}
              </p>
              <div className="rounded-2xl border border-[var(--rule)] p-4">
                <p className="text-[1.125rem] font-semibold tracking-[-0.01em]">
                  {exchange.advice.pick}
                </p>
                <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                  {/* Approximate, and said so: logging it runs the real
                      estimator, which is allowed to disagree. */}
                  ≈ {exchange.advice.kcal.toLocaleString("en-GB")} kcal ·{" "}
                  <span style={{ color: "var(--ink-protein)" }}>
                    {exchange.advice.protein_g}g protein
                  </span>
                </p>
                <p className="mt-2 text-sm leading-normal">{exchange.advice.why}</p>
                {exchange.advice.instead.trim() && (
                  <p className="mt-1.5 text-xs leading-normal text-muted-foreground">
                    {exchange.advice.instead}
                  </p>
                )}
                {/* Only the current answer is loggable. An older one is a step
                    in the conversation, not a standing offer. */}
                {index === exchanges.length - 1 && (
                  <Button
                    size="sm"
                    onClick={() => logPick(exchange.advice)}
                    disabled={busy}
                    className="mt-3 w-full"
                  >
                    Log it
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      <div className="flex items-end gap-2">
        <Textarea
          value={options}
          onChange={(event) => setOptions(event.target.value)}
          placeholder={
            started
              ? "not the fish… or say what else you have"
              : "a tin of mackerel, two bits of toast with peanut butter, or a protein yoghurt"
          }
          rows={2}
          className="min-h-0 flex-1 resize-none"
        />
        {canDictate && (
          <Button
            size="icon"
            variant={listening ? "destructive" : "secondary"}
            onClick={toggleDictation}
            aria-label={listening ? "Stop dictation" : "Dictate"}
            className="size-10 shrink-0 rounded-full"
          >
            {listening ? <Square className="size-4" /> : <Mic className="size-5" />}
          </Button>
        )}
      </div>

      <Button onClick={ask} disabled={busy || !options.trim()} className="w-full">
        {busy ? "Thinking…" : started ? "Ask again" : "Ask"}
      </Button>

      {started && (
        <p className="text-xs text-muted-foreground">
          Remembered until you close this, then forgotten. Nothing is saved.
        </p>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
