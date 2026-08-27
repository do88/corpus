"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Camera, Send, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PromptField } from "@/components/prompt-field";
import { compressForEstimate } from "@/lib/meal/compress";
import { localDay } from "@/lib/time";
import { enqueue, type OutboxMeal } from "@/lib/outbox/store";

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
  const [preview, setPreview] = useState<string | null>(null);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        The field owns a row; the actions sit under it.

        They used to share one line inside a pill, which was fine for "2 eggs
        on toast" and bad for anything longer: the buttons ate about 140px, so
        a real sentence wrapped early and the pill grew into a lozenge with
        text crammed down its left side. Giving the field the full width means
        a long entry wraps where the card ends rather than where the buttons
        start, and the shape stays a card as it grows instead of a stretched
        pill.
      */}
      <div className="surface p-2.5" style={{ borderRadius: 26 }}>
        <PromptField
          value={note}
          onChange={setNote}
          onSubmit={() => {
            if (!empty) void save();
          }}
          // Room for a proper example: nothing shares this row, so the
          // placeholder is bounded by the card rather than by what the buttons
          // left over. It still has to fit one line on a phone — the field
          // grows with its contents, and a placeholder counts, so a wrapped
          // one would leave the composer two lines tall while empty.
          placeholder="e.g. 2 eggs and a slice of toast"
          label="What did you eat?"
          className="min-h-11"
        />

      {/*
        Labelled, not just drawn, and given half the row each. Two unlabelled
        circles left the reader to infer a camera and a paper plane, and a
        paper plane means "send" in apps where sending is the point — here the
        point is logging a meal, which is not the same promise. Words cost a
        row that was empty anyway.

        Equal halves rather than sizing each to its label: the two are
        alternatives, not a primary with an afterthought beside it, and a
        50/50 split says that without needing a third colour to say it.
      */}
        <div className="mt-2.5 flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => fileInput.current?.click()}
            className="tappable flex-1 rounded-full"
          >
            <Camera className="size-4" />
            Photo
          </Button>

          <Button
            onClick={save}
            disabled={busy || empty}
            className="tappable flex-1 rounded-full"
            style={
              empty
                ? undefined
                : {
                    // A lit button: brighter at the top, with its own coloured
                    // shadow so it sits above the card rather than in it.
                    background:
                      "linear-gradient(to bottom, var(--accent-protein), var(--ink-protein))",
                    boxShadow:
                      "0 1px 2px color-mix(in oklch, var(--ink-protein) 45%, transparent), inset 0 1px 0 oklch(1 0 0 / 0.25)",
                  }
            }
          >
            <Send className="size-4" />
            {busy ? "Saving…" : "Log it"}
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

