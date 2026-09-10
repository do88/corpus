import { describe, expect, it } from "vitest";
import { calculateStreaks, type StreakMeal } from "./streaks";
import { datesBetween } from "./summary";

const meal = (date: string, status: StreakMeal["status"] = "analyzed"): StreakMeal => ({
  local_date: date,
  kcal: 2200,
  protein_g: 191,
  status,
});

describe("the logging streak", () => {
  it("counts consecutive days ending today", () => {
    expect(
      calculateStreaks([meal("2026-09-05"), meal("2026-09-06"), meal("2026-09-07")], "2026-09-07"),
    ).toEqual({ logged: 3 });
  });

  it("keeps yesterday's streak alive before today's first entry", () => {
    // A streak that resets every morning until breakfast is a nag, not a record.
    expect(calculateStreaks([meal("2026-09-05"), meal("2026-09-06")], "2026-09-07")).toEqual({
      logged: 2,
    });
  });

  it("breaks at a gap", () => {
    expect(
      calculateStreaks([meal("2026-09-01"), meal("2026-09-06"), meal("2026-09-07")], "2026-09-07"),
    ).toEqual({ logged: 2 });
  });

  it("counts a day that is still pending as logged", () => {
    // Something was written down, which is the whole claim the flame makes.
    expect(calculateStreaks([meal("2026-09-07", "pending")], "2026-09-07")).toEqual({ logged: 1 });
  });

  it("ignores entries dated after today", () => {
    expect(calculateStreaks([meal("2026-09-09"), meal("2026-09-07")], "2026-09-07")).toEqual({
      logged: 1,
    });
  });

  it("does not stop at ten days", () => {
    // The first version read a ten-day window and could not count past it.
    const dates = datesBetween("2026-08-01", "2026-09-07");
    expect(calculateStreaks(dates.map((d) => meal(d)), "2026-09-07")).toEqual({
      logged: dates.length,
    });
  });

  it("is zero on an empty log", () => {
    expect(calculateStreaks([], "2026-09-07")).toEqual({ logged: 0 });
  });
});
