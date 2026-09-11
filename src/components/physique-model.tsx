"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  SRGBColorSpace,
  Scene,
  WebGLRenderer,
} from "three";
import { BODY_MUSCLES, FIGURE_HEIGHT, type BodyMuscle, type Physique } from "@/lib/training/physique";
import { BODY_MESH_URL, NO_MUSCLE, SLOTS, decodeBodyMesh, type BodyMesh } from "@/lib/training/body-mesh";

/**
 * A figure that turns, with every muscle grown and warmed by how much it was
 * trained.
 *
 * A real body, not a mannequin of primitives. It is one continuous base mesh,
 * and the muscles are painted onto it: `scripts/build-body-mesh.mts` decided
 * once which muscles each vertex sits over and how much, and baked that into
 * the file this loads. Here every vertex is pushed out along its own normal
 * by its muscles' growth and tinted by their share of the sets — so a trained
 * chest swells out of the torso rather than an ellipsoid being stuck on top of
 * one, and the figure stays a chart with one encoding rather than becoming an
 * illustration someone has to trust.
 *
 * It replaced ellipsoids on capsules, which said the same thing and looked
 * like a molecule model. The cortical homunculus was the brief: a recognisable
 * person with the proportions of the data, pushed far enough that nobody
 * mistakes them for an accident.
 *
 * ## Colour
 *
 * Grey skin, and each muscle warmed from a darker grey through the energy
 * amber to red by its share of the sets. The warm end is borrowed from the
 * heat maps every gym app draws, which is the reading anyone will reach for,
 * and the colour doubles the size encoding in a way that survives 300 pixels
 * on a phone. Every stop is a CSS token read at runtime, so dark mode is the
 * same figure rather than a second palette to keep in step.
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

/**
 * How far each muscle pushes out at full growth, in the figure's units (1.8
 * tall), per unit of scale above resting. Roughly its thickness in life: the
 * big sheets of chest, quads and glutes can swell further than a forearm
 * before they stop looking like the same body part.
 */
const BULGE: Record<BodyMuscle, number> = {
  neck: 0.03,
  traps: 0.045,
  shoulders: 0.06,
  chest: 0.06,
  lats: 0.05,
  upper_back: 0.04,
  lower_back: 0.03,
  abdominals: 0.035,
  biceps: 0.045,
  triceps: 0.045,
  forearms: 0.03,
  glutes: 0.055,
  abductors: 0.035,
  adductors: 0.04,
  quadriceps: 0.06,
  hamstrings: 0.05,
  calves: 0.045,
};

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

/** The loaded body, and the arrays rewritten each time its shape changes. */
type Body = {
  mesh: BodyMesh;
  geometry: BufferGeometry;
  position: Float32Array;
  colour: Float32Array;
  /** Normals of the mesh at rest: growth pushes along these, not the live ones. */
  restNormal: Float32Array;
};

export function PhysiqueModel({ shape, label }: { shape: Physique; label: string }) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<Api | null>(null);
  const { resolvedTheme } = useTheme();
  // Decided once, on the client — this component never renders on a server.
  const [supported] = useState(hasWebGL);
  const [failed, setFailed] = useState(false);

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

    scene.add(new HemisphereLight(0xffffff, 0x555555, 1.5));
    const key = new DirectionalLight(0xffffff, 2.3);
    key.position.set(1.5, 2.5, 2.5);
    scene.add(key);
    const rim = new DirectionalLight(0xffffff, 1.1);
    rim.position.set(-2, 1.5, -2);
    scene.add(rim);

    const figure = new Group();
    scene.add(figure);

    const material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0 });

    const shadowTexture = contactShadow();
    const shadowMaterial = new MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false, color: 0x000000 });
    const shadowGeometry = new PlaneGeometry(0.75, 0.32);
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

    const readPalette = () => ({
      card: tokenColour("--card"),
      ink: tokenColour("--foreground"),
      warm: tokenColour("--accent-energy"),
      hot: tokenColour("--destructive"),
    });
    let palette = readPalette();

    // Per-muscle push and colour, worked out once per frame rather than once
    // per vertex.
    const M = BODY_MUSCLES.length;
    const push = new Float32Array(M);
    const tint = new Float32Array(M * 3);
    const scratch = new Color();
    const skin = new Color();

    /** Darker grey at no sets, through amber at half the top muscle, to red. */
    const heat = (share: number, out: Color) => {
      if (share <= 0.5) return out.copy(palette.card).lerp(palette.ink, 0.34).lerp(palette.warm, share * 2);
      return out.copy(palette.warm).lerp(palette.hot, (share - 0.5) * 2);
    };

    let body: Body | null = null;

    const apply = () => {
      if (!body) return;
      const { mesh, geometry, position, colour, restNormal } = body;
      for (let m = 0; m < M; m++) {
        const muscle = BODY_MUSCLES[m];
        push[m] = BULGE[muscle] * (current[muscle].scale - 1);
        heat(current[muscle].share, scratch);
        tint[m * 3] = scratch.r;
        tint[m * 3 + 1] = scratch.g;
        tint[m * 3 + 2] = scratch.b;
      }
      skin.copy(palette.card).lerp(palette.ink, 0.16);

      const rest = mesh.positions;
      for (let v = 0; v < mesh.vertexCount; v++) {
        let out = 0;
        let covered = 0;
        let r = 0;
        let g = 0;
        let b = 0;
        for (let k = 0; k < SLOTS; k++) {
          const m = mesh.muscles[v * SLOTS + k];
          if (m === NO_MUSCLE) break;
          const w = mesh.weights[v * SLOTS + k] / 255;
          out += w * push[m];
          covered += w;
          r += w * tint[m * 3];
          g += w * tint[m * 3 + 1];
          b += w * tint[m * 3 + 2];
        }
        const bare = Math.max(0, 1 - covered);
        const i = v * 3;
        colour[i] = r + bare * skin.r;
        colour[i + 1] = g + bare * skin.g;
        colour[i + 2] = b + bare * skin.b;
        position[i] = rest[i] + restNormal[i] * out;
        position[i + 1] = rest[i + 1] + restNormal[i + 1] * out;
        position[i + 2] = rest[i + 2] + restNormal[i + 2] * out;
      }
      geometry.getAttribute("position").needsUpdate = true;
      geometry.getAttribute("color").needsUpdate = true;
      geometry.computeVertexNormals();

      const hsl = { h: 0, s: 0, l: 0 };
      palette.card.getHSL(hsl);
      shadowMaterial.opacity = hsl.l < 0.5 ? 0.5 : 0.2;
    };

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

      // Growth waits for the mesh: easing towards a shape nobody can see
      // would have it arrive already grown.
      if (body && !settled()) {
        const k = reducedMotion.matches ? 1 : 1 - Math.exp(-dt * 5);
        for (const m of BODY_MUSCLES) {
          current[m].scale += (target[m].scale - current[m].scale) * k;
          current[m].share += (target[m].share - current[m].share) * k;
        }
        apply();
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

    // The mesh is fetched rather than bundled: 600 KB that only this card
    // needs, cached by the browser like any other file after the first view.
    let disposed = false;
    fetch(BODY_MESH_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`${response.status} fetching the body mesh`);
        return response.arrayBuffer();
      })
      .then((buffer) => {
        if (disposed) return;
        const mesh = decodeBodyMesh(buffer, BODY_MUSCLES.length);
        const geometry = new BufferGeometry();
        const position = new Float32Array(mesh.positions);
        geometry.setAttribute("position", new BufferAttribute(position, 3));
        geometry.setIndex(new BufferAttribute(mesh.indices, 1));
        geometry.computeVertexNormals();
        const restNormal = new Float32Array(geometry.getAttribute("normal").array);
        const colour = new Float32Array(mesh.vertexCount * 3);
        geometry.setAttribute("color", new BufferAttribute(colour, 3));
        figure.add(new Mesh(geometry, material));
        body = { mesh, geometry, position, colour, restNormal };
        apply();
        request();
      })
      .catch((error) => {
        if (disposed) return;
        console.warn("[physique] could not load the body mesh:", error);
        setFailed(true);
      });

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
        palette = readPalette();
        apply();
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
      disposed = true;
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
      body?.geometry.dispose();
      material.dispose();
      shadowGeometry.dispose();
      shadowMaterial.dispose();
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

  if (!supported || failed) {
    return (
      <p className="rounded-2xl bg-muted/40 px-4 py-6 text-sm text-muted-foreground">
        {failed
          ? "The figure did not load. The list below has the same numbers."
          : "This device cannot draw the 3D figure. The list below has the same numbers."}
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
