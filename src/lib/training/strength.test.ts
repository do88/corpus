import { describe, expect, it } from "vitest";
import { strengthMeter, type LiftReading } from "./strength";

const lift = (short: string, current: number | null, peak: number | null): LiftReading => ({
  key: short.toLowerCase(),
  short,
  current,
  peak,
});

// The four lifts roughly as they are on file.
const lifts = [
  lift("Deadlift", 168, 180),
  lift("Squat", 96, 130),
  lift("Bench Press", 113.3, 120),
  lift("Overhead Press", 72, 75),
];

describe("strengthMeter", () => {
  it("adds the lifts up and sets them against the same lifts at their best", () => {
    const meter = strengthMeter(lifts, 114.8);
    expect(meter?.total).toBe(449);
    expect(meter?.best).toBe(505);
    expect(meter?.pctOfBest).toBe(89);
    expect(meter?.timesBodyweight).toBe(3.9);
  });

  it("leaves a lift with nothing recent out of both sums, and names it", () => {
    // Counting it as zero would report four months off one lift as a
    // seventy-kilo loss of strength across all of them.
    const meter = strengthMeter([...lifts.slice(0, 3), lift("Overhead Press", null, 75)], 114.8);
    expect(meter?.total).toBe(377);
    expect(meter?.best).toBe(430);
    expect(meter?.missing).toEqual(["Overhead Press"]);
    expect(meter?.lifts.map((l) => l.short)).toEqual(["Deadlift", "Squat", "Bench Press"]);
  });

  it("has no ratio to bodyweight without a weight", () => {
    expect(strengthMeter(lifts, null)?.timesBodyweight).toBeNull();
  });

  it("is null when no lift has anything recent", () => {
    expect(strengthMeter([lift("Deadlift", null, 180)], 114.8)).toBeNull();
    expect(strengthMeter([], 114.8)).toBeNull();
  });
});
