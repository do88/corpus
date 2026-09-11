import type { BodyMuscle } from "./physique";

/**
 * Which muscle a point on the body's surface sits over.
 *
 * The Body figure is a real base mesh — one continuous skin with no separate
 * muscles — so the muscles are painted onto it. This decides, for one vertex,
 * which of Hevy's groups it belongs to. `scripts/build-body-mesh.mts` runs it
 * over every vertex once and bakes the answer into the mesh file; none of it
 * runs in the browser.
 *
 * Position alone cannot tell a chest from an upper back: same height, same
 * distance from the midline. The surface normal can — one faces forward, the
 * other back. So each rule is a band of the body plus the direction the skin
 * has to face, which reads like a description of anatomy rather than a set of
 * ellipsoids nudged until they looked right.
 *
 * The arm is the exception, because in an A-pose it hangs at an angle no box
 * follows. It is found by distance from its own centre line, which the build
 * script fits from the mesh rather than trusting numbers typed here.
 *
 * Coordinates are the figure's frame: 1.8 tall from the soles at y = −0.9,
 * centred on x and z, +z towards the viewer. Every rule is written for the
 * right side and the left is its mirror, so each is written once.
 *
 * The seams are hard here on purpose. The build script blurs them across the
 * mesh afterwards, which is what turns a label per vertex into a muscle that
 * swells from its middle rather than a patch that lifts off in one piece.
 */

export type V3 = readonly [number, number, number];

/** The arm's centre line, shoulder to wrist, on the right side. */
export type ArmAxis = { shoulder: V3; wrist: V3 };

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Inside an axis-aligned ellipsoid. */
function within(p: V3, centre: V3, radii: V3): boolean {
  const d = sub(p, centre);
  return (d[0] / radii[0]) ** 2 + (d[1] / radii[1]) ** 2 + (d[2] / radii[2]) ** 2 <= 1;
}

export function regionOf(point: V3, normal: V3, arm: ArmAxis): BodyMuscle | null {
  // Mirrored into the right side: the position by |x|, the normal by
  // flipping its x so "facing outwards" means +x on both sides.
  const p: V3 = [Math.abs(point[0]), point[1], point[2]];
  const [x, y] = p;
  const nx = point[0] < 0 ? -normal[0] : normal[0];
  const [, ny, nz] = normal;

  // --- The arm, by distance from its centre line. t runs 0 at the shoulder
  // to 1 at the wrist.
  const axis = sub(arm.wrist, arm.shoulder);
  const t = dot(sub(p, arm.shoulder), axis) / dot(axis, axis);
  const along: V3 = [
    arm.shoulder[0] + axis[0] * t,
    arm.shoulder[1] + axis[1] * t,
    arm.shoulder[2] + axis[2] * t,
  ];
  const dist = Math.hypot(...sub(p, along));
  // Beyond the wrist is the hand, which is not a muscle group.
  if (t > 1.02 && dist < 0.12) return null;
  // Thicker at the shoulder than the wrist.
  const radius = 0.078 - 0.018 * Math.min(1, Math.max(0, t));
  if (t > 0.1 && t <= 1.02 && dist < radius) {
    if (t < 0.2) return "shoulders";
    // The arm hangs in the x–y plane, so its front is simply +z.
    if (t < 0.52) return nz >= 0 ? "biceps" : "triceps";
    return "forearms";
  }

  // --- The shoulder cap, above where the arm's line begins.
  if (x > 0.15 && within(p, [0.2, 0.505, -0.01], [0.07, 0.075, 0.08])) return "shoulders";

  // --- Head, neck, and the slope of the traps down to the shoulder.
  if (y > 0.735) return null;
  if (y > 0.63 && x < 0.085) return nz < -0.35 ? "traps" : "neck";
  if (y > 0.54 && y <= 0.68 && x < 0.2 && (ny > 0.35 || nz < -0.25)) return "traps";

  // --- The torso, above the hips.
  if (y > 0.08 && x < 0.21) {
    const front = nz > 0.25;
    const back = nz < -0.25;
    if (front) {
      if (y > 0.56) return null; // collarbones
      if (y >= 0.36) return "chest";
      return "abdominals";
    }
    if (back) {
      if (y > 0.4 && y <= 0.55) return x < 0.15 ? "upper_back" : "lats";
      if (y >= 0.3) return "lats";
      if (x < 0.09) return "lower_back";
      return y >= 0.22 ? "lats" : null;
    }
    // The flanks: lats high, the obliques under them, and Hevy files
    // obliques with the abdominals.
    if (y >= 0.47) return null; // armpit
    return y >= 0.27 ? "lats" : "abdominals";
  }

  // --- Hips: glutes behind, the abductors on the outside of the hip.
  if (y > -0.13 && y <= 0.08 && x < 0.22) {
    if (nz < -0.1) return "glutes";
    if (y > -0.05) {
      if (nx > 0.45) return "abductors";
      if (nx < -0.35) return "adductors";
      return null; // the front of the pelvis
    }
  }

  // --- Thigh.
  if (y > -0.44 && y <= 0.08 && x < 0.26) {
    if (nx < -0.35) return "adductors";
    if (nz < -0.05) return "hamstrings";
    return "quadriceps";
  }

  // --- Knee, then the lower leg: calves behind and to the sides, the shin
  // bare because the muscle down its front is not a group Hevy tracks.
  if (y > -0.52) return null;
  if (y > -0.8 && x < 0.26) return nz < 0.15 ? "calves" : null;
  return null; // feet
}
