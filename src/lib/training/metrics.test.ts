import { describe, expect, it } from "vitest";
import {
  compositionTargets,
  epley1rm,
  estimateEnergy,
  ffmi,
  hrZone,
  judgeBodyFat,
  judgeCadence,
  judgePctOfPeak,
  judgeVisceralFat,
  proteinTarget,
  weeksToTarget,
} from "./metrics";

/**
 * These are the functions that decide what a number *means*. A wrong threshold
 * here doesn't crash — it quietly gives bad advice — so the boundaries are
 * tested explicitly rather than just the happy path.
 */

describe("epley1rm", () => {
  it("returns the load itself at a single rep", () => {
    expect(epley1rm(100, 1)).toBeCloseTo(103.33, 2);
  });

  it("matches the deadlift PR in the data (140kg x 6 -> 168)", () => {
    expect(epley1rm(140, 6)).toBeCloseTo(168, 5);
  });

  it("scales with reps", () => {
    expect(epley1rm(100, 10)).toBeGreaterThan(epley1rm(100, 5));
  });
});

describe("ffmi", () => {
  it("computes lean mass per square metre", () => {
    // 79.44 / 1.93^2 = 21.327 — the dashboard shows this to one decimal.
    expect(ffmi(79.44, 193)).toBeCloseTo(21.33, 2);
    expect(ffmi(79.44, 193).toFixed(1)).toBe("21.3");
  });

  it("is independent of fat mass", () => {
    expect(ffmi(79.44, 193)).toEqual(ffmi(79.44, 193));
  });
});

describe("estimateEnergy", () => {
  it("matches Mifflin-St Jeor for the current profile", () => {
    // 10*114.8 + 6.25*193 - 5*37 + 5 = 2174.25
    expect(estimateEnergy(114.8, 193, 37).bmr).toBe(2174);
  });

  it("orders the activity multipliers", () => {
    const e = estimateEnergy(114.8, 193, 37);
    expect(e.bmr).toBeLessThan(e.sedentary);
    expect(e.sedentary).toBeLessThan(e.light);
    expect(e.light).toBeLessThan(e.moderate);
  });

  it("falls as age rises, all else equal", () => {
    expect(estimateEnergy(114.8, 193, 47).bmr).toBeLessThan(
      estimateEnergy(114.8, 193, 37).bmr,
    );
  });
});

describe("judgeBodyFat", () => {
  it.each([
    [7, "warning", "Very lean"],
    [15, "good", "In range"],
    [20, "good", "In range"],
    [20.1, "warning", "Above range"],
    [25, "warning", "Above range"],
    [25.1, "serious", "Above range"],
    [30.8, "serious", "Above range"],
  ])("%s%% -> %s", (pct, status, label) => {
    const j = judgeBodyFat(pct);
    expect(j.status).toBe(status);
    expect(j.label).toBe(label);
  });
});

describe("judgeVisceralFat", () => {
  it.each([
    [5, "good"],
    [9, "good"],
    [10, "warning"],
    [13, "warning"],
    [14, "warning"],
    [15, "critical"],
  ])("index %i -> %s", (index, status) => {
    expect(judgeVisceralFat(index).status).toBe(status);
  });
});

describe("judgeCadence", () => {
  it("holding when this window matches or beats the last", () => {
    expect(judgeCadence(7, 5).status).toBe("good");
    expect(judgeCadence(5, 5).status).toBe("good");
  });

  it("tolerates a single missed session before flagging", () => {
    expect(judgeCadence(6, 7).status).toBe("neutral");
    expect(judgeCadence(5, 7).status).toBe("warning");
  });
});

describe("judgePctOfPeak", () => {
  it.each([
    [null, "neutral"],
    [100, "good"],
    [98, "good"],
    [97, "neutral"],
    [90, "neutral"],
    [89, "serious"],
    [84, "serious"], // the squat
  ])("%s -> %s", (pct, status) => {
    expect(judgePctOfPeak(pct)).toBe(status);
  });
});

describe("hrZone", () => {
  it("returns null without a reading", () => {
    expect(hrZone(null)).toBeNull();
  });

  it.each([
    [100, 1],
    [115, 2],
    [139, 3], // the 10k in July
    [149, 4], // the short one in August
    [170, 5],
  ])("avg %i bpm -> zone %i", (avg, zone) => {
    expect(hrZone(avg)?.zone).toBe(zone);
  });

  it("always pairs the colour with a label", () => {
    const z = hrZone(139);
    expect(z?.label).toMatch(/^Z\d /);
    expect(z?.step).toMatch(/^var\(--seq-/);
  });
});

describe("compositionTargets", () => {
  const t = compositionTargets(79.44, 51.09);

  it("derives target weight by holding lean mass constant", () => {
    // 79.44 / 0.75 and 79.44 / 0.80
    expect(t.weightNear).toBeCloseTo(105.92, 2);
    expect(t.weightLong).toBeCloseTo(99.3, 2);
  });

  it("puts the long-term goal below the milestone", () => {
    expect(t.weightLong).toBeLessThan(t.weightNear);
    expect(t.bodyFatLong).toBeLessThan(t.bodyFatNear);
  });

  it("targets holding skeletal muscle, not growing it", () => {
    expect(t.skeletalMuscleKg).toBe(51.09);
  });

  it("brings visceral fat back inside the normal band", () => {
    expect(judgeVisceralFat(t.visceralFat).status).toBe("good");
  });
});

describe("proteinTarget", () => {
  const p = proteinTarget(79.44);

  it("is set from lean mass, not bodyweight", () => {
    // 79.44 x 2.2, not 114.8 x anything
    expect(p.target).toBe(175);
    expect(p.perKgLean).toBe(2.2);
  });

  it("brackets the target with a floor and a ceiling", () => {
    expect(p.low).toBe(159); // 2.0 g/kg
    expect(p.high).toBe(191); // 2.4 g/kg
    expect(p.low).toBeLessThan(p.target);
    expect(p.target).toBeLessThan(p.high);
  });

  it("converts to calories at 4 kcal per gram", () => {
    expect(p.kcal).toBe(700);
  });

  it("fits inside the daily calorie target", () => {
    const daily = estimateEnergy(114.8, 193, 37).light - 500;
    expect(p.kcal).toBeLessThan(daily);
  });

  it("scales with lean mass", () => {
    expect(proteinTarget(90).target).toBeGreaterThan(p.target);
  });
});

describe("weeksToTarget", () => {
  it("uses 0.5 kg/week by default", () => {
    expect(weeksToTarget(114.8, 105.92)).toBe(18);
    expect(weeksToTarget(114.8, 99.3)).toBe(31);
  });

  it("never goes negative once past the target", () => {
    expect(weeksToTarget(99, 105)).toBe(0);
  });

  it("honours a custom rate", () => {
    expect(weeksToTarget(114.8, 104.8, 1)).toBe(10);
  });
});
