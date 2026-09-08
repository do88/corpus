import { describe, expect, it } from "vitest";
import { createSseParser, encodeSseFrame, type AdvisorEvent } from "./events";

const text = (delta: string): AdvisorEvent => ({ type: "text", delta });

describe("the advisor's wire protocol", () => {
  it("round trips an event", () => {
    const parse = createSseParser();
    expect(parse(encodeSseFrame(text("hello")))).toEqual([text("hello")]);
  });

  it("reassembles a frame split across chunks, which is the normal case", () => {
    const parse = createSseParser();
    const frame = encodeSseFrame(text("two eggs"));
    const half = Math.floor(frame.length / 2);
    expect(parse(frame.slice(0, half))).toEqual([]);
    expect(parse(frame.slice(half))).toEqual([text("two eggs")]);
  });

  it("returns several events arriving in one chunk, in order", () => {
    const parse = createSseParser();
    const chunk = encodeSseFrame(text("a")) + encodeSseFrame(text("b"));
    expect(parse(chunk)).toEqual([text("a"), text("b")]);
  });

  it("drops a torn frame without losing the ones around it", () => {
    const parse = createSseParser();
    const chunk = `event: text\ndata: {not json\n\n${encodeSseFrame(text("after"))}`;
    expect(parse(chunk)).toEqual([text("after")]);
  });

  it("holds an unterminated frame rather than guessing at it", () => {
    const parse = createSseParser();
    expect(parse('event: text\ndata: {"type":"text","delta":"x"}')).toEqual([]);
  });
});
