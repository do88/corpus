import { describe, expect, it } from "vitest";
import { regionOf, type ArmAxis } from "./body-regions";

// The axis the build script fits from the base mesh, rounded.
const arm: ArmAxis = { shoulder: [0.213, 0.535, -0.02], wrist: [0.47, 0.085, -0.01] };
const FRONT = [0, 0, 1] as const;
const BACK = [0, 0, -1] as const;

describe("regionOf", () => {
  it("tells the chest from the upper back by which way the skin faces", () => {
    expect(regionOf([0.1, 0.46, 0.09], FRONT, arm)).toBe("chest");
    expect(regionOf([0.1, 0.46, -0.14], BACK, arm)).toBe("upper_back");
  });

  it("mirrors the left side, normal and all", () => {
    expect(regionOf([-0.1, 0.46, 0.09], FRONT, arm)).toBe("chest");
    // Inner thigh: facing -x on the right leg, +x on the left.
    expect(regionOf([0.03, -0.2, 0], [-1, 0, 0], arm)).toBe("adductors");
    expect(regionOf([-0.03, -0.2, 0], [1, 0, 0], arm)).toBe("adductors");
  });

  it("splits the thigh into front, back and inside", () => {
    expect(regionOf([0.11, -0.25, 0.07], FRONT, arm)).toBe("quadriceps");
    expect(regionOf([0.11, -0.25, -0.09], BACK, arm)).toBe("hamstrings");
  });

  it("finds the arm along its own slanted line", () => {
    // A third of the way down the arm, on its front and its back.
    expect(regionOf([0.303, 0.378, 0.034], FRONT, arm)).toBe("biceps");
    expect(regionOf([0.303, 0.378, -0.066], BACK, arm)).toBe("triceps");
    expect(regionOf([0.406, 0.198, 0.03], FRONT, arm)).toBe("forearms");
  });

  it("leaves the head, hands, shins and feet bare", () => {
    expect(regionOf([0, 0.85, 0.1], FRONT, arm)).toBeNull();
    expect(regionOf([0.49, 0.0, 0], [1, 0, 0], arm)).toBeNull();
    expect(regionOf([0.12, -0.62, 0.03], FRONT, arm)).toBeNull();
    expect(regionOf([0.12, -0.88, 0.1], FRONT, arm)).toBeNull();
  });

  it("puts the calves on the back of the lower leg", () => {
    expect(regionOf([0.12, -0.62, -0.1], BACK, arm)).toBe("calves");
  });

  it("keeps the belly and the small of the back apart", () => {
    expect(regionOf([0.05, 0.2, 0.08], FRONT, arm)).toBe("abdominals");
    expect(regionOf([0.04, 0.18, -0.12], BACK, arm)).toBe("lower_back");
  });
});
