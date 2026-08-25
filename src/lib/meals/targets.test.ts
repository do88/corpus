import { describe, expect, it } from "vitest";
import { computeTargets, KCAL_PER_G, type BodyInput } from "./targets";

/**
 * These decide what someone eats every day, so the properties that matter are
 * tested rather than the arithmetic. A wrong threshold here does not crash — it
 * quietly gives bad advice for months, which is the same reason `metrics.ts`
 * tests its boundaries rather than its happy path.
 */

const OWNER: BodyInput = {
  weightKg: 114.8,
  leanMassKg: 79.44,
  heightCm: 193,
  age: 37,
  goalWeightKg: 100,
  sessionsLast28: 7,
};

describe("computeTargets", () => {
  it("uses Katch–McArdle when lean mass is known", () => {
    const t = computeTargets(OWNER);
    expect(t.basis.bmrFormula).toBe("katch-mcardle");
    // 370 + 21.6 × 79.44
    expect(t.basis.bmr).toBe(2086);
  });

  it("falls back to Mifflin–St Jeor without a body-composition reading", () => {
    const t = computeTargets({ ...OWNER, leanMassKg: null });
    expect(t.basis.bmrFormula).toBe("mifflin-st-jeor");
    // 10(114.8) + 6.25(193) − 5(37) + 5
    expect(t.basis.bmr).toBe(2174);
  });

  it("reads BMR from lean tissue, so body fat does not inflate it", () => {
    // Same lean mass, 15 kg more fat. Fat is close to metabolically inert, so
    // the resting burn should not move — the whole reason for the formula.
    const heavier = computeTargets({ ...OWNER, weightKg: OWNER.weightKg + 15 });
    expect(heavier.basis.bmr).toBe(computeTargets(OWNER).basis.bmr);
  });

  it("scales the activity factor with sessions actually logged", () => {
    const idle = computeTargets({ ...OWNER, sessionsLast28: 0 });
    const some = computeTargets({ ...OWNER, sessionsLast28: 7 });
    const lots = computeTargets({ ...OWNER, sessionsLast28: 24 });
    expect(idle.basis.activityFactor).toBeLessThan(some.basis.activityFactor);
    expect(some.basis.activityFactor).toBeLessThan(lots.basis.activityFactor);
    expect(idle.kcal).toBeLessThan(lots.kcal);
  });

  it("keeps the macros summing to the calorie target", () => {
    for (const sessions of [0, 4, 7, 12, 20, 28]) {
      const t = computeTargets({ ...OWNER, sessionsLast28: sessions });
      const sum =
        t.protein_g * KCAL_PER_G.protein +
        t.carbs_g * KCAL_PER_G.carbs +
        t.fat_g * KCAL_PER_G.fat;
      // Rounding four figures to whole grams cannot land exactly; anything
      // beyond a few kcal means the split has stopped being a split.
      expect(Math.abs(sum - t.kcal)).toBeLessThanOrEqual(6);
    }
  });

  it("holds protein steady as the deficit deepens — protein first, literally", () => {
    const active = computeTargets({ ...OWNER, sessionsLast28: 20 });
    const idle = computeTargets({ ...OWNER, sessionsLast28: 0 });
    expect(idle.kcal).toBeLessThan(active.kcal);
    // Fewer calories, same protein: the cut comes out of carbs and fat.
    expect(idle.protein_g).toBe(active.protein_g);
    expect(idle.carbs_g).toBeLessThan(active.carbs_g);
  });

  it("anchors the fat floor to goal weight, so it does not fall as you do", () => {
    const now = computeTargets(OWNER);
    const later = computeTargets({ ...OWNER, weightKg: 105, leanMassKg: 76 });
    expect(later.fat_g).toBe(now.fat_g);
  });

  it("never asks for negative carbs", () => {
    // A very small, very lean person: protein and the fat floor could otherwise
    // exceed the whole calorie target.
    const t = computeTargets({
      weightKg: 50,
      leanMassKg: 45,
      heightCm: 160,
      age: 25,
      goalWeightKg: 48,
      sessionsLast28: 0,
    });
    expect(t.carbs_g).toBeGreaterThanOrEqual(0);
  });

  it("projects a timeline only when there is weight to lose", () => {
    expect(computeTargets(OWNER).basis.weeksToGoal).toBeGreaterThan(0);
    // Already at goal — no timeline rather than a nonsensical one.
    expect(computeTargets({ ...OWNER, goalWeightKg: 120 }).basis.weeksToGoal).toBeNull();
  });

  it("stays inside a sustainable rate of loss", () => {
    const t = computeTargets(OWNER);
    // Under ~1% of bodyweight a week is the band that holds without shedding
    // lean mass along with the fat.
    expect(t.basis.weeklyLossKg).toBeGreaterThan(0.3);
    expect(t.basis.weeklyLossKg).toBeLessThan(OWNER.weightKg * 0.01);
  });
});
