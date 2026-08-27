import { describe, expect, it } from "vitest";
import { clampDay, localDay, parseDay, toDay } from "./time";

/**
 * The day boundary, checked against the database's own answer.
 *
 * `local_day()` in migration ...818 is the authority, because it is what
 * stamps rows inserted server-side. These expectations were produced by
 * querying it directly across both UK transitions — 144 instants at half-hour
 * steps — and are the four that the previous implementation got wrong.
 *
 * The bug was an ordering one. Postgres converts to London wall clock *first*
 * and then subtracts four hours from that wall clock; subtracting four hours
 * of absolute time and converting afterwards is a different sum, and the two
 * only disagree on the mornings the clocks move.
 */
describe("localDay", () => {
  it("agrees with Postgres on the spring-forward morning", () => {
    // 2027-03-28: clocks go forward at 01:00 UTC. At 03:00Z London is 04:00
    // BST, which is past the boundary, so this is already the 28th.
    expect(localDay(new Date("2027-03-28T03:00:00Z"))).toBe("2027-03-28");
    expect(localDay(new Date("2027-03-28T03:30:00Z"))).toBe("2027-03-28");
    // Just before, it is still the 27th.
    expect(localDay(new Date("2027-03-28T02:30:00Z"))).toBe("2027-03-27");
  });

  it("agrees with Postgres on the clocks-back morning", () => {
    // 2026-10-25: clocks go back at 01:00 UTC. At 03:00Z London is 03:00 GMT,
    // which is still before the 04:00 boundary, so it counts to the 24th.
    expect(localDay(new Date("2026-10-25T03:00:00Z"))).toBe("2026-10-24");
    expect(localDay(new Date("2026-10-25T03:30:00Z"))).toBe("2026-10-24");
    expect(localDay(new Date("2026-10-25T04:00:00Z"))).toBe("2026-10-25");
  });

  it("puts the small hours on the day before", () => {
    // The rule the boundary exists for: a meal at 1am is last night's.
    expect(localDay(new Date("2026-08-26T00:30:00Z"))).toBe("2026-08-25");
    expect(localDay(new Date("2026-08-26T02:00:00Z"))).toBe("2026-08-25");
    // 04:00 London on a BST day is 03:00Z — the first moment of the new day.
    expect(localDay(new Date("2026-08-26T03:00:00Z"))).toBe("2026-08-26");
  });

  it("reads the London clock, not the machine's", () => {
    // 23:30Z in August is 00:30 the next day in London, and before 04:00, so
    // it belongs to the day that just ended in London — the 26th.
    expect(localDay(new Date("2026-08-26T23:30:00Z"))).toBe("2026-08-26");
  });
});

describe("parseDay / toDay", () => {
  it("round-trips a plain date unchanged", () => {
    for (const day of ["2026-01-01", "2026-03-29", "2026-08-26", "2026-10-25", "2026-12-31"]) {
      expect(toDay(parseDay(day))).toBe(day);
    }
  });

  it("survives the days the clocks move", () => {
    // The reason the old code anchored everything to `T12:00:00Z`: parsing a
    // bare date at midnight in a zone where midnight shifts can land on the
    // wrong day. Anchored in the app's zone, it does not.
    expect(toDay(parseDay("2027-03-28"))).toBe("2027-03-28");
    expect(toDay(parseDay("2026-10-25"))).toBe("2026-10-25");
  });
});

describe("clampDay", () => {
  const today = "2026-08-27";
  const earliest = "2026-08-26";

  it("refuses a day before anything was ever logged", () => {
    // The reported case: a hand-typed URL a month before the first entry,
    // which showed an empty screen with no indication why.
    expect(clampDay("2026-07-27", today, earliest)).toBe(earliest);
    expect(clampDay("1999-01-01", today, earliest)).toBe(earliest);
  });

  it("refuses a day that has not happened", () => {
    expect(clampDay("2026-08-28", today, earliest)).toBe(today);
    expect(clampDay("2030-01-01", today, earliest)).toBe(today);
  });

  it("allows every day in between, logged or not", () => {
    // A gap inside your history is worth opening — it is a day you did not
    // log, which is information, and it is what Progress counts.
    expect(clampDay("2026-08-26", today, earliest)).toBe("2026-08-26");
    expect(clampDay("2026-08-27", today, earliest)).toBe("2026-08-27");
  });

  it("falls back to today rather than throwing", () => {
    expect(clampDay(undefined, today, earliest)).toBe(today);
    expect(clampDay("not-a-date", today, earliest)).toBe(today);
    expect(clampDay("2026-8-2", today, earliest)).toBe(today);
  });

  it("has no floor on an empty log", () => {
    // Nothing logged yet: there is no history to be outside of, so only the
    // future is refused.
    expect(clampDay("2026-07-27", today, null)).toBe("2026-07-27");
    expect(clampDay("2026-08-28", today, null)).toBe(today);
  });
});
