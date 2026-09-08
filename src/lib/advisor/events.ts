import type { Advice } from "@/lib/meal/advise";

/**
 * The advisor's wire protocol: what the route streams and what the screen
 * parses. One shared type so the two ends cannot drift apart.
 *
 * The advisor used to answer in one lump after a silent wait, which was
 * tolerable when the wait was one model call. It now looks things up first,
 * and a screen that sits perfectly still through three look-ups reads as
 * broken. So the work narrates itself: a `tool` event per look-up, text as it
 * is written, and the card when there is one.
 */
export type AdvisorEvent =
  /** A look-up starting. `label` is written for a person: "reading your watch". */
  | { type: "tool"; label: string }
  | { type: "text"; delta: string }
  | { type: "advice"; advice: Advice }
  | { type: "done"; toolCalls: number; durationMs: number }
  | { type: "error"; message: string };

/** One SSE frame: `event: <type>\ndata: <json>\n\n`. */
export function encodeSseFrame(event: AdvisorEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

/**
 * Incremental parser for the client: feed it chunks, get events out.
 *
 * Frames arrive split across chunks — always, not occasionally — so the
 * leftover is held until its blank line turns up. A frame that will not parse
 * is dropped rather than thrown: one torn frame should cost one event, not
 * the rest of the answer.
 */
export function createSseParser(): (chunk: string) => AdvisorEvent[] {
  let buffer = "";
  return (chunk: string): AdvisorEvent[] => {
    buffer += chunk;
    const events: AdvisorEvent[] = [];
    let separator = buffer.indexOf("\n\n");
    while (separator !== -1) {
      const frame = buffer.slice(0, separator);
      buffer = buffer.slice(separator + 2);
      const data = frame.split("\n").find((line) => line.startsWith("data: "));
      if (data) {
        try {
          events.push(JSON.parse(data.slice(6)) as AdvisorEvent);
        } catch {
          /* A torn frame is dropped; the stream continues. */
        }
      }
      separator = buffer.indexOf("\n\n");
    }
    return events;
  };
}
