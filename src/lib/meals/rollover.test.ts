import { describe, expect, it } from "vitest";
import { allowanceFor, rolloverFor } from "./rollover";
import type { MealRow } from "./repository";

const BASE = 2300;

// 2026-08-31 is a Monday; 2026-09-06 the Sunday that closes that week.
const MON = "2026-08-31";
const TUE = "2026-09-01";
const WED = "2026-09-02";
const THU = "2026-09-03";
const NEXT_MON = "2026-09-07";

const meal = (day: string, kcal: number, status: MealRow["status"] = "analyzed") =>
  ({ local_date: day, kcal, status }) as MealRow;

describe("rolloverFor", () => {
  it("banks what was left on an earlier day", () => {
    expect(rolloverFor(TUE, BASE, [meal(MON, 1800)])).toEqual({ banked: 500, fromDays: 1 });
  });

  it("adds up several days", () => {
    const rollover = rolloverFor(WED, BASE, [meal(MON, 1800), meal(TUE, 2000)]);
    expect(rollover).toEqual({ banked: 800, fromDays: 2 });
  });

  it("banks nothing for a day with nothing logged", () => {
    // The rule that matters. A day you forgot to open the app looks identical
    // to a day you ate nothing, and handing over a full allowance for
    // forgetting would make the whole idea untrustworthy.
    expect(rolloverFor(WED, BASE, [meal(TUE, 2000)])).toEqual({ banked: 300, fromDays: 1 });
  });

  it("does not subtract for a day that went over", () => {
    // Only surpluses carry. Monday's excess is Monday's business.
    expect(rolloverFor(TUE, BASE, [meal(MON, 3000)])).toEqual({ banked: 0, fromDays: 0 });
  });

  it("lets a light day offset an earlier heavy one, but no further", () => {
    const rollover = rolloverFor(WED, BASE, [meal(MON, 3000), meal(TUE, 1300)]);
    expect(rollover).toEqual({ banked: 1000, fromDays: 1 });
  });

  it("ignores today itself, which is not finished", () => {
    expect(rolloverFor(TUE, BASE, [meal(TUE, 200)])).toEqual({ banked: 0, fromDays: 0 });
  });

  it("ignores days later in the week", () => {
    expect(rolloverFor(TUE, BASE, [meal(WED, 100), meal(THU, 100)])).toEqual({
      banked: 0,
      fromDays: 0,
    });
  });

  it("empties on Monday", () => {
    // Last week's frugality does not fund this week. A budget that never
    // resets is not a budget.
    const lastWeek = [meal(MON, 500), meal(TUE, 500), meal(WED, 500)];
    expect(rolloverFor(NEXT_MON, BASE, lastWeek)).toEqual({ banked: 0, fromDays: 0 });
  });

  it("gives Monday itself nothing to carry", () => {
    expect(rolloverFor(MON, BASE, [meal(MON, 100)])).toEqual({ banked: 0, fromDays: 0 });
  });

  it("does not count meals that have not been estimated yet", () => {
    // A pending meal's calories are unknown, not zero. Banking them would hand
    // over an allowance that the estimate is moments away from spending.
    const meals = [meal(MON, 1000), meal(MON, 0, "pending"), meal(MON, 0, "failed")];
    expect(rolloverFor(TUE, BASE, meals)).toEqual({ banked: 1300, fromDays: 1 });
  });

  it("sums several meals within one day before comparing", () => {
    const meals = [meal(MON, 800), meal(MON, 700), meal(MON, 400)];
    expect(rolloverFor(TUE, BASE, meals)).toEqual({ banked: 400, fromDays: 1 });
  });

  it("counts a logged day of exactly the target as no surplus", () => {
    expect(rolloverFor(TUE, BASE, [meal(MON, BASE)])).toEqual({ banked: 0, fromDays: 0 });
  });
});

describe("allowanceFor", () => {
  it("adds the bank to the fixed goal", () => {
    expect(allowanceFor(BASE, { banked: 500, fromDays: 1 })).toBe(2800);
  });

  it("is just the goal when nothing was banked", () => {
    expect(allowanceFor(BASE, { banked: 0, fromDays: 0 })).toBe(BASE);
  });
});
