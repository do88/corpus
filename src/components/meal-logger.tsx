"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { compressForEstimate, toBase64 } from "@/lib/meal/compress";
import { costOf, macroRow } from "@/lib/meal/format";
import type { MealEstimate } from "@/lib/meal/schema";

type Result = {
  estimate: MealEstimate;
  model: string;
  latencyMs: number;
  usage: { input: number; output: number };
};

export function MealLogger() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [compressed, setCompressed] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
    const small = await compressForEstimate(file);
    setCompressed(small);
    setPreview(URL.createObjectURL(small));
  }

  async function analyse() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/meals/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: compressed ? await toBase64(compressed) : undefined,
          imageMediaType: "image/jpeg",
          note,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Request failed");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setPreview(null);
    setCompressed(null);
    setNote("");
    setResult(null);
    setError(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  const cost = result ? costOf(result.usage) : 0;

  return (
    <div className="space-y-4">
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onPick}
        className="hidden"
      />

      {preview ? (
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="relative block h-56 w-full overflow-hidden rounded-xl border"
        >
          <Image src={preview} alt="Meal" fill className="object-cover" unoptimized />
        </button>
      ) : (
        <Button
          variant="outline"
          className="h-56 w-full border-dashed"
          onClick={() => fileInput.current?.click()}
        >
          Take a photo
        </Button>
      )}

      {compressed && (
        <p className="text-xs text-muted-foreground">
          Resized to {(compressed.size / 1024).toFixed(0)} KB
        </p>
      )}

      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Tin of mackerel and two slices of white toast"
        rows={2}
      />

      <div className="flex gap-2">
        <Button
          onClick={analyse}
          disabled={busy || (!compressed && !note.trim())}
          className="flex-1"
        >
          {busy ? "Estimating…" : "Estimate"}
        </Button>
        {(result || preview) && (
          <Button variant="ghost" onClick={reset}>
            Clear
          </Button>
        )}
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {busy && (
        <Card>
          <CardContent className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </CardContent>
        </Card>
      )}

      {result && <Estimate result={result} cost={cost} />}
    </div>
  );
}

function Estimate({ result, cost }: { result: Result; cost: number }) {
  const { estimate } = result;
  const macros = macroRow(estimate);

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-4 gap-2">
          {macros.map((m) => (
            <div key={m.macro}>
              <div className="text-xs text-muted-foreground">{m.label}</div>
              <div className="text-lg font-semibold tabular-nums">{m.value}</div>
            </div>
          ))}
        </div>

        <ul className="space-y-1 border-t pt-3">
          {estimate.items.map((item) => (
            <li key={item.name} className="flex justify-between gap-3 text-sm">
              <span className="text-muted-foreground">
                {item.name} <span className="text-xs">· {item.qty}</span>
              </span>
              <span className="shrink-0 tabular-nums">
                {item.kcal} · {item.protein_g}g
              </span>
            </li>
          ))}
        </ul>

        {/* The assumption is how a wrong portion gets spotted without redoing
            the maths — it is the most useful line on the card. */}
        <p className="border-t pt-3 text-xs text-muted-foreground">
          <Badge variant="secondary" className="mr-2">
            {estimate.confidence}
          </Badge>
          {estimate.assumptions}
        </p>

        <p className="text-xs text-muted-foreground tabular-nums">
          {(result.latencyMs / 1000).toFixed(1)}s · {result.usage.input}+
          {result.usage.output} tokens · ${cost.toFixed(4)}
        </p>
      </CardContent>
    </Card>
  );
}
