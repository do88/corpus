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
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 250);
    return () => clearInterval(timer);
  }, [state]);

  // Let go of the microphone whichever way this component goes away. iOS keeps
  // the orange recording dot lit until every track is stopped, and a page that
  // looks like it is still listening is a page nobody trusts.
  const release = useCallback(() => {
    recorder.current?.stream.getTracks().forEach((track) => track.stop());
    recorder.current = null;
  }, []);
  useEffect(() => release, [release]);

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = bestAudioType();
      const media = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunks.current = [];
      media.ondataavailable = (event) => {
        if (event.data.size) chunks.current.push(event.data);
      };
      media.onstop = () => {
        const blob = new Blob(chunks.current, { type: media.mimeType || "audio/webm" });
        release();
        void send(blob);
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

  async function send(blob: Blob) {
    try {
      if (!blob.size) throw new Error("Nothing was recorded");
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

  if (!supported) return null;

  const recording = state === "recording";
  const working = state === "working";

  return (
    <button
      type="button"
      onClick={recording ? stop : start}
      disabled={disabled || working}
      aria-label={recording ? `Stop recording, ${seconds} seconds` : "Record what you ate"}
      aria-pressed={recording}
      className={cn(
        "flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-full px-3 transition-colors",
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
              minWidth: 44,
            }
          : { background: "var(--muted)", color: "var(--muted-foreground)", minWidth: 44 }
      }
    >
      {working ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : recording ? (
        <>
          <Square className="size-3 fill-current" aria-hidden />
          <span className="text-sm font-medium tabular-nums">{format(seconds)}</span>
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
