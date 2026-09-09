import { describe, expect, it } from "vitest";
import { NO_USAGE, addUsage, costMicros, formatCost, usageFromGemini } from "./cost";

/**
 * These cover the ways a price table goes quietly wrong, rather than the
 * multiplication. Every case here is a failure that would still print a
 * plausible-looking number.
 */

describe("usageFromGemini", () => {
  it("takes the cached tokens out of the input, because Gemini counts them in it", () => {
    // 1,000 prompt tokens of which 400 were cached: 600 at the full rate.
    // Reading these as disjoint would bill 1,400 and overstate the input.
    expect(
      usageFromGemini({ promptTokenCount: 1000, cachedContentTokenCount: 400 }),
    ).toMatchObject({ input: 600, cachedInput: 400 });
  });

  it("bills thinking as output, which is reported separately from the answer", () => {
    expect(
      usageFromGemini({ candidatesTokenCount: 200, thoughtsTokenCount: 350 }),
    ).toMatchObject({ output: 550 });
  });

  it("never returns a negative input if the counts disagree", () => {
    expect(
      usageFromGemini({ promptTokenCount: 100, cachedContentTokenCount: 400 }).input,
    ).toBe(0);
  });

  it("treats a missing usage block as nothing rather than throwing", () => {
    expect(usageFromGemini(undefined)).toEqual(NO_USAGE);
  });
});

describe("costMicros", () => {
  const usage = { input: 1_000_000, cachedInput: 0, output: 0 };

  it("uses the introductory rate up to and including the last day", () => {
    expect(costMicros("gemini-3.7-flash", usage, new Date("2026-12-31T23:00:00Z"))).toBe(750_000);
  });

  it("uses the standard rate the moment it takes over", () => {
    // The whole reason both rates are in the table: on this morning the same
    // call doubles, and a single-rate table would keep reporting the old price.
    expect(costMicros("gemini-3.7-flash", usage, new Date("2027-01-01T00:00:00Z"))).toBe(1_500_000);
  });

  it("prices cached input at a tenth of fresh input", () => {
    const fresh = costMicros("gemini-3.7-flash", usage, new Date("2026-09-09"))!;
    const cached = costMicros(
      "gemini-3.7-flash",
      { input: 0, cachedInput: 1_000_000, output: 0 },
      new Date("2026-09-09"),
    )!;
    expect(cached * 10).toBe(fresh);
  });

  it("returns null for a model with no price, never zero", () => {
    // Zero would be indistinguishable from a free call and would understate
    // the total without saying anything.
    expect(costMicros("gemini-9-nonexistent", usage)).toBeNull();
  });
});

describe("addUsage", () => {
  it("sums every bucket, so a multi-call answer is one figure", () => {
    expect(
      addUsage({ input: 1, cachedInput: 2, output: 3 }, { input: 10, cachedInput: 20, output: 30 }),
    ).toEqual({ input: 11, cachedInput: 22, output: 33 });
  });
});

describe("formatCost", () => {
  it("keeps three decimals on a sub-cent amount rather than reading as free", () => {
    expect(formatCost(4_000)).toBe("0.400¢");
  });

  it("switches to two decimals once there is a whole cent to show", () => {
    expect(formatCost(50_000)).toBe("5.00¢");
  });

  it("switches to dollars past one", () => {
    expect(formatCost(2_500_000)).toBe("$2.50");
  });

  it("says unpriced rather than printing a number it does not have", () => {
    expect(formatCost(null)).toBe("unpriced");
  });
});
