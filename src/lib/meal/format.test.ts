import { describe, expect, it } from "vitest";
import { describeItem, formatTime, mealBand, summariseItems } from "./format";

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

describe("describeItem", () => {
  // Every one of these is a real `qty` string the model has produced.
  it("leads with the count when there is more than one", () => {
    expect(describeItem({ name: "Mr Kipling Birthday Cake Slices", qty: "2 slices (64g)" })).toBe(
      "2 \u00d7 Mr Kipling Birthday Cake Slices",
    );
    expect(describeItem({ name: "Chicken thighs (cooked)", qty: "3 thighs (~270g)" })).toBe(
      "3 \u00d7 Chicken thighs (cooked)",
    );
    expect(describeItem({ name: "Rich tea biscuits", qty: "2 biscuits (approx 17g)" })).toBe(
      "2 \u00d7 Rich tea biscuits",
    );
  });

  it("leaves a single item alone", () => {
    // "1 x Green beans" is noise; no number already says one.
    expect(describeItem({ name: "Green beans", qty: "1 portion (80g)" })).toBe("Green beans");
    expect(describeItem({ name: "Red bell pepper", qty: "1 medium (120g)" })).toBe(
      "Red bell pepper",
    );
    expect(describeItem({ name: "Aldi egg fried microwave rice", qty: "1 pack (250g)" })).toBe(
      "Aldi egg fried microwave rice",
    );
  });

  it("never mistakes a weight for a count", () => {
    // The failure this guards: "250 x Jacket potato".
    expect(describeItem({ name: "Jacket potato", qty: "250g" })).toBe("Jacket potato");
    expect(describeItem({ name: "Milk", qty: "300 ml" })).toBe("Milk");
    expect(describeItem({ name: "Rice", qty: "200g cooked" })).toBe("Rice");
  });

  it("copes with quantities it has never seen", () => {
    expect(describeItem({ name: "Avocado", qty: "half an avocado" })).toBe("Avocado");
    expect(describeItem({ name: "Toast", qty: "" })).toBe("Toast");
    // "2 x 32g slices" — the count is real even though a weight follows it.
    expect(describeItem({ name: "Cake slice", qty: "2 x 32g slices" })).toBe(
      "2 \u00d7 Cake slice",
    );
  });
});

describe("summariseItems", () => {
  it("writes a mixed meal the way the card shows it", () => {
    expect(
      summariseItems([
        { name: "Aldi egg fried microwave rice", qty: "1 pack (250g)" },
        { name: "Chicken thighs (cooked)", qty: "3 thighs (~270g)" },
        { name: "Green beans", qty: "1 portion (80g)" },
      ]),
    ).toBe("Aldi egg fried microwave rice, 3 \u00d7 Chicken thighs (cooked), Green beans");
  });
});
