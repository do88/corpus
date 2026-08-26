import { describe, expect, it } from "vitest";
import { datesBetween, monthRange, summarise, weekRange } from "./summary";
import type { MealRow } from "./repository";
import { FALLBACK_TARGETS } from "./targets";

/**
 * The averaging rule is the whole point of this module, so it is what gets
 * tested. A mean that quietly includes unlogged days does not crash — it
 * reports 1,700 kcal to someone eating 2,300, which is exactly the sort of
 * wrong number a tracker gets believed about.
 */

const meal = (date: string, kcal: number, protein: number, status = "analyzed"): MealRow =>
  ({
    id: `${date}-${kcal}`,
    logged_at: `${date}T12:00:00Z`,
    local_date: date,
    status,
    attempts: 1,
    photo_path: null,
    note: null,
    kcal,
    protein_g: protein,
    carbs_g: 0,
    fat_g: 0,
    items: null,
    confidence: null,
    assumptions: null,
    edited: false,
    error: null,
  }) as MealRow;

const WEEK = datesBetween("2026-08-24", "2026-08-30");

describe("summarise", () => {
  it("averages over logged days, not elapsed days", () => {
    // Two days at 2,000. Five days untouched.
    const s = summarise(
      [meal("2026-08-24", 2000, 150), meal("2026-08-25", 2000, 150)],
      WEEK,
      FALLBACK_TARGETS,
    );
    expect(s.loggedDays).toBe(2);
    expect(s.totalDays).toBe(7);
    // 2000, not 4000/7 = 571.
    expect(s.average.kcal).toBe(2000);
  });

  it("reports coverage separately rather than folding it in", () => {
    const s = summarise([meal("2026-08-24", 2000, 150)], WEEK, FALLBACK_TARGETS);
    expect(s.loggedDays).toBe(1);
    expect(s.totalDays).toBe(7);
    // The average is honest about the day it saw; coverage says how many.
    expect(s.average.kcal).toBe(2000);
  });

  it("sums several meals within a day before averaging", () => {
    const s = summarise(
      [meal("2026-08-24", 600, 40), meal("2026-08-24", 900, 50), meal("2026-08-25", 1500, 90)],
      WEEK,
      FALLBACK_TARGETS,
    );
    expect(s.days[0].kcal).toBe(1500);
    expect(s.average.kcal).toBe(1500);
    expect(s.loggedDays).toBe(2);
  });

  it("ignores pending and failed meals entirely", () => {
    const s = summarise(
      [meal("2026-08-24", 0, 0, "pending"), meal("2026-08-25", 0, 0, "failed")],
      WEEK,
      FALLBACK_TARGETS,
    );
    // Neither counts as a logged day — a pending meal has no numbers yet, and
    // marking the day logged at zero would understate it.
    expect(s.loggedDays).toBe(0);
    expect(s.average.kcal).toBe(0);
  });

  it("treats protein as a floor and calories as a ceiling", () => {
    const { protein_g, kcal } = FALLBACK_TARGETS;
    const s = summarise(
      [
        meal("2026-08-24", kcal - 200, protein_g + 10), // under kcal, over protein — both good
        meal("2026-08-25", kcal + 400, protein_g - 40), // over kcal, under protein — both bad
      ],
      WEEK,
      FALLBACK_TARGETS,
    );
    expect(s.onTarget.protein).toBe(1);
    expect(s.onTarget.kcal).toBe(1);
  });

  it("gives zeroes rather than NaN for an empty period", () => {
    const s = summarise([], WEEK, FALLBACK_TARGETS);
    expect(s.average.kcal).toBe(0);
    expect(s.average.protein_g).toBe(0);
    expect(s.onTarget.protein).toBe(0);
  });

  it("keeps totals calendar-wide even though averages are not", () => {
    const s = summarise(
      [meal("2026-08-24", 2000, 150), meal("2026-08-25", 2000, 150)],
      WEEK,
      FALLBACK_TARGETS,
    );
    // A total is a sum over what happened and needs no coverage caveat.
    expect(s.total.kcal).toBe(4000);
  });

  it("returns a slot for every date in the range, in order", () => {
    const s = summarise([], WEEK, FALLBACK_TARGETS);
    expect(s.days).toHaveLength(7);
    expect(s.days[0].date).toBe("2026-08-24");
    expect(s.days[6].date).toBe("2026-08-30");
  });
});

describe("ranges", () => {
  it("anchors a week to Monday", () => {
    // 2026-08-26 is a Wednesday.
    expect(weekRange("2026-08-26")).toEqual(["2026-08-24", "2026-08-30"]);
    // A Sunday belongs to the week that started six days earlier, not the next.
    expect(weekRange("2026-08-30")).toEqual(["2026-08-24", "2026-08-30"]);
  });

  it("covers a calendar month, including a short one", () => {
    expect(monthRange("2026-08-26")).toEqual(["2026-08-01", "2026-08-31"]);
    expect(monthRange("2026-02-10")).toEqual(["2026-02-01", "2026-02-28"]);
  });

  it("counts days inclusively", () => {
    expect(datesBetween("2026-08-24", "2026-08-30")).toHaveLength(7);
    expect(datesBetween("2026-08-24", "2026-08-24")).toHaveLength(1);
  });
});
