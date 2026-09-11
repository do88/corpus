/**
 * Build the Body figure's mesh from a base-mesh OBJ.
 *
 *     pnpm build:body-mesh ~/Downloads/FinalBaseMesh.obj
 *
 * Writes `public/models/body.bin` (layout in `lib/training/body-mesh.ts`).
 * Run once; the output is committed and the OBJ is not.
 *
 * Four steps, and the order is the design:
 *
 * 1. **Normalise** into the figure's frame: 1.8 tall, soles at y = −0.9,
 *    centred on x and z. Everything downstream is written in that frame, so a
 *    different base mesh only has to be a standing human in an A- or T-pose.
 * 2. **Fit the arm's centre line** from the vertices that can only be arm —
 *    well out from the torso, between armpit and wrist — rather than typing
 *    in coordinates that fit one mesh and silently miss the next.
 * 3. **Label** every vertex with `regionOf`: a hard answer, one muscle or
 *    none.
 * 4. **Blur the labels across the mesh.** A hard label per vertex paints
 *    patches with cut edges, and a patch pushed outward lifts off the body in
 *    one piece like a plate. Averaging each vertex with its neighbours a few
 *    times turns the edge into a gradient, so a muscle swells from its middle
 *    and fades into the skin around it — for colour and for shape at once.
 *
 * Each vertex keeps its three strongest muscles. After the blur almost none
 * has more than two, and three covers the corners where a seam meets a seam.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { BODY_MUSCLES } from "@/lib/training/physique";
import { regionOf, type ArmAxis, type V3 } from "@/lib/training/body-regions";
import { NO_MUSCLE, SLOTS, encodeBodyMesh } from "@/lib/training/body-mesh";

// Fourteen, not eight. At eight the quads ended in a hard line at the hip and
// the knee and read as a pair of padded shorts; the blur has to be wider than
// the bulge is tall before a swelling looks like muscle rather than a pad.
const BLUR_PASSES = 14;
const OUT = resolve(import.meta.dirname, "../public/models/body.bin");

const source = process.argv[2];
if (!source) {
  console.error("usage: pnpm build:body-mesh <base-mesh.obj>");
  process.exit(1);
}

// ------------------------------------------------------------------ parse
const raw: number[] = [];
const faces: number[][] = [];
for (const line of readFileSync(source, "utf8").split("\n")) {
  if (line.startsWith("v ")) {
    const [x, y, z] = line.trim().split(/\s+/).slice(1, 4).map(Number);
    raw.push(x, y, z);
  } else if (line.startsWith("f ")) {
    faces.push(line.trim().split(/\s+/).slice(1).map((corner) => Number(corner.split("/")[0]) - 1));
  }
}
const V = raw.length / 3;
if (V > 65535) throw new Error(`${V} vertices will not fit 16-bit indices; decimate the mesh first`);

// -------------------------------------------------------------- normalise
let [x0, y0, z0, x1, y1, z1] = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
for (let i = 0; i < V; i++) {
  x0 = Math.min(x0, raw[i * 3]); x1 = Math.max(x1, raw[i * 3]);
  y0 = Math.min(y0, raw[i * 3 + 1]); y1 = Math.max(y1, raw[i * 3 + 1]);
  z0 = Math.min(z0, raw[i * 3 + 2]); z1 = Math.max(z1, raw[i * 3 + 2]);
}
const scale = 1.8 / (y1 - y0);
const positions = new Float32Array(V * 3);
for (let i = 0; i < V; i++) {
  positions[i * 3] = (raw[i * 3] - (x0 + x1) / 2) * scale;
  positions[i * 3 + 1] = (raw[i * 3 + 1] - y0) * scale - 0.9;
  positions[i * 3 + 2] = (raw[i * 3 + 2] - (z0 + z1) / 2) * scale;
}

// ------------------------------------------------ triangles and neighbours
const triangles: number[] = [];
for (const face of faces) {
  for (let k = 1; k + 1 < face.length; k++) triangles.push(face[0], face[k], face[k + 1]);
}
const neighbours: Set<number>[] = Array.from({ length: V }, () => new Set());
for (let t = 0; t < triangles.length; t += 3) {
  const [a, b, c] = [triangles[t], triangles[t + 1], triangles[t + 2]];
  neighbours[a].add(b).add(c);
  neighbours[b].add(a).add(c);
  neighbours[c].add(a).add(b);
}

// Area-weighted vertex normals, rather than the file's: the file's are
// whatever the exporter wrote, and the labels depend on them.
const normals = new Float32Array(V * 3);
for (let t = 0; t < triangles.length; t += 3) {
  const [a, b, c] = [triangles[t], triangles[t + 1], triangles[t + 2]];
  const e1 = [0, 1, 2].map((k) => positions[b * 3 + k] - positions[a * 3 + k]);
  const e2 = [0, 1, 2].map((k) => positions[c * 3 + k] - positions[a * 3 + k]);
  const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  for (const v of [a, b, c]) for (let k = 0; k < 3; k++) normals[v * 3 + k] += n[k];
}
for (let i = 0; i < V; i++) {
  const len = Math.hypot(normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]) || 1;
  for (let k = 0; k < 3; k++) normals[i * 3 + k] /= len;
}

// ----------------------------------------------------------- the arm line
// Vertices well out from the torso and between armpit and wrist can only be
// arm. Their principal direction is the arm; their centroid is on it.
const armPoints: V3[] = [];
for (let i = 0; i < V; i++) {
  const [x, y, z] = [Math.abs(positions[i * 3]), positions[i * 3 + 1], positions[i * 3 + 2]];
  if (x > 0.27 && y > 0.12 && y < 0.42) armPoints.push([x, y, z]);
}
if (armPoints.length < 100) throw new Error("could not find the arms — is this an A- or T-pose?");
const centroid = [0, 1, 2].map((k) => armPoints.reduce((sum, p) => sum + p[k], 0) / armPoints.length);
const cov = [0, 1, 2].map((r) =>
  [0, 1, 2].map((c) => armPoints.reduce((sum, p) => sum + (p[r] - centroid[r]) * (p[c] - centroid[c]), 0)),
);
let dir = [0.5, -1, 0];
for (let k = 0; k < 50; k++) {
  const next = cov.map((row) => row[0] * dir[0] + row[1] * dir[1] + row[2] * dir[2]);
  const len = Math.hypot(...next);
  dir = next.map((n) => n / len);
}
const atHeight = (y: number): V3 => {
  const t = (y - centroid[1]) / dir[1];
  return [centroid[0] + dir[0] * t, y, centroid[2] + dir[2] * t];
};
const arm: ArmAxis = { shoulder: atHeight(0.535), wrist: atHeight(0.085) };
console.log(
  `arm line     shoulder ${arm.shoulder.map((n) => n.toFixed(3)).join(", ")}  wrist ${arm.wrist.map((n) => n.toFixed(3)).join(", ")}`,
);

// ------------------------------------------------------------------ label
const M = BODY_MUSCLES.length;
const C = M + 1; // the last channel is bare skin
let channels = new Float32Array(V * C);
const labelled = new Array<number>(C).fill(0);
for (let i = 0; i < V; i++) {
  const muscle = regionOf(
    [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]],
    [normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]],
    arm,
  );
  const channel = muscle === null ? M : BODY_MUSCLES.indexOf(muscle);
  channels[i * C + channel] = 1;
  labelled[channel]++;
}

// ------------------------------------------------------------------- blur
for (let pass = 0; pass < BLUR_PASSES; pass++) {
  const next = new Float32Array(V * C);
  for (let i = 0; i < V; i++) {
    const around = neighbours[i];
    for (let c = 0; c < C; c++) {
      let sum = 0;
      for (const j of around) sum += channels[j * C + c];
      next[i * C + c] = 0.5 * channels[i * C + c] + (around.size ? (0.5 * sum) / around.size : 0.5 * channels[i * C + c]);
    }
  }
  channels = next;
}

// -------------------------------------------------- the three strongest
const muscles = new Uint8Array(V * SLOTS).fill(NO_MUSCLE);
const weights = new Uint8Array(V * SLOTS);
for (let i = 0; i < V; i++) {
  const ranked = Array.from({ length: M }, (_, m) => ({ m, w: channels[i * C + m] }))
    .filter((entry) => entry.w > 0.02)
    .sort((a, b) => b.w - a.w)
    .slice(0, SLOTS);
  ranked.forEach((entry, k) => {
    muscles[i * SLOTS + k] = entry.m;
    weights[i * SLOTS + k] = Math.round(Math.min(1, entry.w) * 255);
  });
}

const buffer = encodeBodyMesh(
  { vertexCount: V, positions, indices: new Uint16Array(triangles), muscles, weights },
  M,
);
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, Buffer.from(buffer));

console.log(`mesh         ${V} vertices, ${triangles.length / 3} triangles`);
console.log(`labelled     ${BODY_MUSCLES.map((m, i) => `${m} ${labelled[i]}`).join(", ")}, skin ${labelled[M]}`);
console.log(`wrote        ${OUT} (${(buffer.byteLength / 1024).toFixed(0)} KB)`);
