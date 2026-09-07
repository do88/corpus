import { describe, expect, it } from "vitest";
import { calculateStreaks, type StreakMeal } from "./streaks";
import { datesBetween } from "./summary";

const targets = { kcal: 2300, protein_g: 191 };
const meal = (date: string, kcal = 2200, protein_g = 191, status: StreakMeal["status"] = "analyzed"): StreakMeal =>
  ({ local_date: date, kcal, protein_g, status });

describe("tracking streaks", () => {
  it("separates logging from hitting both targets", () => {
    expect(calculateStreaks([meal("2026-09-05"), meal("2026-09-06", 2500), meal("2026-09-07", 125, 25)], "2026-09-07", targets))
      .toEqual({ logged: 3, onTarget: 0 });
  });
  it("waits until the tracking day closes before awarding target days", () => {
    expect(calculateStreaks([meal("2026-09-06"), meal("2026-09-07")], "2026-09-07", targets))
      .toEqual({ logged: 2, onTarget: 1 });
  });
  it("preserves yesterday's streak before today's first log", () => {
    expect(calculateStreaks([meal("2026-09-05"), meal("2026-09-06")], "2026-09-07", targets))
      .toEqual({ logged: 2, onTarget: 2 });
  });
  it("requires strictly under calories and at least the protein goal", () => {
    for (const row of [meal("2026-09-06", 2300), meal("2026-09-06", 2200, 190)]) {
      expect(calculateStreaks([row], "2026-09-07", targets).onTarget).toBe(0);
    }
  });
  it("counts pending or failed entries as logged but cannot award incomplete totals", () => {
    for (const status of ["pending", "failed"] as const) {
      expect(calculateStreaks([meal("2026-09-06"), meal("2026-09-06", 0, 0, status)], "2026-09-07", targets))
        .toEqual({ logged: 1, onTarget: 0 });
    }
  });
  it("sums meals before testing the day", () => {
    expect(calculateStreaks([meal("2026-09-06", 1200, 100), meal("2026-09-06", 1200, 100)], "2026-09-07", targets).onTarget).toBe(0);
  });
  it("does not cap streaks at ten days or mistake zero kcal for no log", () => {
    const meals = datesBetween("2026-08-01", "2026-09-06").map(date => meal(date));
    meals.push(meal("2026-09-07", 0, 0));
    expect(calculateStreaks(meals, "2026-09-07", targets)).toEqual({ logged: 38, onTarget: 37 });
  });
  it("breaks at gaps and ignores future entries", () => {
    expect(calculateStreaks([meal("2026-09-04"), meal("2026-09-06"), meal("2026-09-08")], "2026-09-07", targets))
      .toEqual({ logged: 1, onTarget: 1 });
    expect(calculateStreaks([], "2026-09-07", targets)).toEqual({ logged: 0, onTarget: 0 });
  });
  it("recalculates both days when a meal is backdated", () => {
    const rows = [meal("2026-09-05", 1000, 100), meal("2026-09-06", 1000, 100), meal("2026-09-06", 1000, 100)];
    expect(calculateStreaks(rows, "2026-09-07", targets).onTarget).toBe(1);
    rows[2].local_date = "2026-09-05";
    expect(calculateStreaks(rows, "2026-09-07", targets).onTarget).toBe(0);
  });
});
