/**
 * The Body figure's mesh file: its layout, written and read in one place.
 *
 * `scripts/build-body-mesh.mts` writes it once from a base-mesh OBJ, and the
 * figure fetches it. Keeping both halves here means the layout cannot drift
 * between the two — the round-trip test is the whole contract.
 *
 * A bespoke binary rather than glTF. The figure needs four arrays and nothing
 * else — positions, triangles, and for each vertex the muscles it sits over
 * and how much — and a glTF loader would be a second three.js add-on on a
 * page that already pays for three.js, to read those same four arrays out of
 * a more general container. Positions are quantised to 16 bits, which at 1.8
 * units tall is a fiftieth of a millimetre in life-size terms and halves the
 * largest array.
 *
 * The muscle numbers are indices into `BODY_MUSCLES`. Reordering that list
 * would silently repaint the figure, so the count is stored and checked, and
 * `BODY_MUSCLES` says so beside it.
 */

// Versioned, and the version is not decoration. Until the proxy excluded
// `.bin`, this file answered a request without a session by redirecting to
// /login — and a service worker that precached it in that state would hold the
// sign-in page under this name, keyed by a content hash that never changes
// because the mesh itself never did. The query steps past any such copy; the
// precache ignores only tracking parameters, so `?v=` is a different request.
// Bump it whenever the mesh is rebuilt.
export const BODY_MESH_URL = "/models/body.bin?v=2";

/** Muscles recorded per vertex. A vertex on a seam can sit over three. */
export const SLOTS = 3;
/** An empty slot. */
export const NO_MUSCLE = 255;

const MAGIC = 0x31594442; // "BDY1", little-endian
const HEADER = 16;

export type BodyMesh = {
  vertexCount: number;
  /** x, y, z per vertex, in the figure's frame (1.8 tall, soles at −0.9). */
  positions: Float32Array;
  /** Three per triangle. */
  indices: Uint16Array;
  /** SLOTS per vertex: an index into BODY_MUSCLES, or NO_MUSCLE. */
  muscles: Uint8Array;
  /** SLOTS per vertex, 0–255 for 0–1. The rest of the vertex is skin. */
  weights: Uint8Array;
};

const aligned = (n: number) => Math.ceil(n / 4) * 4;

export function encodeBodyMesh(mesh: BodyMesh, muscleCount: number): ArrayBuffer {
  const v = mesh.vertexCount;
  const positionBytes = aligned(v * 3 * 2);
  const indexBytes = aligned(mesh.indices.length * 2);
  const slotBytes = aligned(v * SLOTS);
  const buffer = new ArrayBuffer(HEADER + positionBytes + indexBytes + 2 * slotBytes);
  const view = new DataView(buffer);
  view.setUint32(0, MAGIC, true);
  view.setUint32(4, v, true);
  view.setUint32(8, mesh.indices.length, true);
  view.setUint32(12, muscleCount, true);

  let offset = HEADER;
  const quantised = new Int16Array(buffer, offset, v * 3);
  for (let i = 0; i < v * 3; i++) {
    quantised[i] = Math.round(Math.max(-1, Math.min(1, mesh.positions[i])) * 32767);
  }
  offset += positionBytes;
  new Uint16Array(buffer, offset, mesh.indices.length).set(mesh.indices);
  offset += indexBytes;
  new Uint8Array(buffer, offset, v * SLOTS).set(mesh.muscles);
  offset += slotBytes;
  new Uint8Array(buffer, offset, v * SLOTS).set(mesh.weights);
  return buffer;
}

export function decodeBodyMesh(buffer: ArrayBuffer, muscleCount: number): BodyMesh {
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== MAGIC) throw new Error("not a body mesh");
  const v = view.getUint32(4, true);
  const indexCount = view.getUint32(8, true);
  const stored = view.getUint32(12, true);
  if (stored !== muscleCount) {
    throw new Error(`body mesh was built for ${stored} muscles, this build has ${muscleCount} — rebuild it`);
  }

  let offset = HEADER;
  const quantised = new Int16Array(buffer, offset, v * 3);
  const positions = new Float32Array(v * 3);
  for (let i = 0; i < v * 3; i++) positions[i] = quantised[i] / 32767;
  offset += aligned(v * 3 * 2);
  const indices = new Uint16Array(buffer, offset, indexCount);
  offset += aligned(indexCount * 2);
  const muscles = new Uint8Array(buffer, offset, v * SLOTS);
  offset += aligned(v * SLOTS);
  const weights = new Uint8Array(buffer, offset, v * SLOTS);
  return { vertexCount: v, positions, indices, muscles, weights };
}
