import { describe, expect, it } from "vitest";
import { DAILY_KCAL_TARGET, KCAL_PER_G, computeTargets, type BodyInput } from "./targets";

/**
 * These decide what someone eats every day, so the properties that matter are
 * tested rather than the arithmetic. A wrong threshold here does not crash — it
 * quietly gives bad advice for months, which is the same reason `metrics.ts`
 * tests its boundaries rather than its happy path.
 */

const OWNER: BodyInput = {
  weightKg: 114.8,
  leanMassKg: 79.44,
  heightCm: 195,
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
    // 10(114.8) + 6.25(195) − 5(37) + 5
    expect(t.basis.bmr).toBe(2187);
  });

  it("reads BMR from lean tissue, so body fat does not inflate it", () => {
    // Same lean mass, 15 kg more fat. Fat is close to metabolically inert, so
    // the resting burn should not move — the whole reason for the formula.
    const heavier = computeTargets({ ...OWNER, weightKg: OWNER.weightKg + 15 });
    expect(heavier.basis.bmr).toBe(computeTargets(OWNER).basis.bmr);
  });

  it("estimates a higher maintenance for someone who trains more", () => {
    const idle = computeTargets({ ...OWNER, sessionsLast28: 0 });
    const some = computeTargets({ ...OWNER, sessionsLast28: 7 });
    const lots = computeTargets({ ...OWNER, sessionsLast28: 24 });
    expect(idle.basis.activityFactor).toBeLessThan(some.basis.activityFactor);
    expect(some.basis.activityFactor).toBeLessThan(lots.basis.activityFactor);
    expect(idle.basis.tdee).toBeLessThan(lots.basis.tdee);
  });

  it("does not let training move the goal itself", () => {
    // The old behaviour, deliberately removed. Sessions ageing out of a
    // trailing window took the target from 2,294 to 2,002 overnight and
    // rewrote how every earlier day had scored. Maintenance may move; the
    // number you are trying to hit may not.
    const targets = [0, 4, 7, 12, 20, 28].map((sessionsLast28) =>
      computeTargets({ ...OWNER, sessionsLast28 }).kcal,
    );
    expect(new Set(targets).size).toBe(1);
    expect(targets[0]).toBe(DAILY_KCAL_TARGET);
  });

  it("takes an explicit goal when one is set", () => {
    expect(computeTargets({ ...OWNER, dailyKcalTarget: 2000 }).kcal).toBe(2000);
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

  it("holds protein steady as the goal tightens — protein first, literally", () => {
    const generous = computeTargets({ ...OWNER, dailyKcalTarget: 2600 });
    const tight = computeTargets({ ...OWNER, dailyKcalTarget: 2000 });
    expect(tight.kcal).toBeLessThan(generous.kcal);
    // Fewer calories, same protein: the cut comes out of carbs and fat.
    expect(tight.protein_g).toBe(generous.protein_g);
    expect(tight.carbs_g).toBeLessThan(generous.carbs_g);
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
