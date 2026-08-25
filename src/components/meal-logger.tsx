"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { Camera, Mic, Send, Square, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { compressForEstimate } from "@/lib/meal/compress";
import { localDay } from "@/lib/meals/repository";
import { enqueue, type OutboxMeal } from "@/lib/outbox/store";
import { isDictationAvailable, startDictation, type Dictation } from "@/lib/voice/dictation";

/**
 * Log a meal: say what you ate, optionally attach a photo.
 *
 * Words first, photo second. The earlier version led with a large camera
 * target, which put the slowest and least reliable input in front of the
 * fastest — most meals are quicker to describe than to photograph well, and a
 * description is a better prompt than a picture of a wrapper. The camera is
 * still one tap away, and a photo alone still works.
 *
 * The meal goes into the phone's own storage before the network is touched, so
 * nothing here can fail in a way that loses it. The worst case is a meal saved
 * and not yet sent, which is visible and self-healing.
 */
export function MealLogger({ onQueued }: { onQueued: () => void }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const dictation = useRef<Dictation | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [note, setNote] = useState("");
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Whether the browser can transcribe never changes, so subscribe does
  // nothing. The server snapshot is false: it has no idea what the browser
  // supports, and rendering the button then removing it is a visible flicker.
  const canDictate = useSyncExternalStore(() => () => {}, isDictationAvailable, () => false);

  useEffect(() => () => dictation.current?.stop(), []);

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
    // Before anything else: a full-size photo is roughly ten times the image
    // tokens of a resized one, and a few of them fill the storage quota.
    const small = await compressForEstimate(file);
    setPhoto(small);
    // Replacing a photo without picking up the previous URL would strand the
    // old Blob for the life of the document.
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(small);
    });
  }

  function clearPhoto() {
    // An object URL pins its Blob until it is revoked — 150–300 KB per photo,
    // held for as long as the page is open. Nothing else releases it: this is
    // the only path that clears the preview, on both the remove button and a
    // successful save.
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
    setPhoto(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  function toggleDictation() {
    if (listening) {
      dictation.current?.stop();
      return;
    }
    setError(null);
    setListening(true);
    dictation.current = startDictation(
      (text) => setNote(text),
      (failure) => {
        setListening(false);
        if (failure) setError(`Dictation stopped: ${failure}`);
      },
    );
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const loggedAt = new Date();
      const meal: OutboxMeal = {
        // Minted here so the meal keeps one identity through the queue, a
        // retry, and the app being closed in between.
        clientId: crypto.randomUUID(),
        loggedAt: loggedAt.toISOString(),
        // The day it counts toward is decided by when it was eaten, not by
        // which day happens to be on screen.
        localDate: localDay(loggedAt),
        note,
        photo: photo ?? undefined,
        attempts: 0,
      };
      await enqueue(meal);
      setNote("");
      clearPhoto();
      onQueued();
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : "Could not save the meal");
    } finally {
      setBusy(false);
    }
  }

  const empty = !photo && !note.trim();

  return (
    <div className="space-y-2">
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onPick}
        className="sr-only"
      />

      {preview && (
        <div className="relative inline-block">
          <Image
            src={preview}
            alt="Attached photo"
            width={72}
            height={72}
            unoptimized
            className="size-18 rounded-2xl object-cover shadow-[var(--shadow-card)]"
          />
          <Button
            size="icon"
            variant="secondary"
            onClick={clearPhoto}
            aria-label="Remove photo"
            className="absolute -right-2 -top-2 size-6 rounded-full shadow-sm"
          >
            <X className="size-3" />
          </Button>
        </div>
      )}

      {/*
        One pill, iMessage-shaped: the field and its actions share a single
        rounded container rather than sitting as separate controls in a row.
        That is what makes it read as a composer instead of a form.
      */}
      <div className="surface flex items-end gap-1 p-1.5" style={{ borderRadius: 999 }}>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. 2 eggs and a slice of toast…"
          rows={1}
          aria-label="What did you eat?"
          className="recessed max-h-32 min-h-10 flex-1 resize-none border-0 px-3.5 py-2 focus-visible:ring-0"
          style={{ borderRadius: 999 }}
          onKeyDown={(e) => {
            // Enter sends, Shift+Enter makes a new line — the convention every
            // messaging app already taught everyone.
            if (e.key === "Enter" && !e.shiftKey && !empty) {
              e.preventDefault();
              void save();
            }
          }}
        />

        <Button
          size="icon"
          variant="ghost"
          onClick={() => fileInput.current?.click()}
          aria-label="Add a photo"
          className="tappable size-10 shrink-0 rounded-full"
        >
          <Camera className="size-5" />
        </Button>

        {canDictate && (
          <Button
            size="icon"
            variant={listening ? "destructive" : "ghost"}
            onClick={toggleDictation}
            aria-pressed={listening}
            aria-label={listening ? "Stop dictating" : "Dictate"}
            className="tappable size-10 shrink-0 rounded-full"
          >
            {listening ? <Square className="size-4" /> : <Mic className="size-5" />}
          </Button>
        )}

        <Button
          size="icon"
          onClick={save}
          disabled={busy || empty}
          aria-label="Log it"
          className="tappable size-10 shrink-0 rounded-full"
          style={
            empty
              ? undefined
              : {
                  // A lit button: brighter at the top, with its own coloured
                  // shadow so it sits above the pill rather than in it.
                  background:
                    "linear-gradient(to bottom, var(--accent-protein), var(--ink-protein))",
                  boxShadow:
                    "0 1px 2px color-mix(in oklch, var(--ink-protein) 45%, transparent), inset 0 1px 0 oklch(1 0 0 / 0.25)",
                }
          }
        >
          <Send className="size-4" />
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

