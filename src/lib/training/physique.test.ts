import { describe, expect, it } from "vitest";
import { MAX_SCALE, MIN_SCALE, describePhysique, offFigure, physique } from "./physique";

// The last twelve months as they actually are, trimmed.
const year = [
  { muscle: "chest", sets: 260 },
  { muscle: "lats", sets: 241 },
  { muscle: "quadriceps", sets: 209 },
  { muscle: "full_body", sets: 56 },
  { muscle: "chest_press_typo", sets: 3 },
  { muscle: "biceps", sets: 10 },
  { muscle: "triceps", sets: 0 },
];

describe("physique", () => {
  it("draws the most-trained muscle at the largest size and an untrained one at the smallest", () => {
    const shape = physique(year);
    expect(shape.chest.scale).toBe(MAX_SCALE);
    expect(shape.triceps.scale).toBe(MIN_SCALE);
    expect(shape.calves.scale).toBe(MIN_SCALE); // absent from the data entirely
  });

  it("scales the radius by the square root, so a quarter of the sets is half the extra size", () => {
    const shape = physique([
      { muscle: "chest", sets: 100 },
      { muscle: "glutes", sets: 25 },
    ]);
    expect(shape.glutes.scale).toBeCloseTo(MIN_SCALE + (MAX_SCALE - MIN_SCALE) / 2);
  });

  it("does not let full-body work set the scale for real muscles", () => {
    // A thousand sets of burpees must not shrink the chest.
    const withBurpees = physique([...year, { muscle: "full_body", sets: 1000 }]);
    expect(withBurpees.chest.scale).toBe(MAX_SCALE);
  });

  it("draws a resting figure, not NaN, when nothing has been logged", () => {
    const shape = physique([]);
    expect(shape.chest.scale).toBe(MIN_SCALE);
    expect(Number.isNaN(shape.chest.share)).toBe(false);
  });
});

describe("offFigure", () => {
  it("reports the rows that are not a place on a body, including ones Hevy may add later", () => {
    expect(offFigure(year).map((r) => r.muscle)).toEqual(["full_body", "chest_press_typo"]);
  });
});

describe("describePhysique", () => {
  it("names the largest muscles, skipping any that were never trained", () => {
    const { largest } = describePhysique(physique(year));
    expect(largest).toEqual(["chest", "lats", "quadriceps"]);
  });
});
