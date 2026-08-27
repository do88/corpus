"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask() {
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
      // Back to Today, where the meal it just queued will appear. Staying here
      // would leave you looking at advice you have already taken.
      router.push("/");
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : "Could not log it");
      setBusy(false);
    }
  }

  const started = exchanges.length > 0;

  return (
    <div className="mt-5 space-y-3">
      {started && (
        <ol className="space-y-3">
          {exchanges.map((exchange, index) => (
            <li key={index} className="space-y-1.5">
              <p className="px-1 text-xs text-muted-foreground">
                <span className="sr-only">You asked: </span>
                {exchange.asked}
              </p>
              <div className="surface p-5">
                <p className="text-[1.125rem] font-semibold tracking-[-0.01em]">
                  {exchange.advice.pick}
                </p>
                <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                  {/* Approximate, and said so: logging it runs the real
                      estimator, which is allowed to disagree. */}
                  ≈ {exchange.advice.kcal.toLocaleString("en-GB")} kcal ·{" "}
                  <span style={{ color: "var(--ink-protein)" }}>
                    {exchange.advice.protein_g}g protein
                  </span>
                </p>
                <p className="mt-2.5 text-sm leading-normal">{exchange.advice.why}</p>
                {exchange.advice.instead.trim() && (
                  <p className="mt-1.5 text-xs leading-normal text-muted-foreground">
                    {exchange.advice.instead}
                  </p>
                )}
                {/* Only the current answer is loggable. An older one is a step
                    in the conversation, not a standing offer. */}
                {index === exchanges.length - 1 && (
                  <Button
                    onClick={() => logPick(exchange.advice)}
                    disabled={busy}
                    className="mt-3.5 w-full"
                  >
                    Log it
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      <div className="surface space-y-3 p-5">
        <Textarea
          value={options}
          onChange={(event) => setOptions(event.target.value)}
          placeholder={
            started
              ? "not the fish… or say what else you have"
              : "a tin of mackerel, two bits of toast with peanut butter, or a protein yoghurt"
          }
          rows={2}
          aria-label="What do you have in?"
          className="recessed min-h-0 w-full resize-none border-0 px-3.5 py-2.5 leading-normal focus-visible:ring-0"
          style={{ borderRadius: 18 }}
        />
        <Button onClick={ask} disabled={busy || !options.trim()} className="w-full">
          {busy ? "Thinking…" : started ? "Ask again" : "Ask"}
        </Button>
      </div>

      {started && (
        <div className="flex items-center justify-between gap-3 px-1">
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
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
