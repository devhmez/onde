"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";
import { HorizontalBlurShader } from "three/examples/jsm/shaders/HorizontalBlurShader.js";
import { VerticalBlurShader } from "three/examples/jsm/shaders/VerticalBlurShader.js";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { COLORS } from "./config";
import { compilePmrem, programsReady, useWarmer, withOffscreenTarget } from "./warmup";

// ---------------------------------------------------------------------------------------------------------------
// Environment: a custom Lightformer rig rendered once into a cube map (no external HDRI is ever fetched).
//
// Same rig and result as drei's <Environment frames={1}><Lightformer …/></Environment> (256² half-float cube camera at
// the origin, unlit double-sided light cards facing the centre, colour × intensity, PMREM-filtered by three), but
// baked without stalling: the card and PMREM programs are linked in the background first (warmup.ts), then the cube
// is rendered and converted once. scene.environment stays null until then — <WarmGate> waits for it.
// ---------------------------------------------------------------------------------------------------------------

type LightCard = {
  form: "rect" | "ring";
  color: THREE.ColorRepresentation;
  intensity: number;
  position: [number, number, number];
  scale: number | [number, number, number];
};

function studioRig(mood: "violet" | "studio"): LightCard[] {
  const violet = mood === "violet";
  return [
    // big top softbox — long highlights on acrylic and glass
    { form: "rect", intensity: violet ? 1.6 : 2.2, color: "#ffffff", position: [0, 6, 1], scale: [12, 4, 1] },
    // front-left key strip
    { form: "rect", intensity: violet ? 1.2 : 1.8, color: "#f4f2ff", position: [-6, 1.5, 4], scale: [3, 7, 1] },
    // right violet strip — the signature rim on acrylic edges
    {
      form: "rect",
      intensity: violet ? 3.2 : 1.6,
      color: COLORS.violet2,
      position: [6, 1, -1],
      scale: violet ? [2.2, 7, 1] : [0.7, 6, 1],
    },
    // violet ring behind the subject
    { form: "ring", intensity: violet ? 4.5 : 1.2, color: COLORS.violet, position: [0, 2, -7], scale: violet ? 6 : 4 },
    // thin cool kicker from the back-left
    { form: "rect", intensity: 1.4, color: "#c9d6ff", position: [-5, 3, -5], scale: [1, 6, 1] },
    // warm bokeh-coloured bounce from below-front
    { form: "rect", intensity: violet ? 0.35 : 0.5, color: COLORS.gold, position: [0, -4, 4], scale: [8, 2, 1] },
  ];
}

/** The light cards as a standalone scene (identical to drei's Lightformer: plane 1×1 / ring 0.25–0.5, lookAt origin). */
function buildStudio(mood: "violet" | "studio"): THREE.Scene {
  const studio = new THREE.Scene();
  for (const card of studioRig(mood)) {
    const geometry = card.form === "ring" ? new THREE.RingGeometry(0.25, 0.5, 64) : new THREE.PlaneGeometry(1, 1);
    const material = new THREE.MeshBasicMaterial({ toneMapped: false, side: THREE.DoubleSide });
    material.color.set(card.color).multiplyScalar(card.intensity);
    const mesh = new THREE.Mesh(geometry, material);
    if (Array.isArray(card.scale)) mesh.scale.set(...card.scale);
    else mesh.scale.setScalar(card.scale);
    mesh.position.set(...card.position);
    mesh.lookAt(0, 0, 0);
    studio.add(mesh);
  }
  return studio;
}

function disposeStudio(studio: THREE.Scene) {
  studio.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  });
}

const ENV_SIZE = 256;

export function StudioEnvironment({ mood = "violet" }: { mood?: "violet" | "studio" }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    let alive = true;
    const studio = buildStudio(mood);
    const cube = new THREE.WebGLCubeRenderTarget(ENV_SIZE);
    cube.texture.type = THREE.HalfFloatType;
    const cubeCamera = new THREE.CubeCamera(0.1, 1000, cube);
    studio.add(cubeCamera);
    const pmrem = new THREE.PMREMGenerator(gl);
    let env: THREE.WebGLRenderTarget | null = null;

    try {
      withOffscreenTarget(gl, () => gl.compile(studio, cubeCamera.children[0] as THREE.Camera), cube);
      compilePmrem(gl, pmrem, ENV_SIZE);
    } catch {
      /* the bake below compiles whatever is missing */
    }
    programsReady(gl).then(() => {
      if (!alive) return;
      const autoClear = gl.autoClear;
      gl.autoClear = true;
      cubeCamera.update(gl, studio);
      gl.autoClear = autoClear;
      env = pmrem.fromCubemap(cube.texture);
      scene.environment = env.texture;
      invalidate();
    });

    return () => {
      alive = false;
      if (env && scene.environment === env.texture) scene.environment = null;
      env?.dispose();
      cube.dispose();
      pmrem.dispose();
      disposeStudio(studio);
    };
  }, [gl, scene, invalidate, mood]);

  return null;
}

// ---------------------------------------------------------------------------------------------------------------
// Additive shader materials (premultiplied output so they also composite correctly on transparent canvases).
// ---------------------------------------------------------------------------------------------------------------

const additive = {
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  premultipliedAlpha: true,
  toneMapped: false,
} as const;

const POOL_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

const POOL_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uCore;
uniform float uTime;
uniform float uIntensity;
uniform float uRipple;
varying vec2 vUv;
float ring(float r, float radius, float w) { return smoothstep(w, 0.0, abs(r - radius)); }
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float pool = exp(-r * r * 3.2);
  float core = exp(-r * r * 22.0);
  float rings = 0.0;
  for (int i = 0; i < 3; i++) {
    float ph = fract(uTime * 0.09 + float(i) / 3.0);
    rings += ring(r, 0.12 + ph * 0.85, 0.006 + ph * 0.018) * (1.0 - ph) * smoothstep(0.0, 0.08, ph);
  }
  float a = (pool * 0.5 + core * 0.35 + rings * 0.55 * uRipple) * smoothstep(1.0, 0.75, r) * uIntensity;
  vec3 c = mix(uColor, uCore, core * 0.6);
  gl_FragColor = vec4(c * a, a);
  #include <colorspace_fragment>
}
`;

/** Pool of violet light on the floor, with slow NFC ripples emanating from the centre. */
export function LightPool({
  radius = 3,
  y = 0,
  intensity = 1,
  ripple = 1,
  intensityRef,
}: {
  radius?: number;
  y?: number;
  intensity?: number;
  ripple?: number;
  /** Optional live multiplier (0..1+) read every frame. */
  intensityRef?: RefObject<number>;
}) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        ...additive,
        vertexShader: POOL_VERT,
        fragmentShader: POOL_FRAG,
        uniforms: {
          uColor: { value: new THREE.Color(COLORS.violet) },
          uCore: { value: new THREE.Color(COLORS.violet3) },
          uTime: { value: 0 },
          uIntensity: { value: intensity },
          uRipple: { value: ripple },
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const meshRef = useRef<THREE.Mesh>(null);
  useEffect(() => () => material.dispose(), [material]);
  useFrame((state) => {
    const m = meshRef.current?.material as THREE.ShaderMaterial | undefined;
    if (!m) return;
    m.uniforms.uTime.value = state.clock.elapsedTime;
    m.uniforms.uIntensity.value = intensity * (intensityRef?.current ?? 1);
    m.uniforms.uRipple.value = ripple;
  });
  return (
    <mesh ref={meshRef} rotation-x={-Math.PI / 2} position-y={y} material={material} renderOrder={2}>
      <planeGeometry args={[radius * 2, radius * 2]} />
    </mesh>
  );
}

const GLOW_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uIntensity;
uniform float uFalloff;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float a = exp(-r * r * uFalloff) * (1.0 - smoothstep(0.55, 1.0, r)) * uIntensity;
  gl_FragColor = vec4(uColor * a, a);
  #include <colorspace_fragment>
}
`;

export function makeGlowMaterial(color: THREE.ColorRepresentation, intensity = 1, falloff = 4) {
  return new THREE.ShaderMaterial({
    ...additive,
    vertexShader: POOL_VERT,
    fragmentShader: GLOW_FRAG,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uIntensity: { value: intensity },
      uFalloff: { value: falloff },
    },
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Bokeh: warm + violet out-of-focus discs drifting far behind the subject (the ONDE film look).
// ---------------------------------------------------------------------------------------------------------------

const BOKEH_VERT = /* glsl */ `
attribute float aSize;
attribute float aPhase;
attribute vec3 aColor;
uniform float uTime;
uniform float uScale;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec3 p = position;
  p.x += sin(uTime * 0.07 + aPhase * 6.2831) * 0.35;
  p.y += cos(uTime * 0.05 + aPhase * 4.0) * 0.25;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uScale / max(0.1, -mv.z);
  vColor = aColor;
  vAlpha = 0.6 + 0.4 * sin(uTime * 0.35 + aPhase * 12.0);
}
`;

const BOKEH_FRAG = /* glsl */ `
uniform float uOpacity;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r = length(c);
  if (r > 1.0) discard;
  float disc = smoothstep(1.0, 0.5, r);
  float rim = smoothstep(0.62, 0.92, r) * smoothstep(1.0, 0.9, r);
  float a = (disc * 0.36 + rim * 0.14) * vAlpha * uOpacity;
  gl_FragColor = vec4(vColor * a, a);
  #include <colorspace_fragment>
}
`;

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function Bokeh({
  count = 60,
  spread = [30, 9, 12] as [number, number, number],
  center = [3.5, 3.6, -18] as [number, number, number],
  opacity = 0.75,
  seed = 7,
}: {
  count?: number;
  spread?: [number, number, number];
  center?: [number, number, number];
  opacity?: number;
  seed?: number;
}) {
  const { geometry, material } = useMemo(() => {
    const rand = mulberry32(seed);
    const pos = new Float32Array(count * 3);
    const size = new Float32Array(count);
    const phase = new Float32Array(count);
    const color = new Float32Array(count * 3);
    const warm = new THREE.Color("#ffb867");
    const amber = new THREE.Color(COLORS.gold);
    const violet = new THREE.Color(COLORS.violet2);
    const tmp = new THREE.Color();
    for (let i = 0; i < count; i++) {
      pos[i * 3] = center[0] + (rand() - 0.5) * spread[0];
      pos[i * 3 + 1] = center[1] + (rand() - 0.5) * spread[1];
      pos[i * 3 + 2] = center[2] + (rand() - 0.5) * spread[2];
      size[i] = 0.2 + Math.pow(rand(), 2) * 0.9;
      phase[i] = rand();
      const k = rand();
      tmp.copy(k < 0.55 ? warm : k < 0.8 ? amber : violet).multiplyScalar(0.55 + rand() * 0.6);
      color[i * 3] = tmp.r;
      color[i * 3 + 1] = tmp.g;
      color[i * 3 + 2] = tmp.b;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    g.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
    g.setAttribute("aColor", new THREE.BufferAttribute(color, 3));
    const m = new THREE.ShaderMaterial({
      ...additive,
      vertexShader: BOKEH_VERT,
      fragmentShader: BOKEH_FRAG,
      uniforms: { uTime: { value: 0 }, uScale: { value: 400 }, uOpacity: { value: opacity } },
    });
    return { geometry: g, material: m };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, seed]);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  const pointsRef = useRef<THREE.Points>(null);
  useFrame((state) => {
    const m = pointsRef.current?.material as THREE.ShaderMaterial | undefined;
    if (!m) return;
    m.uniforms.uTime.value = state.clock.elapsedTime;
    m.uniforms.uScale.value = pointScale(state);
    m.uniforms.uOpacity.value = opacity;
  });
  return <points ref={pointsRef} geometry={geometry} material={material} frustumCulled={false} renderOrder={-1} />;
}

// ---------------------------------------------------------------------------------------------------------------
// NFC rings: violet shock rings on the tapped face (burst 0..1 is scroll-driven, so it scrubs both ways).
// ---------------------------------------------------------------------------------------------------------------

const RINGS_FRAG = /* glsl */ `
uniform float uBurst;
uniform float uIdle;
uniform float uTime;
uniform vec3 uColor;
uniform vec3 uCore;
varying vec2 vUv;
float ring(float r, float radius, float w) { return smoothstep(w, 0.0, abs(r - radius)); }
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float a = 0.0;
  for (int i = 0; i < 4; i++) {
    float t = clamp((uBurst - float(i) * 0.11) / 0.62, 0.0, 1.0);
    float live = step(0.0001, t) * step(t, 0.9999);
    float e = 1.0 - pow(1.0 - t, 3.0);
    a += ring(r, e * 0.94, mix(0.012, 0.045, t)) * (1.0 - t) * live;
  }
  float flash = (exp(-r * r * 7.0) * 0.6 + exp(-r * r * 40.0)) * (1.0 - smoothstep(0.0, 0.45, uBurst)) * step(0.0001, uBurst);
  float idle = 0.0;
  for (int j = 0; j < 2; j++) {
    float ph = fract(uTime * 0.45 + float(j) * 0.5);
    idle += ring(r, 0.03 + ph * 0.22, 0.02) * (1.0 - ph);
  }
  idle = (idle * 0.55 + exp(-r * r * 120.0) * 0.3) * uIdle;
  float alpha = (a + idle + flash * 1.6) * smoothstep(1.0, 0.92, r);
  vec3 c = mix(uColor, uCore, clamp(flash * 1.2 + a * 0.25, 0.0, 1.0));
  gl_FragColor = vec4(c * alpha, alpha);
  #include <colorspace_fragment>
}
`;

export function makeRingsMaterial() {
  return new THREE.ShaderMaterial({
    ...additive,
    vertexShader: POOL_VERT,
    fragmentShader: RINGS_FRAG,
    side: THREE.DoubleSide,
    uniforms: {
      uBurst: { value: 0 },
      uIdle: { value: 0 },
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(COLORS.violet2).multiplyScalar(1.6) },
      uCore: { value: new THREE.Color("#ffffff") },
    },
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Star burst: tiny gold stars exploding out of a point (t 0..1 is scroll-driven).
// ---------------------------------------------------------------------------------------------------------------

const STAR_VERT = /* glsl */ `
attribute vec3 aDir;
attribute float aSpeed;
attribute float aSpin;
attribute float aSize;
attribute float aDelay;
attribute vec3 aColor;
uniform float uT;
uniform float uScale;
uniform vec3 uGravity;
varying vec3 vColor;
varying float vAlpha;
varying float vSpin;
void main() {
  float t = clamp((uT - aDelay) / (1.0 - aDelay), 0.0, 1.0);
  float e = 1.0 - pow(1.0 - t, 2.4);
  vec3 p = position + aDir * aSpeed * e + uGravity * t * t;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float pop = smoothstep(0.0, 0.07, t) * (1.0 - smoothstep(0.6, 1.0, t));
  gl_PointSize = aSize * pop * uScale / max(0.05, -mv.z);
  vColor = aColor;
  vAlpha = pop;
  vSpin = aSpin * e * 5.0;
}
`;

const STAR_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
varying float vSpin;
float sdStar5(vec2 p, float r, float rf) {
  const vec2 k1 = vec2(0.809016994375, -0.587785252292);
  const vec2 k2 = vec2(-0.809016994375, -0.587785252292);
  p.x = abs(p.x);
  p -= 2.0 * max(dot(k1, p), 0.0) * k1;
  p -= 2.0 * max(dot(k2, p), 0.0) * k2;
  p.x = abs(p.x);
  p.y -= r;
  vec2 ba = rf * vec2(-k1.y, k1.x) - vec2(0.0, 1.0);
  float h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);
  return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
}
void main() {
  if (vAlpha <= 0.001) discard;
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  c.y = -c.y;
  float s = sin(vSpin), co = cos(vSpin);
  c = mat2(co, -s, s, co) * c;
  float d = sdStar5(c, 0.78, 0.46);
  float body = 1.0 - smoothstep(-0.03, 0.04, d);
  float glow = exp(-max(d, 0.0) * 14.0) * 0.18;
  float a = clamp(body + glow, 0.0, 1.0) * vAlpha;
  gl_FragColor = vec4(vColor * a, a);
  #include <colorspace_fragment>
}
`;

export function makeStarBurst(count = 120, seed = 11) {
  const rand = mulberry32(seed);
  const dir = new Float32Array(count * 3);
  const speed = new Float32Array(count);
  const spin = new Float32Array(count);
  const size = new Float32Array(count);
  const delay = new Float32Array(count);
  const color = new Float32Array(count * 3);
  // Normal blending (not additive) so the stars stay visible over the white review page as well as the dark stage.
  const palette = [
    new THREE.Color(COLORS.gold),
    new THREE.Color("#ffc94a"),
    new THREE.Color("#ff9f1c"),
    new THREE.Color(COLORS.violet2),
  ];
  const v = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    // radial burst in the emitter plane (+Z = towards the viewer), slightly upward
    const a = rand() * Math.PI * 2;
    v.set(Math.cos(a), Math.sin(a) * 0.85 + 0.25, 0.25 + rand() * 0.9).normalize();
    dir.set([v.x, v.y, v.z], i * 3);
    speed[i] = 0.35 + Math.pow(rand(), 0.7) * 1.15;
    spin[i] = (rand() - 0.5) * 2;
    size[i] = 0.03 + Math.pow(rand(), 1.6) * 0.06;
    delay[i] = rand() * 0.16;
    const k = rand();
    const c = palette[k < 0.45 ? 0 : k < 0.72 ? 1 : k < 0.9 ? 2 : 3];
    color.set([c.r, c.g, c.b], i * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geometry.setAttribute("aDir", new THREE.BufferAttribute(dir, 3));
  geometry.setAttribute("aSpeed", new THREE.BufferAttribute(speed, 1));
  geometry.setAttribute("aSpin", new THREE.BufferAttribute(spin, 1));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  geometry.setAttribute("aDelay", new THREE.BufferAttribute(delay, 1));
  geometry.setAttribute("aColor", new THREE.BufferAttribute(color, 3));
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.NormalBlending,
    premultipliedAlpha: true,
    toneMapped: false,
    vertexShader: STAR_VERT,
    fragmentShader: STAR_FRAG,
    uniforms: {
      uT: { value: 0 },
      uScale: { value: 400 },
      uGravity: { value: new THREE.Vector3(0, -0.6, 0) },
    },
  });
  return { geometry, material };
}

/** Pixel scale for size-attenuated points: CSS px per world unit at distance 1. */
export function pointScale(state: { size: { height: number }; viewport: { dpr: number }; camera: THREE.Camera }) {
  const cam = state.camera as THREE.PerspectiveCamera;
  return (state.size.height * state.viewport.dpr) / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov ?? 35) / 2));
}

// ---------------------------------------------------------------------------------------------------------------
// Cheap helpers: soft blob shadow (mid tier) and a camera-facing glow plane (violet aura behind the subject).
// ---------------------------------------------------------------------------------------------------------------

const BLOB_FRAG = /* glsl */ `
uniform float uOpacity;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float a = exp(-dot(p, p) * 4.5) * smoothstep(1.0, 0.8, length(p)) * uOpacity;
  gl_FragColor = vec4(0.0, 0.0, 0.0, a);
}
`;

export function BlobShadow({
  radius = 1.2,
  opacity = 0.6,
  y = 0.003,
}: {
  radius?: number;
  opacity?: number;
  y?: number;
}) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        premultipliedAlpha: true,
        vertexShader: POOL_VERT,
        fragmentShader: BLOB_FRAG,
        uniforms: { uOpacity: { value: opacity } },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const meshRef = useRef<THREE.Mesh>(null);
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => {
    const m = meshRef.current?.material as THREE.ShaderMaterial | undefined;
    if (m) m.uniforms.uOpacity.value = opacity;
  }, [material, opacity]);
  return (
    <mesh ref={meshRef} rotation-x={-Math.PI / 2} position-y={y} material={material} renderOrder={1}>
      <planeGeometry args={[radius * 2, radius * 2]} />
    </mesh>
  );
}

export function GlowPlane({
  position,
  scale = 4,
  color = COLORS.violet,
  intensity = 0.6,
  falloff = 3.5,
}: {
  position: [number, number, number];
  scale?: number | [number, number];
  color?: THREE.ColorRepresentation;
  intensity?: number;
  falloff?: number;
}) {
  const material = useMemo(
    () => makeGlowMaterial(color, intensity, falloff),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const meshRef = useRef<THREE.Mesh>(null);
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => {
    const m = meshRef.current?.material as THREE.ShaderMaterial | undefined;
    if (m) m.uniforms.uIntensity.value = intensity;
  }, [material, intensity]);
  const s: [number, number, number] = Array.isArray(scale) ? [scale[0], scale[1], 1] : [scale, scale, 1];
  return (
    <mesh ref={meshRef} position={position} scale={s} material={material} renderOrder={-1}>
      <planeGeometry args={[1, 1]} />
    </mesh>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Contact shadow: drei's <ContactShadows> (MIT) re-implemented line for line — same depth pass, same two-pass blur
// (+ the softer "smooth" pass), same plane — with its private depth and blur materials registered with the warm gate,
// so their programs link in the background instead of stalling the hero's first frame.
// ---------------------------------------------------------------------------------------------------------------

type ContactShadowProps = {
  position?: [number, number, number];
  scale?: number;
  frames?: number;
  opacity?: number;
  blur?: number;
  near?: number;
  far?: number;
  resolution?: number;
  smooth?: boolean;
  color?: THREE.ColorRepresentation;
  depthWrite?: boolean;
  renderOrder?: number;
};

export function ContactShadow({
  position,
  scale = 10,
  frames = Infinity,
  opacity = 1,
  blur = 1,
  near = 0,
  far = 10,
  resolution = 512,
  smooth = true,
  color = "#000000",
  depthWrite = false,
  renderOrder,
}: ContactShadowProps) {
  const ref = useRef<THREE.Group>(null);
  const shadowCamera = useRef<THREE.OrthographicCamera>(null);
  const width = scale;
  const height = scale;

  const fx = useMemo(() => {
    const renderTarget = new THREE.WebGLRenderTarget(resolution, resolution);
    const renderTargetBlur = new THREE.WebGLRenderTarget(resolution, resolution);
    renderTargetBlur.texture.generateMipmaps = renderTarget.texture.generateMipmaps = false;
    const planeGeometry = new THREE.PlaneGeometry(width, height).rotateX(Math.PI / 2);
    const blurPlane = new THREE.Mesh(planeGeometry);
    const depthMaterial = new THREE.MeshDepthMaterial();
    depthMaterial.depthTest = depthMaterial.depthWrite = false;
    depthMaterial.onBeforeCompile = (shader) => {
      shader.uniforms = { ...shader.uniforms, ucolor: { value: new THREE.Color(color) } };
      shader.fragmentShader = shader.fragmentShader.replace(
        `void main() {`,
        `uniform vec3 ucolor;
           void main() {
          `,
      );
      // colorize the shadow, multiplied by the falloff so that the centre can remain darker
      shader.fragmentShader = shader.fragmentShader.replace(
        "vec4( vec3( 1.0 - fragCoordZ ), opacity );",
        "vec4( ucolor * fragCoordZ * 2.0, ( 1.0 - fragCoordZ ) * 1.0 );",
      );
    };
    const horizontalBlurMaterial = new THREE.ShaderMaterial({
      ...HorizontalBlurShader,
      uniforms: THREE.UniformsUtils.clone(HorizontalBlurShader.uniforms),
    });
    const verticalBlurMaterial = new THREE.ShaderMaterial({
      ...VerticalBlurShader,
      uniforms: THREE.UniformsUtils.clone(VerticalBlurShader.uniforms),
    });
    verticalBlurMaterial.depthTest = horizontalBlurMaterial.depthTest = false;
    return {
      renderTarget,
      renderTargetBlur,
      planeGeometry,
      blurPlane,
      depthMaterial,
      horizontalBlurMaterial,
      verticalBlurMaterial,
    };
  }, [resolution, width, height, color]);

  // the passes mutate these objects every frame: callbacks reach them through a ref, never the memo itself
  const fxRef = useRef(fx);
  useEffect(() => {
    fxRef.current = fx;
    return () => {
      fx.renderTarget.dispose();
      fx.renderTargetBlur.dispose();
      fx.planeGeometry.dispose();
      fx.depthMaterial.dispose();
      fx.horizontalBlurMaterial.dispose();
      fx.verticalBlurMaterial.dispose();
    };
  }, [fx]);

  // warm gate: link the depth program (one per mesh variant) and both blur programs for the render-target passes
  useWarmer((g, root) => {
    const cam = shadowCamera.current;
    const group = ref.current;
    const f = fxRef.current;
    if (!cam || !group) return;
    withOffscreenTarget(g, () => {
      const swapped: [THREE.Mesh, THREE.Material | THREE.Material[]][] = [];
      group.visible = false;
      root.traverseVisible((o) => {
        const mesh = o as THREE.Mesh;
        if ((mesh.isMesh || (o as THREE.Points).isPoints) && mesh.material) {
          swapped.push([mesh, mesh.material]);
          mesh.material = f.depthMaterial;
        }
      });
      try {
        g.compile(root, cam);
      } finally {
        for (const [mesh, material] of swapped) mesh.material = material;
        group.visible = true;
      }
      f.blurPlane.visible = true;
      for (const m of [f.horizontalBlurMaterial, f.verticalBlurMaterial]) {
        f.blurPlane.material = m;
        g.compile(f.blurPlane, cam);
      }
      f.blurPlane.visible = false;
    });
  });

  const count = useRef(0);
  useFrame(({ gl, scene }) => {
    const cam = shadowCamera.current;
    const group = ref.current;
    const f = fxRef.current;
    if (!cam || !group || !(frames === Infinity || count.current < frames)) return;
    count.current++;
    const blurShadows = (amount: number) => {
      const { blurPlane, horizontalBlurMaterial: hb, verticalBlurMaterial: vb, renderTarget, renderTargetBlur } = f;
      blurPlane.visible = true;
      blurPlane.material = hb;
      hb.uniforms.tDiffuse.value = renderTarget.texture;
      hb.uniforms.h.value = (amount * 1) / 256;
      gl.setRenderTarget(renderTargetBlur);
      gl.render(blurPlane, cam);
      blurPlane.material = vb;
      vb.uniforms.tDiffuse.value = renderTargetBlur.texture;
      vb.uniforms.v.value = (amount * 1) / 256;
      gl.setRenderTarget(renderTarget);
      gl.render(blurPlane, cam);
      blurPlane.visible = false;
    };
    const initialBackground = scene.background;
    const initialOverrideMaterial = scene.overrideMaterial;
    group.visible = false;
    scene.background = null;
    scene.overrideMaterial = f.depthMaterial;
    gl.setRenderTarget(f.renderTarget);
    gl.render(scene, cam);
    blurShadows(blur);
    if (smooth) blurShadows(blur * 0.4);
    gl.setRenderTarget(null);
    group.visible = true;
    scene.overrideMaterial = initialOverrideMaterial;
    scene.background = initialBackground;
  });

  return (
    <group rotation-x={Math.PI / 2} position={position} ref={ref}>
      <mesh renderOrder={renderOrder} geometry={fx.planeGeometry} scale={[1, -1, 1]} rotation={[-Math.PI / 2, 0, 0]}>
        <meshBasicMaterial transparent map={fx.renderTarget.texture} opacity={opacity} depthWrite={depthWrite} />
      </mesh>
      <orthographicCamera ref={shadowCamera} args={[-width / 2, width / 2, height / 2, -height / 2, near, far]} />
    </group>
  );
}
