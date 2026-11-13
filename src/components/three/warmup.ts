"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";

// Shader warm-up for the on-demand canvases.
//
// three.js compiles a material's program the first time it draws it and then blocks on the link status
// (getProgramInfoLog / getActiveUniform). On a cold GPU cache that is 50–230 ms per physical/clearcoat program —
// the hero and the TapStory each froze the page for ~1 s the first time they rendered. Instead, every canvas starts
// on frameloop="never": <WarmGate> waits for its content (environment, models), asks the driver to link every
// program in the background (KHR_parallel_shader_compile), polls until they are all linked, uploads the big
// textures and only then lets the canvas render. Without the extension the gate degrades to today's behaviour.

type Renderer = THREE.WebGLRenderer;
type ProgramLike = { isReady?: () => boolean; getUniforms?: () => unknown; getAttributes?: () => unknown };

/**
 * Resolves once every program the renderer created has finished linking (never blocks on a link), then reads each
 * program's uniform/attribute tables right away: those reads are synchronous GPU round-trips, cheap while the GPU
 * process is idle, but each one would otherwise wait behind the first frame's draw calls.
 */
export function programsReady(gl: Renderer, timeoutMs = 10000): Promise<void> {
  const start = performance.now();
  return new Promise((resolve) => {
    const check = () => {
      const programs = (gl.info.programs ?? []) as unknown as ProgramLike[];
      const pending = programs.some((p) => typeof p.isReady === "function" && !p.isReady());
      if (!pending || performance.now() - start > timeoutMs) {
        for (const p of programs) {
          try {
            p.getUniforms?.();
            p.getAttributes?.();
          } catch {
            /* a broken program reports itself on first use, as before */
          }
        }
        resolve();
      } else setTimeout(check, 24);
    };
    check();
  });
}

let scratchTarget: THREE.WebGLRenderTarget | null = null;
/** Runs `fn` with an off-screen target bound, so compile() builds the render-target variant of each program. */
export function withOffscreenTarget(gl: Renderer, fn: () => void, target?: THREE.WebGLRenderTarget) {
  const rt = target ?? (scratchTarget ??= new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType }));
  const prev = gl.getRenderTarget();
  const face = gl.getActiveCubeFace();
  const level = gl.getActiveMipmapLevel();
  gl.setRenderTarget(rt);
  try {
    fn();
  } finally {
    gl.setRenderTarget(prev, face, level);
  }
}

/**
 * Starts linking every program `root` needs — including objects that are hidden until later in a story (phone,
 * rings, star burst) — for the on-screen pass and, with `offscreen`, for render-target passes (reflections,
 * post-processing input). Returns immediately; await programsReady() for completion.
 */
export function compileScene(gl: Renderer, root: THREE.Object3D, camera: THREE.Camera, offscreen = false) {
  const hidden: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (!o.visible) {
      hidden.push(o);
      o.visible = true;
    }
  });
  try {
    const prev = gl.getRenderTarget();
    gl.setRenderTarget(null);
    gl.compile(root, camera);
    if (offscreen) withOffscreenTarget(gl, () => gl.compile(root, camera));
    // settle pass: some materials edit their own defines in onBeforeCompile (drei's reflector adds USE_UV), so the
    // program they really draw with only exists from their second compile on
    gl.compile(root, camera);
    gl.setRenderTarget(prev);
  } finally {
    for (const o of hidden) o.visible = false;
  }
}

type PmremInternals = {
  _setSize?: (size: number) => void;
  _allocateTargets?: () => THREE.WebGLRenderTarget;
  _compileMaterial?: (material: THREE.Material) => void;
  _cubemapMaterial?: THREE.Material | null;
  _ggxMaterial?: THREE.Material | null;
  _blurMaterial?: THREE.Material | null;
};

let positionOnly: THREE.BufferGeometry | null = null;
const flatCamera = new THREE.OrthographicCamera();

/**
 * Starts linking the PMREM programs (cube → cubeUV, GGX convolution, blur) for a `size` environment so that
 * pmrem.fromCubemap() does not stall. Uses the generator's own materials, so fromCubemap() reuses them as is. (three's
 * own compileCubemapShader() compiles against an empty geometry — a different program variant than the one its
 * position-only LOD planes use — so the materials are compiled here against a matching geometry instead.)
 */
export function compilePmrem(gl: Renderer, pmrem: THREE.PMREMGenerator, size: number) {
  const p = pmrem as unknown as PmremInternals;
  if (typeof p._setSize !== "function" || typeof p._allocateTargets !== "function") return;
  positionOnly ??= new THREE.BufferGeometry().setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(9), 3),
  );
  // create the cube → cubeUV material without three's (mismatched) compile: shadow the prototype method briefly
  p._compileMaterial = () => {};
  try {
    pmrem.compileCubemapShader();
  } finally {
    delete p._compileMaterial;
  }
  p._setSize(size);
  p._allocateTargets().dispose(); // creates the size-specific GGX / blur materials (kept for fromCubemap)
  const mesh = new THREE.Mesh(positionOnly);
  withOffscreenTarget(gl, () => {
    for (const m of [p._cubemapMaterial, p._ggxMaterial, p._blurMaterial]) {
      if (!m) continue;
      mesh.material = m;
      gl.compile(mesh, flatCamera);
    }
  });
}

type PassLike = {
  scene?: THREE.Scene | null;
  camera?: THREE.Camera | null;
  screen?: THREE.Mesh | null;
  fullscreenMaterial?: THREE.Material | null;
  effects?: unknown[];
};

const isMaterial = (v: unknown): v is THREE.Material =>
  !!v && typeof v === "object" && (v as THREE.Material).isMaterial === true;
const isPass = (v: unknown): v is PassLike =>
  !!v && typeof v === "object" && "fullscreenMaterial" in v && "screen" in (v as object);

/**
 * Starts linking the full-screen programs of a `postprocessing` EffectComposer (render pass input, bloom luminance,
 * mip-map blur down/up-sampling, merged effect material) in both target variants.
 */
export function compileComposer(gl: Renderer, composer: { passes?: unknown[] } | null | undefined) {
  if (!composer?.passes) return;
  const passes = new Set<PassLike>();
  const visit = (v: unknown, depth: number) => {
    if (depth > 2 || !v || typeof v !== "object") return;
    if (isPass(v)) {
      if (passes.has(v)) return;
      passes.add(v);
    }
    const effects = (v as PassLike).effects;
    for (const value of Object.values(v as object)) if (isPass(value)) visit(value, depth + 1);
    if (!Array.isArray(effects)) return;
    for (const e of effects) if (e && typeof e === "object") for (const value of Object.values(e)) visit(value, depth + 1);
  };
  for (const pass of composer.passes) visit(pass, 0);
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const geometry = [...passes].find((p) => p.screen)?.screen?.geometry;
  for (const pass of passes) {
    const materials = new Set<THREE.Material>();
    const current = pass.screen?.material;
    if (isMaterial(current)) materials.add(current);
    for (const value of Object.values(pass)) if (isMaterial(value)) materials.add(value);
    // passes that only create their screen at render time (mip-map blur) get a stand-in full-screen mesh
    const screen = pass.screen ?? (geometry ? new THREE.Mesh(geometry) : null);
    if (!screen) continue;
    const scene = pass.screen && pass.scene ? pass.scene : screen;
    const camera = pass.screen && pass.camera ? pass.camera : ortho;
    const original = screen.material;
    for (const m of materials) {
      screen.material = m;
      gl.compile(scene, camera);
      withOffscreenTarget(gl, () => gl.compile(scene, camera));
    }
    screen.material = original;
  }
}

// Components with GPU work the scene graph does not show (render-to-texture passes, private materials) register a
// warmer: the gate runs it right after the scene compile, so those programs link in the background too.
type Warmer = (gl: Renderer, scene: THREE.Scene) => void;
const warmers = new WeakMap<Renderer, Set<Warmer>>();

export function useWarmer(fn: Warmer) {
  const gl = useThree((s) => s.gl);
  const latest = useRef(fn);
  useEffect(() => {
    latest.current = fn;
  });
  useEffect(() => {
    let set = warmers.get(gl);
    if (!set) warmers.set(gl, (set = new Set()));
    const run: Warmer = (g, scene) => latest.current(g, scene);
    set.add(run);
    return () => {
      set.delete(run);
    };
  }, [gl]);
}

// One canvas warms at a time (hero first, then the TapStory) so their uploads and compiles never pile up.
let slot: Promise<void> = Promise.resolve();
function acquireWarmSlot(): Promise<() => void> {
  let release!: () => void;
  const mine = new Promise<void>((r) => (release = r));
  const ready = slot.then(() => release);
  // never hold the queue longer than 6 s, whatever happens to the canvas that owns the slot
  slot = Promise.race([mine, ready.then(() => new Promise<void>((r) => setTimeout(r, 6000)))]);
  return ready;
}

export type WarmGateProps = {
  /** True once the content to precompile is mounted (models parsed, environment baked…). Polled. */
  isReady: () => boolean;
  /** Also compile render-target variants (reflector / post-processing input). */
  offscreen?: boolean;
  /** Extra work before the gate opens: compile composer passes, upload textures… (runs after the scene compile). */
  prepare?: (gl: Renderer) => void;
  /** Called once everything is linked; the owner switches the canvas to frameloop="demand". */
  onWarm: () => void;
};

/** Mounted inside a <Canvas frameloop="never">: precompiles the scene off the main thread, then calls onWarm. */
export function WarmGate({ isReady, offscreen = false, prepare, onWarm }: WarmGateProps) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const latest = useRef({ isReady, prepare, onWarm });
  useEffect(() => {
    latest.current = { isReady, prepare, onWarm };
  });
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let release: (() => void) | null = null;
    const run = async () => {
      // wait for the content (models, environment) without blocking: poll every 50 ms, give up after 20 s
      const t0 = performance.now();
      while (alive && !latest.current.isReady() && performance.now() - t0 < 20000) {
        await new Promise<void>((r) => (timer = setTimeout(r, 50)));
      }
      if (!alive) return;
      release = await acquireWarmSlot();
      if (!alive) return release();
      try {
        compileScene(gl, scene, camera, offscreen);
        for (const warm of warmers.get(gl) ?? []) warm(gl, scene);
        latest.current.prepare?.(gl);
      } catch {
        /* precompiling is an optimisation only — the first frame compiles whatever is left */
      }
      await programsReady(gl);
      if (!alive) return release();
      latest.current.onWarm();
      // keep the slot until this canvas has drawn its first frame (or a second has passed)
      setTimeout(() => release?.(), 1000);
    };
    run();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      release?.();
    };
  }, [gl, scene, camera, offscreen]);
  return null;
}

/**
 * Mount once the gate has opened: draws one frame right away (even off-screen, so the canvas is already painted when
 * it scrolls in) and calls `onFrame` once that frame is on screen.
 */
export function FirstFrame({ onFrame }: { onFrame?: () => void }) {
  const invalidate = useThree((s) => s.invalidate);
  const frameloop = useThree((s) => s.frameloop);
  const done = useRef(false);
  const cb = useRef(onFrame);
  useEffect(() => {
    cb.current = onFrame;
  });
  useEffect(() => {
    if (frameloop !== "never") invalidate();
  }, [frameloop, invalidate]);
  useFrame(() => {
    if (done.current) return;
    done.current = true;
    requestAnimationFrame(() => cb.current?.());
  });
  return null;
}
