import { describe, expect, it } from "vitest";
import { weightChange } from "./weight";

describe("weightChange", () => {
  it("measures from the last reading on or before the cutoff", () => {
    const series = [
      { date: "2026-05-01", kg: 120.4 },
      { date: "2026-06-10", kg: 118.9 },
      { date: "2026-06-20", kg: 118.1 },
      { date: "2026-09-10", kg: 114.8 },
    ];
    // Ninety days before 10 September is 12 June; 10 June is the last
    // reading on or before it.
    expect(weightChange(series, 90)).toEqual({ kg: -4.1, since: "2026-06-10" });
  });

  it("carries the real date when the nearest reading is older than the window", () => {
    // A gap in the weigh-ins must show up in the label, not be papered over.
    const series = [
      { date: "2026-04-01", kg: 121 },
      { date: "2026-09-10", kg: 114.8 },
    ];
    expect(weightChange(series, 90)?.since).toBe("2026-04-01");
  });

  it("is null when there is nothing old enough to compare against", () => {
    expect(weightChange([{ date: "2026-09-01", kg: 115 }, { date: "2026-09-10", kg: 114.8 }], 90)).toBeNull();
    expect(weightChange([], 90)).toBeNull();
  });
});
