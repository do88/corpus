import { describe, expect, it } from "vitest";
import { formatTime, mealBand } from "./format";

/**
 * The band a meal falls in decides what colour it gets on the timeline, and
 * every interesting case is a boundary: the two that wrap past midnight, and
 * the fact that the zone is fixed to London while the timestamps are UTC. Get
 * the offset wrong and every meal shifts a band for half the year — which
 * looks like a design choice rather than a bug.
 */

describe("mealBand", () => {
  // August is BST, so London is UTC+1.
  it("reads the clock in London, not in UTC", () => {
    // 11:30 UTC is 12:30 in London: afternoon, not morning.
    expect(mealBand("2026-08-26T11:30:00Z")).toBe("afternoon");
    expect(mealBand("2026-08-26T09:00:00Z")).toBe("morning");
  });

  it("holds the same boundaries through the winter offset", () => {
    // January is GMT, so the same wall-clock time is a different instant.
    expect(mealBand("2026-01-15T11:30:00Z")).toBe("morning");
    expect(mealBand("2026-01-15T12:30:00Z")).toBe("afternoon");
  });

  it("puts the small hours in the evening, matching the 04:00 day boundary", () => {
    // 00:30 and 03:30 London still belong to the night before, because
    // `localDay` has not rolled the date over yet.
    expect(mealBand("2026-08-25T23:30:00Z")).toBe("evening");
    expect(mealBand("2026-08-26T02:30:00Z")).toBe("evening");
    // 04:30 London is the first morning hour.
    expect(mealBand("2026-08-26T03:30:00Z")).toBe("morning");
  });

  it("survives midnight, where en-GB can render hour 24", () => {
    // 23:00Z is exactly 00:00 in London. With `hour12: false` some ICU builds
    // format this as "24", which lands outside every band.
    const band = mealBand("2026-08-25T23:00:00Z");
    expect(band).toBe("evening");
    expect(["morning", "afternoon", "evening"]).toContain(band);
  });

  it("covers the afternoon edges exactly", () => {
    expect(mealBand("2026-08-26T10:59:00Z")).toBe("morning"); // 11:59
    expect(mealBand("2026-08-26T11:00:00Z")).toBe("afternoon"); // 12:00
    expect(mealBand("2026-08-26T16:59:00Z")).toBe("afternoon"); // 17:59
    expect(mealBand("2026-08-26T17:00:00Z")).toBe("evening"); // 18:00
  });
});

describe("formatTime", () => {
  it("agrees with the band it is printed beside", () => {
    // The pair a reader sees: a time of 12:30 must not sit on a morning node.
    expect(formatTime("2026-08-26T11:30:00Z")).toBe("12:30");
    expect(mealBand("2026-08-26T11:30:00Z")).toBe("afternoon");
  });
});
