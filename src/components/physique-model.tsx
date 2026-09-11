"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import {
  CanvasTexture,
  CapsuleGeometry,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Scene,
  SphereGeometry,
  Vector3,
  WebGLRenderer,
  type BufferGeometry,
  type Material,
} from "three";
import { BODY_MUSCLES, FIGURE_HEIGHT, type BodyMuscle, type Physique } from "@/lib/training/physique";

/**
 * A figure that turns, with every muscle grown by how much it was trained.
 *
 * Built from primitives rather than loaded as a model: a neutral mannequin of
 * capsules, and on top of it one ellipsoid per muscle belly. Every muscle
 * obeys the same rule — an ellipsoid whose size is the number `physique.ts`
 * computed — so the figure is a chart with one mark type, not an illustration
 * someone has to trust. A sculpted anatomy mesh would look better and say
 * less: you cannot see a triceps shrink on a model whose triceps is a texture.
 *
 * Muscles thicken more than they lengthen. Each ellipsoid has a growth weight
 * per axis, so a trained biceps bulges forward instead of sliding down towards
 * the elbow, and trained lats widen the back into a V rather than stretching
 * the torso.
 *
 * ## Colour
 *
 * No hue of its own. Every colour in this app belongs to a metric, and sets
 * per muscle is not one of them, so the figure is drawn in the page's own ink
 * and card: the mannequin faint, each muscle closer to full ink the more it was
 * trained. Contrast scales with training, which doubles the size encoding in a
 * way that also survives being read at 300 pixels on a phone. Both come from
 * the CSS tokens at runtime, so dark mode is the same figure lit the other way
 * round rather than a second palette to keep in step.
 *
 * ## Movement
 *
 * A turntable, around the vertical axis only, because that is the rotation a
 * thumb understands. `touch-action: pan-y` hands vertical swipes to the page,
 * so the figure never traps a scroll — only a sideways drag turns it. It spins
 * slowly on its own when nobody is touching it, and not at all under reduced
 * motion, where drags and arrow keys still work and simply stop dead.
 *
 * It renders only while something is moving and the canvas is on screen. A
 * figure below the fold on a tab in the background draws nothing.
 */

type V3 = [number, number, number];

type Part = {
  muscle: BodyMuscle;
  /** Right-hand side; `mirror` adds the left. z is towards the viewer. */
  pos: V3;
  /** Resting radii. */
  radii: V3;
  /** How much each axis grows with training, 0 to 1. */
  grow: V3;
  rot?: V3;
  mirror?: boolean;
};

const ARM = 0.142; // shoulder to elbow leans out this far from vertical
const FOREARM = 0.077;

// Placed by eye and then corrected by looking: the first pass put the pecs so
// high and the deltoids so large that the two merged into one dark yoke across
// the top of the figure, and untrained traps stood up beside the neck like
// horns. A muscle has to read as itself at 300 pixels, or the size means
// nothing.
const PARTS: Part[] = [
  { muscle: "neck", pos: [0, 0.665, 0.01], radii: [0.05, 0.045, 0.05], grow: [1, 0.3, 1] },
  { muscle: "traps", pos: [0.095, 0.603, -0.025], radii: [0.068, 0.026, 0.045], grow: [0.6, 1, 0.8], rot: [0, 0, -0.32], mirror: true },
  { muscle: "shoulders", pos: [0.222, 0.525, 0], radii: [0.055, 0.052, 0.055], grow: [1, 0.7, 1], mirror: true },
  { muscle: "chest", pos: [0.068, 0.44, 0.088], radii: [0.068, 0.058, 0.045], grow: [0.6, 0.4, 1], mirror: true },
  { muscle: "lats", pos: [0.13, 0.36, -0.05], radii: [0.05, 0.12, 0.06], grow: [1, 0.4, 0.8], rot: [0, 0, -0.2], mirror: true },
  { muscle: "upper_back", pos: [0.07, 0.48, -0.085], radii: [0.07, 0.07, 0.04], grow: [0.6, 0.5, 1], mirror: true },
  { muscle: "lower_back", pos: [0.04, 0.22, -0.08], radii: [0.035, 0.08, 0.035], grow: [0.7, 0.3, 1], mirror: true },
  { muscle: "abdominals", pos: [0, 0.25, 0.085], radii: [0.07, 0.11, 0.035], grow: [0.5, 0.3, 1] },
  { muscle: "biceps", pos: [0.24, 0.38, 0.035], radii: [0.038, 0.085, 0.038], grow: [1, 0.3, 1], rot: [0, 0, ARM], mirror: true },
  { muscle: "triceps", pos: [0.245, 0.39, -0.035], radii: [0.04, 0.09, 0.04], grow: [1, 0.3, 1], rot: [0, 0, ARM], mirror: true },
  { muscle: "forearms", pos: [0.27, 0.11, 0.012], radii: [0.036, 0.09, 0.036], grow: [1, 0.3, 1], rot: [0, 0, FOREARM], mirror: true },
  { muscle: "glutes", pos: [0.075, 0.0, -0.075], radii: [0.075, 0.075, 0.06], grow: [0.8, 0.6, 1], mirror: true },
  { muscle: "abductors", pos: [0.14, 0.0, 0], radii: [0.035, 0.06, 0.05], grow: [1, 0.4, 0.7], mirror: true },
  { muscle: "adductors", pos: [0.045, -0.15, 0], radii: [0.035, 0.1, 0.045], grow: [1, 0.3, 0.8], mirror: true },
  { muscle: "quadriceps", pos: [0.09, -0.21, 0.035], radii: [0.06, 0.15, 0.05], grow: [0.8, 0.25, 1], mirror: true },
  { muscle: "hamstrings", pos: [0.09, -0.22, -0.035], radii: [0.055, 0.14, 0.048], grow: [0.8, 0.25, 1], mirror: true },
  { muscle: "calves", pos: [0.098, -0.58, -0.03], radii: [0.042, 0.1, 0.045], grow: [1, 0.3, 1], mirror: true },
];

/** The mannequin: capsules between joints, right side, mirrored. */
const BONES: { from: V3; to: V3; r: number; mirror?: boolean }[] = [
  { from: [0, 0.62, 0], to: [0, 0.7, 0], r: 0.045 }, // neck
  { from: [0.22, 0.52, 0], to: [0.26, 0.24, 0], r: 0.04, mirror: true }, // upper arm
  { from: [0.26, 0.24, 0], to: [0.28, -0.02, 0], r: 0.034, mirror: true }, // forearm
  { from: [0.085, -0.02, 0], to: [0.095, -0.44, 0], r: 0.06, mirror: true }, // thigh
  { from: [0.095, -0.44, 0], to: [0.1, -0.84, 0], r: 0.045, mirror: true }, // shin
];

/** Round shapes in the mannequin: head, torso, pelvis, hands, feet. */
const BLOBS: { pos: V3; radii: V3; mirror?: boolean }[] = [
  { pos: [0, 0.8, 0], radii: [0.11, 0.12, 0.11] }, // head
  { pos: [0, 0.42, 0], radii: [0.17, 0.2, 0.1] }, // ribcage
  { pos: [0, 0.18, 0], radii: [0.14, 0.14, 0.09] }, // waist
  { pos: [0, 0.02, 0], radii: [0.15, 0.09, 0.1] }, // pelvis
  { pos: [0.285, -0.06, 0], radii: [0.035, 0.045, 0.03], mirror: true }, // hand
  { pos: [0.1, -0.885, 0.03], radii: [0.037, 0.025, 0.075], mirror: true }, // foot
];

const AUTO_SPIN = 0.35; // rad/s
const IDLE_BEFORE_SPIN = 2500; // ms after the last touch

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    // Give the probe context back rather than leaving it for the collector:
    // browsers cap live contexts, and this one was only asked a question.
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return gl !== null;
  } catch {
    return false;
  }
}

/**
 * A CSS custom property as a three.js colour.
 *
 * Through a one-pixel canvas, because the tokens are `oklch()` and three
 * parses sRGB. The canvas is primed with a mid grey, so a value this browser
 * cannot parse leaves grey rather than black.
 */
function tokenColour(name: string): Color {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return new Color(0x888888);
  ctx.fillStyle = "#888888";
  ctx.fillStyle = value || "#888888";
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return new Color().setRGB(r / 255, g / 255, b / 255, SRGBColorSpace);
}

/** A soft oval under the feet: the contact shadow every card here has. */
function contactShadow(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, "rgba(0,0,0,1)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
  }
  return new CanvasTexture(canvas);
}

type Api = {
  setShape: (shape: Physique) => void;
  recolour: () => void;
  nudge: (radians: number) => void;
};

export function PhysiqueModel({ shape, label }: { shape: Physique; label: string }) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<Api | null>(null);
  const { resolvedTheme } = useTheme();
  // Decided once, on the client — this component never renders on a server.
  const [supported] = useState(hasWebGL);

  useEffect(() => {
    const el = host.current;
    if (!supported || !el) return;

    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ antialias: true, alpha: true });
    } catch (error) {
      console.warn("[physique] WebGL refused a context:", error);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.touchAction = "pan-y";
    el.appendChild(renderer.domElement);

    const scene = new Scene();
    const camera = new PerspectiveCamera(28, 1, 0.1, 10);
    camera.position.set(0, 0.05, 4.2);
    camera.lookAt(0, 0.01, 0);

    scene.add(new HemisphereLight(0xffffff, 0x555555, 1.6));
    const key = new DirectionalLight(0xffffff, 2.2);
    key.position.set(1.5, 2.5, 2.5);
    scene.add(key);
    const rim = new DirectionalLight(0xffffff, 1.0);
    rim.position.set(-2, 1.5, -2);
    scene.add(rim);

    const figure = new Group();
    scene.add(figure);

    const geometries: BufferGeometry[] = [];
    const materials: Material[] = [];
    const sphere = new SphereGeometry(1, 28, 20);
    geometries.push(sphere);

    const skin = new MeshStandardMaterial({ roughness: 0.9, metalness: 0 });
    materials.push(skin);

    const sides = (mirror?: boolean) => (mirror ? [1, -1] : [1]);
    const up = new Vector3(0, 1, 0);

    for (const bone of BONES) {
      for (const side of sides(bone.mirror)) {
        const a = new Vector3(bone.from[0] * side, bone.from[1], bone.from[2]);
        const b = new Vector3(bone.to[0] * side, bone.to[1], bone.to[2]);
        const geometry = new CapsuleGeometry(bone.r, a.distanceTo(b), 6, 16);
        geometries.push(geometry);
        const mesh = new Mesh(geometry, skin);
        mesh.position.copy(a).add(b).multiplyScalar(0.5);
        mesh.quaternion.copy(new Quaternion().setFromUnitVectors(up, b.clone().sub(a).normalize()));
        figure.add(mesh);
      }
    }
    for (const blob of BLOBS) {
      for (const side of sides(blob.mirror)) {
        const mesh = new Mesh(sphere, skin);
        mesh.position.set(blob.pos[0] * side, blob.pos[1], blob.pos[2]);
        mesh.scale.set(...blob.radii);
        figure.add(mesh);
      }
    }

    const muscleMaterial = {} as Record<BodyMuscle, MeshStandardMaterial>;
    for (const muscle of BODY_MUSCLES) {
      muscleMaterial[muscle] = new MeshStandardMaterial({ roughness: 0.75, metalness: 0 });
      materials.push(muscleMaterial[muscle]);
    }
    const muscleMeshes: { mesh: Mesh; part: Part }[] = [];
    for (const part of PARTS) {
      for (const side of sides(part.mirror)) {
        const mesh = new Mesh(sphere, muscleMaterial[part.muscle]);
        mesh.position.set(part.pos[0] * side, part.pos[1], part.pos[2]);
        if (part.rot) mesh.rotation.set(part.rot[0], part.rot[1] * side, part.rot[2] * side);
        figure.add(mesh);
        muscleMeshes.push({ mesh, part });
      }
    }

    const shadowTexture = contactShadow();
    const shadowMaterial = new MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false, color: 0x000000 });
    const shadowGeometry = new PlaneGeometry(0.75, 0.32);
    geometries.push(shadowGeometry);
    materials.push(shadowMaterial);
    const shadow = new Mesh(shadowGeometry, shadowMaterial);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -0.91;
    scene.add(shadow);

    // Every muscle starts at resting size and is grown to its trained size
    // by the first setShape, so the figure fills out as it appears.
    const current = {} as Record<BodyMuscle, { scale: number; share: number }>;
    const target = {} as Record<BodyMuscle, { scale: number; share: number }>;
    for (const muscle of BODY_MUSCLES) {
      current[muscle] = { scale: 1, share: 0 };
      target[muscle] = { scale: 1, share: 0 };
    }

    let palette = { card: tokenColour("--card"), ink: tokenColour("--foreground") };

    const paint = () => {
      skin.color.copy(palette.card).lerp(palette.ink, 0.2);
      for (const muscle of BODY_MUSCLES) {
        muscleMaterial[muscle].color.copy(palette.card).lerp(palette.ink, 0.38 + 0.52 * current[muscle].share);
      }
      const hsl = { h: 0, s: 0, l: 0 };
      palette.card.getHSL(hsl);
      shadowMaterial.opacity = hsl.l < 0.5 ? 0.5 : 0.2;
    };

    const size = () => {
      for (const { mesh, part } of muscleMeshes) {
        const s = current[part.muscle].scale;
        mesh.scale.set(
          part.radii[0] * (1 + (s - 1) * part.grow[0]),
          part.radii[1] * (1 + (s - 1) * part.grow[1]),
          part.radii[2] * (1 + (s - 1) * part.grow[2]),
        );
      }
    };

    size();
    paint();

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let angle = 0.35; // a three-quarter view shows front and side at once
    let velocity = 0; // rad/s
    let dragging = false;
    let lastX = 0;
    let lastMoveAt = 0;
    let lastTouch = -Infinity;
    let onScreen = false;
    let raf = 0;
    let last = 0;

    const settled = () =>
      BODY_MUSCLES.every(
        (m) => Math.abs(current[m].scale - target[m].scale) < 0.001 && Math.abs(current[m].share - target[m].share) < 0.001,
      );

    const frame = (now: number) => {
      raf = 0;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      let moving = false;

      if (dragging) {
        moving = true;
      } else if (Math.abs(velocity) > 0.05) {
        angle += velocity * dt;
        velocity *= Math.exp(-dt * 4);
        moving = true;
      } else {
        velocity = 0;
        if (!reducedMotion.matches && now - lastTouch > IDLE_BEFORE_SPIN) {
          angle += AUTO_SPIN * dt;
          moving = true;
        }
      }

      if (!settled()) {
        const k = reducedMotion.matches ? 1 : 1 - Math.exp(-dt * 5);
        for (const m of BODY_MUSCLES) {
          current[m].scale += (target[m].scale - current[m].scale) * k;
          current[m].share += (target[m].share - current[m].share) * k;
        }
        size();
        paint();
        moving = true;
      }

      figure.rotation.y = angle;
      renderer.render(scene, camera);

      if (moving && onScreen && document.visibilityState === "visible") {
        raf = requestAnimationFrame(frame);
      } else {
        last = 0; // so the next start does not see the whole pause as one frame
      }
    };
    const request = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };

    const resize = () => {
      const width = el.clientWidth || 1;
      renderer.setSize(width, FIGURE_HEIGHT);
      camera.aspect = width / FIGURE_HEIGHT;
      camera.updateProjectionMatrix();
      request();
    };
    const resizer = new ResizeObserver(resize);
    resizer.observe(el);
    resize();

    const watcher = new IntersectionObserver(([entry]) => {
      onScreen = entry?.isIntersecting ?? false;
      if (onScreen) request();
    });
    watcher.observe(el);

    const onVisibility = () => {
      if (document.visibilityState === "visible") request();
    };
    document.addEventListener("visibilitychange", onVisibility);
    reducedMotion.addEventListener("change", request);

    const onDown = (event: PointerEvent) => {
      dragging = true;
      velocity = 0;
      lastX = event.clientX;
      lastMoveAt = event.timeStamp;
      lastTouch = performance.now();
      el.setPointerCapture(event.pointerId);
      request();
    };
    const onMove = (event: PointerEvent) => {
      if (!dragging) return;
      const delta = (event.clientX - lastX) * 0.012;
      const elapsed = Math.max(1, event.timeStamp - lastMoveAt) / 1000;
      angle += delta;
      velocity = delta / elapsed;
      lastX = event.clientX;
      lastMoveAt = event.timeStamp;
      lastTouch = performance.now();
    };
    const onUp = (event: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      // A drag that stopped before letting go should not fling.
      if (event.timeStamp - lastMoveAt > 80) velocity = 0;
      if (reducedMotion.matches) velocity = 0;
      lastTouch = performance.now();
      request();
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);

    api.current = {
      setShape(shape) {
        for (const m of BODY_MUSCLES) target[m] = { scale: shape[m].scale, share: shape[m].share };
        request();
      },
      recolour() {
        palette = { card: tokenColour("--card"), ink: tokenColour("--foreground") };
        paint();
        request();
      },
      nudge(radians) {
        lastTouch = performance.now();
        if (reducedMotion.matches) angle += radians;
        else velocity += radians * 4;
        request();
      },
    };

    return () => {
      api.current = null;
      cancelAnimationFrame(raf);
      resizer.disconnect();
      watcher.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      reducedMotion.removeEventListener("change", request);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      shadowTexture.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [supported]);

  useEffect(() => {
    api.current?.setShape(shape);
  }, [shape]);

  useEffect(() => {
    api.current?.recolour();
  }, [resolvedTheme]);

  if (!supported) {
    return (
      <p className="rounded-2xl bg-muted/40 px-4 py-6 text-sm text-muted-foreground">
        This device cannot draw the 3D figure. The list below has the same numbers.
      </p>
    );
  }

  return (
    <div className="relative">
      <div
        ref={host}
        role="img"
        aria-label={label}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            api.current?.nudge(event.key === "ArrowLeft" ? -0.4 : 0.4);
          }
        }}
        style={{ height: FIGURE_HEIGHT, touchAction: "pan-y" }}
        className="w-full cursor-grab overflow-hidden rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
      />
      <span aria-hidden className="pointer-events-none absolute bottom-2 right-3 text-[11px] text-muted-foreground">
        Drag to turn
      </span>
    </div>
  );
}
