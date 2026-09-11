import { describe, expect, it } from "vitest";
import { NO_MUSCLE, SLOTS, decodeBodyMesh, encodeBodyMesh, type BodyMesh } from "./body-mesh";

// Three vertices and one triangle: an odd count everywhere, so every section
// needs padding to its four-byte boundary.
const mesh: BodyMesh = {
  vertexCount: 3,
  positions: new Float32Array([0.1, -0.9, 0.05, -0.5, 0.9, -0.16, 0.25, 0, 0]),
  indices: new Uint16Array([0, 1, 2]),
  muscles: new Uint8Array([3, 7, NO_MUSCLE, 0, NO_MUSCLE, NO_MUSCLE, 16, 15, 14]),
  weights: new Uint8Array([200, 55, 0, 255, 0, 0, 90, 80, 70]),
};

describe("the body mesh file", () => {
  it("reads back what was written, positions to within the quantisation step", () => {
    const back = decodeBodyMesh(encodeBodyMesh(mesh, 17), 17);
    expect(back.vertexCount).toBe(3);
    expect(Array.from(back.indices)).toEqual([0, 1, 2]);
    expect(Array.from(back.muscles)).toEqual(Array.from(mesh.muscles));
    expect(Array.from(back.weights)).toEqual(Array.from(mesh.weights));
    expect(back.muscles.length).toBe(3 * SLOTS);
    back.positions.forEach((value, i) => expect(Math.abs(value - mesh.positions[i])).toBeLessThan(1 / 32767));
  });

  it("refuses a file built against a different list of muscles", () => {
    // Otherwise the numbers would index the wrong muscles and the figure
    // would be painted wrong without a word.
    expect(() => decodeBodyMesh(encodeBodyMesh(mesh, 17), 18)).toThrow(/rebuild/);
  });

  it("refuses something that is not a body mesh", () => {
    expect(() => decodeBodyMesh(new ArrayBuffer(32), 17)).toThrow(/not a body mesh/);
  });
});
