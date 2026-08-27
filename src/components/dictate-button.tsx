"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Loader2, Mic, Square } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Say it instead of typing it.
 *
 * The words land in the box rather than in the log. That is the whole design:
 * the last attempt at voice used the browser's own dictation and was pulled
 * because you could not see what it had heard, so what it hears now arrives as
 * editable text under your thumb, and nothing is recorded anywhere until you
 * press the button you always press.
 *
 * Tap to start, tap again to stop — not press-and-hold. Holding is what a
 * desktop dictation tool does with a modifier key and it is worse here: a
 * finger that slides while you think cancels the recording, a scroll steals
 * the pointer, and there is no keyboard equivalent at all. A toggle costs one
 * extra tap and works the same for every way of pressing a button.
 */
export function DictateButton({
  onTranscript,
  onError,
  disabled,
  className,
}: {
  /** Called with what was said, once. */
  onTranscript: (text: string) => void;
  onError?: (message: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "recording" | "working">("idle");
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  /*
    How loud it has actually been.

    Two jobs, and the second one is why it exists. It drives the meter, so you
    can see it hearing you — the complaint that killed the last attempt at
    voice was that you could not tell. And it is remembered as a peak across
    the whole take, so a recording with nothing in it can be named as such here
    instead of being sent off and coming back as "nothing was said", which
    sounds like the model's opinion rather than a flat microphone.
  */
  const level = useRef(0);
  const peak = useRef(0);
  const audio = useRef<{ context: AudioContext; analyser: AnalyserNode } | null>(null);
  const [meter, setMeter] = useState(0);

  // Whether this browser can record at all.
  //
  // Read through `useSyncExternalStore` rather than measured into state after
  // mount: the server has no MediaRecorder, so the answer differs across the
  // hydration boundary, and this is the hook that exists for exactly that —
  // one snapshot for the server, another for the client, no render in between
  // that has to be thrown away. The subscribe function never fires because the
  // answer cannot change for the life of the document.
  const supported = useSyncExternalStore(subscribeNever, canRecord, () => false);

  useEffect(() => {
    if (state !== "recording") return;
    const started = Date.now();
    const samples = new Float32Array(2048);
    let frame = 0;

    const tick = () => {
      const analyser = audio.current?.analyser;
      if (analyser) {
        analyser.getFloatTimeDomainData(samples);
        let loudest = 0;
        for (const sample of samples) loudest = Math.max(loudest, Math.abs(sample));
        peak.current = Math.max(peak.current, loudest);
        // Eased, or the ring flickers on every consonant and reads as noise
        // rather than as a level.
        level.current = Math.max(loudest, level.current * 0.82);
        setMeter(level.current);
      }
      setSeconds(Math.floor((Date.now() - started) / 1000));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [state]);

  // Let go of the microphone whichever way this component goes away. iOS keeps
  // the orange recording dot lit until every track is stopped, and a page that
  // looks like it is still listening is a page nobody trusts.
  const release = useCallback(() => {
    recorder.current?.stream.getTracks().forEach((track) => track.stop());
    recorder.current = null;
    void audio.current?.context.close().catch(() => {});
    audio.current = null;
  }, []);
  useEffect(() => release, [release]);

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      context.createMediaStreamSource(stream).connect(analyser);
      audio.current = { context, analyser };
      peak.current = 0;
      level.current = 0;

      const mimeType = bestAudioType();
      const media = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunks.current = [];
      media.ondataavailable = (event) => {
        if (event.data.size) chunks.current.push(event.data);
      };
      media.onstop = () => {
        const blob = new Blob(chunks.current, { type: media.mimeType || "audio/webm" });
        const loudest = peak.current;
        release();
        void send(blob, loudest);
      };
      recorder.current = media;
      media.start();
      setSeconds(0);
      setState("recording");
    } catch (error) {
      release();
      setState("idle");
      onError?.(
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Microphone access was denied"
          : "Could not start recording",
      );
    }
  }

  function stop() {
    setState("working");
    // Fires `onstop`, which is where the blob is assembled and sent — the
    // chunks are not all in hand until the recorder says so.
    recorder.current?.stop();
  }

  async function send(blob: Blob, loudest: number) {
    try {
      if (!blob.size) throw new Error("Nothing was recorded");
      // Named here rather than paid for at the other end. Below this the take
      // is a flat line, and the useful thing to say is which microphone it
      // came from — not that the model heard no words in it.
      if (loudest < SILENCE) {
        throw new Error("That came out silent — check which microphone your Mac is using");
      }
      const response = await fetch("/api/meals/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioBase64: await toBase64(blob), mimeType: blob.type }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not transcribe that");
      onTranscript(String(body.text ?? "").trim());
    } catch (error) {
      onError?.(error instanceof Error ? error.message : "Could not transcribe that");
    } finally {
      setState("idle");
    }
  }

  const recording = state === "recording";
  const working = state === "working";

  if (!supported) return null;

  return (
    <button
      type="button"
      onClick={recording ? stop : start}
      disabled={disabled || working}
      aria-label={recording ? `Stop recording, ${seconds} seconds` : "Record what you ate"}
      aria-pressed={recording}
      className={cn(
        "tappable relative flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full transition-colors",
        recording ? "px-3" : "w-9",
        // The circle is 36px; the thing you actually hit is 44. Sized the other
        // way round it was as tall as the field it sits in, which is what a
        // control looks like when it has been given a minimum rather than a
        // size. The hit area is grown with a pseudo-element instead, so the
        // target rule is met without the button having to look like it.
        "after:absolute after:-inset-1 after:content-['']",
        "disabled:opacity-60",
        className,
      )}
      style={
        // A tint with the matching ink, rather than white on solid orange.
        // The energy accent is a mid-tone in light mode, so white on it is the
        // kind of pairing that reads fine to whoever picked it and fails the
        // contrast check — and every other colour in this app is already used
        // this way round.
        recording
          ? {
              background: "color-mix(in oklch, var(--accent-energy) 16%, transparent)",
              color: "var(--ink-energy)",
            }
          : { background: "var(--muted)", color: "var(--muted-foreground)" }
      }
    >
      {working ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : recording ? (
        <>
          {/* A ring that grows with your voice. The whole reason the last
              attempt at this was thrown away is that you could not tell
              whether it was hearing you; a timer alone counts just as
              confidently through a dead microphone. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-full"
            style={{
              boxShadow: `0 0 0 ${Math.min(6, meter * 22).toFixed(1)}px color-mix(in oklch, var(--accent-energy) 30%, transparent)`,
              transition: "box-shadow 90ms linear",
            }}
          />
          <Square className="relative size-3 fill-current" aria-hidden />
          <span className="relative text-sm font-medium tabular-nums">{format(seconds)}</span>
        </>
      ) : (
        <Mic className="size-4" aria-hidden />
      )}
    </button>
  );
}

/** The answer never changes, so nothing ever needs to be told about it. */
function subscribeNever(): () => void {
  return () => {};
}

function canRecord(): boolean {
  return typeof window.MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}

/**
 * Below this a take has nothing in it.
 *
 * Room tone on a laptop measures around 0.02 peak and speech an order of
 * magnitude above that, so this sits under the quiet end of talking and over
 * the loud end of an empty room.
 */
const SILENCE = 0.02;

function format(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * What this browser will actually record.
 *
 * Chrome and Android give WebM/Opus; iOS Safari gives MP4/AAC and rejects a
 * WebM request outright. Passing no type at all works too, but then the blob's
 * type is whatever the browser chose and the server has to accept it blind —
 * so the choice is made here, from what the browser admits to supporting.
 */
export function bestAudioType(): string | undefined {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return undefined;
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/aac"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the recording"));
    reader.onload = () => {
      const result = String(reader.result);
      // A data URL, of which only the payload after the comma is wanted.
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.readAsDataURL(blob);
  });
}
