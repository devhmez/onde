"use client";

import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { MeshReflectorMaterial } from "@react-three/drei";
import { ConvolutionMaterial } from "@react-three/drei/materials/ConvolutionMaterial";
import { COLORS, PRODUCTS, type TapProduct } from "./config";
import { buildChoreo, composition, createFrame, evaluate, type Choreo } from "./choreo";
import { bump as bumpCurve, clamp01, easeOutBack, easeOutCubic, smooth } from "./timeline";
import { Bokeh, LightPool, StudioEnvironment, makeRingsMaterial, makeStarBurst, pointScale } from "./fx";
import { CANVAS_RESIZE, PerfGuard, RenderDriver } from "./driver";
import { bump, type Pacer } from "./hooks";
import type { Quality } from "./materials";
import {
  phoneScreenPoint,
  preloadAllProductsIdle,
  preloadPhone,
  preloadProduct,
  usePhoneLayout,
  useProductLayout,
  type ProductLayout,
} from "./models";
import {
  applyBanner,
  applyCaptions,
  applyToast,
  placeScreenLayer,
  SCREEN_LAYER,
  type OverlayRefs,
  type StyleCache,
} from "./overlay";
import { ReviewScreen } from "./screen";
import { FirstFrame, WarmGate, withOffscreenTarget } from "./warmup";

export type TapCanvasProps = {
  product: TapProduct;
  /** Language of the phone screens (lock screen, Safari, Google review). */
  locale: string;
  tier: "high" | "mid";
  anisotropy: number;
  progressRef: RefObject<number>;
  pacer: Pacer;
  overlays: RefObject<OverlayRefs>;
  active: boolean;
  onReady?: () => void;
};

type Shared = {
  layout: ProductLayout | null;
  product: TapProduct;
  hadProduct: boolean;
  swapAt: number;
  choreo: Choreo | null;
  choreoKey: string;
  phone: THREE.Group | null;
  burst: THREE.Points | null;
  screenMaterial: THREE.MeshPhysicalMaterial | THREE.MeshBasicMaterial | null;
};

const DPR_STEPS = [1.75, 1.5, 1.25, 1];

/** One pinned WebGL stage for the whole story. Mounted lazily by TapStory (three.js never loads on fallbacks). */
export default function TapCanvas(props: TapCanvasProps) {
  const [dprIndex, setDprIndex] = useState(props.tier === "high" ? 0 : 1);
  const [degraded, setDegraded] = useState(false);
  // frameloop "never" until every shader is linked in the background (warmup.ts): the stage is mounted ahead of
  // time, off-screen, and must never freeze the page with a first-render compile.
  const [warm, setWarm] = useState(false);
  const quality: Quality = props.tier === "high" && !degraded ? "high" : "mid";

  useEffect(() => {
    preloadPhone();
    preloadProduct(props.product);
  }, [props.product]);
  // Warm the other products' models on idle (desktop-class devices only) so switching is instant — only once this
  // stage is ready, so on a slow link they never compete with the phone and the product actually on screen.
  useEffect(() => (props.tier === "high" && warm ? preloadAllProductsIdle() : undefined), [props.tier, warm]);

  return (
    <Canvas
      frameloop={warm ? "demand" : "never"}
      resize={CANVAS_RESIZE}
      dpr={[1, DPR_STEPS[dprIndex]]}
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance", stencil: false }}
      camera={{ fov: 30, near: 0.05, far: 90, position: [0, 1.6, 9] }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.08;
      }}
      style={{ position: "absolute", inset: 0 }}
    >
      <RenderDriver active={props.active} pacer={props.pacer} idleFps={30} />
      <PerfGuard
        pacer={props.pacer}
        onSlow={() => {
          if (dprIndex < DPR_STEPS.length - 1) setDprIndex((i) => i + 1);
          else if (!degraded) setDegraded(true);
        }}
      />
      {warm ? <FirstFrame /> : null}
      <TapWorld {...props} quality={quality} onWarm={() => setWarm(true)} />
    </Canvas>
  );
}

function TapWorld({
  product,
  locale,
  quality,
  anisotropy,
  progressRef,
  pacer,
  overlays,
  onReady,
  onWarm,
}: TapCanvasProps & { quality: Quality; onWarm: () => void }) {
  const sharedRef = useRef<Shared>({
    layout: null,
    product,
    hadProduct: false,
    swapAt: 0,
    choreo: null,
    choreoKey: "",
    phone: null,
    burst: null,
    screenMaterial: null,
  });
  // The display canvas is created once per quality level; its GPU texture is released on unmount.
  const screen = useMemo(
    () => new ReviewScreen(quality === "high" ? 1024 : 720, anisotropy, locale === "en" ? "en" : "fr"),
    [quality, anisotropy, locale],
  );
  useEffect(() => {
    let alive = true;
    screen
      .load()
      .then(() => {
        if (alive) bump(pacer, 300);
      })
      .catch(() => {
        /* the lock screen stays visible; the story still plays */
      });
    return () => {
      alive = false;
      screen.dispose();
    };
  }, [screen, pacer]);

  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const isReady = useCallback(
    () => !!scene.environment && !!sharedRef.current.layout && !!sharedRef.current.phone,
    [scene],
  );
  // The floor reflector blurs its mirror with a ConvolutionMaterial it keeps private (drei BlurPass): an identical
  // stand-in (same defines, same full-screen triangle) lets the warm gate link that program too. Kept alive until
  // unmount — disposing it early would release the shared program.
  const blurStandIn = useMemo(() => {
    if (quality !== "high") return null;
    const material = new ConvolutionMaterial();
    material.defines.USE_DEPTH = true; // Floor: depthScale > 0
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    geometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    return mesh;
  }, [quality]);
  useEffect(
    () => () => {
      blurStandIn?.geometry.dispose();
      (blurStandIn?.material as THREE.Material | undefined)?.dispose();
    },
    [blurStandIn],
  );

  return (
    <>
      <WarmGate
        isReady={isReady}
        offscreen={quality === "high"}
        prepare={(gl) => {
          if (blurStandIn) withOffscreenTarget(gl, () => gl.compile(blurStandIn, camera));
          gl.initTexture(screen.texture);
        }}
        onWarm={onWarm}
      />
      <color attach="background" args={[COLORS.ink]} />
      <fog attach="fog" args={[COLORS.ink, 15, 40]} />
      <Suspense fallback={null}>
        <StudioEnvironment mood="violet" />
      </Suspense>
      <Floor quality={quality} />
      <Bokeh count={quality === "high" ? 80 : 46} />
      <Suspense fallback={null}>
        <Stage
          product={product}
          quality={quality}
          anisotropy={anisotropy}
          sharedRef={sharedRef}
          screen={screen}
          progressRef={progressRef}
          pacer={pacer}
          overlays={overlays}
          onReady={onReady}
        />
      </Suspense>
    </>
  );
}

function Floor({ quality }: { quality: Quality }) {
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={0} renderOrder={-2}>
      <circleGeometry args={[34, 64]} />
      {quality === "high" ? (
        <MeshReflectorMaterial
          resolution={512}
          blur={[320, 90]}
          mixBlur={1}
          mixStrength={1.6}
          mixContrast={1}
          mirror={0.55}
          roughness={0.9}
          metalness={0.35}
          depthScale={0.7}
          minDepthThreshold={0.25}
          maxDepthThreshold={1.3}
          color="#0c0a14"
        />
      ) : (
        <meshStandardMaterial color="#050409" roughness={0.62} metalness={0} envMapIntensity={0.35} />
      )}
    </mesh>
  );
}

type StageProps = {
  product: TapProduct;
  quality: Quality;
  anisotropy: number;
  sharedRef: RefObject<Shared>;
  screen: ReviewScreen;
  progressRef: RefObject<number>;
  pacer: Pacer;
  overlays: RefObject<OverlayRefs>;
  onReady?: () => void;
};

function ProductRig({
  product,
  quality,
  anisotropy,
  sharedRef,
  pacer,
}: Pick<StageProps, "product" | "quality" | "anisotropy" | "sharedRef" | "pacer">) {
  const layout = useProductLayout(product, quality, anisotropy);
  useLayoutEffect(() => {
    const sh = sharedRef.current;
    sh.layout = layout;
    sh.product = product;
    sh.choreo = null;
    sh.swapAt = sh.hadProduct ? performance.now() : 0;
    sh.hadProduct = true;
    bump(pacer, 1600);
    return () => {
      if (sh.layout === layout) sh.layout = null;
    };
  }, [layout, product, sharedRef, pacer]);
  return <primitive object={layout.object} />;
}

function PhoneRig({
  screen,
  quality,
  anisotropy,
  sharedRef,
}: Pick<StageProps, "screen" | "quality" | "anisotropy" | "sharedRef">) {
  const phone = usePhoneLayout(screen.texture, quality, anisotropy);
  const burst = useMemo(() => makeStarBurst(120), []);
  const group = useRef<THREE.Group>(null);
  const points = useRef<THREE.Points>(null);
  const emitter = useMemo(() => phoneScreenPoint(0.5, 0.735).add(new THREE.Vector3(0, 0, 0.03)), []);
  useEffect(
    () => () => {
      burst.geometry.dispose();
      burst.material.dispose();
    },
    [burst],
  );
  useLayoutEffect(() => {
    const sh = sharedRef.current;
    sh.phone = group.current;
    sh.burst = points.current;
    sh.screenMaterial = phone.screenMaterial;
    return () => {
      sh.phone = null;
      sh.burst = null;
      sh.screenMaterial = null;
    };
  }, [phone, sharedRef]);
  return (
    <group ref={group} visible={false}>
      <primitive object={phone.object} />
      <points
        ref={points}
        geometry={burst.geometry}
        material={burst.material}
        position={emitter}
        frustumCulled={false}
        visible={false}
        renderOrder={5}
      />
    </group>
  );
}

function Stage(props: StageProps) {
  const { sharedRef, screen, progressRef, overlays, onReady, pacer } = props;
  const productGroup = useRef<THREE.Group>(null);
  const spot = useRef<THREE.SpotLight>(null);
  const flashLight = useRef<THREE.PointLight>(null);
  const rings = useRef<THREE.Mesh>(null);
  const poolLevel = useRef(0.2);
  const ringsMaterial = useMemo(() => makeRingsMaterial(), []);
  useEffect(() => () => ringsMaterial.dispose(), [ringsMaterial]);
  const frameRef = useRef(createFrame());
  const cacheRef = useRef<StyleCache>(new Map());
  const mem = useRef({
    snapped: false,
    camPos: new THREE.Vector3(),
    camTarget: new THREE.Vector3(),
    phonePos: new THREE.Vector3(),
    phoneQuat: new THREE.Quaternion(),
    phoneSnapped: false,
    viewKey: "",
    ready: false,
    ringQuat: new THREE.Quaternion(),
    ringKey: null as Choreo | null,
  });
  const tmpRef = useRef({
    v: new THREE.Vector3(),
    corners: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()],
    quad: [0, 0, 0, 0, 0, 0, 0, 0],
    m: new THREE.Matrix4(),
    q: new THREE.Quaternion(),
    euler: new THREE.Euler(),
  });

  useFrame((state, delta) => {
    const sh = sharedRef.current;
    const m = mem.current;
    const tmp = tmpRef.current;
    const frame = frameRef.current;
    const cache = cacheRef.current;
    const cam = state.camera as THREE.PerspectiveCamera;
    const { width, height } = state.size;
    if (width < 2 || height < 2) return;
    const aspect = width / height;
    const portrait = aspect < 0.95;
    const p = clamp01(progressRef.current ?? 0);
    const dt = Math.min(delta, 1 / 20);
    const t = state.clock.elapsedTime;
    const now = performance.now();

    // composition: shift the subject to leave room for the captions
    const { sx, sy } = composition(aspect);
    const viewKey = `${width}x${height}:${sx.toFixed(3)}:${sy.toFixed(3)}`;
    if (m.viewKey !== viewKey) {
      m.viewKey = viewKey;
      cam.setViewOffset(width, height, -sx * width, sy * height, width, height);
    }

    const layout = sh.layout;
    if (!layout) return;
    const spec = PRODUCTS[sh.product];
    const key = `${sh.product}:${portrait ? "p" : "l"}`;
    if (!sh.choreo || sh.choreoKey !== key) {
      sh.choreo = buildChoreo(
        {
          tap: layout.tap,
          normal: layout.normal,
          size: layout.size,
          center: layout.center,
          lift: spec.lift,
          yaw: spec.yaw,
          contact: spec.contact,
        },
        portrait,
      );
      sh.choreoKey = key;
    }
    const c = sh.choreo;
    const f = evaluate(c, p, aspect, cam.fov, frame);

    // ---- camera (damped so product switches and resizes glide; GSAP already smooths the scroll)
    const k = m.snapped ? 1 - Math.exp(-dt * 9) : 1;
    m.camPos.lerp(f.camPos, k);
    m.camTarget.lerp(f.camTarget, k);
    m.snapped = true;
    cam.position.copy(m.camPos);
    if (f.shake > 0.002) {
      cam.position.x += Math.sin(t * 63.0) * 0.03 * f.shake;
      cam.position.y += Math.sin(t * 47.0 + 1.3) * 0.022 * f.shake;
    }
    cam.lookAt(m.camTarget);
    if (f.shake > 0.002) cam.rotateZ(Math.sin(t * 39.0) * 0.008 * f.shake);
    cam.updateMatrixWorld();

    // ---- product
    const g = productGroup.current;
    if (g) {
      const bob = (spec.kind === "stand" ? 0.02 : 0.035) * (1 - bumpCurve(p, 0.22, 0.5));
      let scale = 1;
      let spin = 0;
      if (sh.swapAt > 0) {
        const s = clamp01((now - sh.swapAt) / 950);
        scale = Math.max(0.001, easeOutBack(s, 1.4));
        spin = -2.6 * (1 - easeOutCubic(s));
        if (s < 1) bump(pacer, 120);
      }
      g.position.set(0, spec.lift + Math.max(f.productOffsetY, 0.03 - spec.lift) + Math.sin(t * 0.9) * bob, 0);
      g.rotation.set(0, f.productYaw + spin, 0);
      g.scale.setScalar(scale);
    }

    // ---- light
    poolLevel.current = f.productLight;
    if (spot.current) spot.current.intensity = 95 * f.productLight;

    // ---- NFC rings + flash
    const r = rings.current;
    if (r) {
      if (m.ringKey !== c) {
        m.ringKey = c;
        tmp.m.lookAt(c.N, new THREE.Vector3(), new THREE.Vector3(0, 1, 0));
        m.ringQuat.setFromRotationMatrix(tmp.m);
      }
      r.position.copy(c.T).addScaledVector(c.N, 0.014);
      r.quaternion.copy(m.ringQuat);
      // ring field scales with the product: a sticker gets tighter ripples than the 12 cm stand
      r.scale.setScalar(THREE.MathUtils.clamp(Math.max(layout.size.x, layout.size.y) / 2, 0.42, 1));
      const live = (f.ringBurst > 0 && f.ringBurst < 1) || f.ringIdle > 0.002;
      r.visible = live;
      const rm = r.material as THREE.ShaderMaterial;
      rm.uniforms.uBurst.value = f.ringBurst;
      rm.uniforms.uIdle.value = f.ringIdle * 0.7;
      rm.uniforms.uTime.value = t;
    }
    if (flashLight.current) {
      flashLight.current.position.copy(c.T).addScaledVector(c.N, 0.12);
      flashLight.current.intensity = f.flash * 14 + (f.ringBurst > 0 && f.ringBurst < 1 ? (1 - f.ringBurst) * 3 : 0);
    }

    // ---- phone
    const phone = sh.phone;
    if (phone) {
      phone.visible = f.phoneVisible;
      const kp = m.phoneSnapped ? 1 - Math.exp(-dt * 14) : 1;
      m.phonePos.lerp(f.phone.pos, kp);
      m.phoneQuat.slerp(f.phone.quat, kp);
      m.phoneSnapped = true;
      phone.position.copy(m.phonePos);
      phone.quaternion.copy(m.phoneQuat);
      const float = smooth(p, 0.47, 0.53) * (1 - smooth(p, 0.585, 0.66));
      if (float > 0) {
        phone.position.y += Math.sin(t * 1.5) * 0.018 * float;
        tmp.euler.set(Math.sin(t * 1.1) * 0.025 * float, Math.sin(t * 0.8) * 0.035 * float, 0);
        phone.quaternion.multiply(tmp.q.setFromEuler(tmp.euler));
      }
      phone.updateMatrixWorld();
      // depth pull: as the camera dives into the screen, the stage behind the phone sinks into the dark
      const fog = state.scene.fog as THREE.Fog | null;
      if (fog) {
        const pull = smooth(p, 0.5, 0.68);
        const d = cam.position.distanceTo(phone.position);
        fog.near = THREE.MathUtils.lerp(15, d + 0.35, pull);
        fog.far = THREE.MathUtils.lerp(40, d + 2.6, pull);
      }
      const sm = sh.screenMaterial;
      if (sm && "envMapIntensity" in sm) sm.envMapIntensity = 0.35 * f.screenGloss;
      const burst = sh.burst;
      if (burst) {
        burst.visible = f.burst > 0 && f.burst < 1;
        const mat = burst.material as THREE.ShaderMaterial;
        mat.uniforms.uT.value = f.burst;
        mat.uniforms.uScale.value = pointScale(state);
      }
    }
    screen.update(f.screen);

    // ---- DOM overlays (captions, banner mapped on the display, toast)
    const o = overlays.current;
    if (o) {
      applyCaptions(o, cache, f, p);
      applyBanner(o, cache, f);
      const layerOn = !!phone && f.banner.drop > 0 && f.banner.out < 1;
      let screenWidthPx = 0;
      if (phone && (layerOn || f.toast > 0)) {
        const uv: [number, number][] = [
          [0, 0],
          [1, 0],
          [0, 1],
          [1, 1],
        ];
        let ok = true;
        uv.forEach(([u, v], i) => {
          const w = phoneScreenPoint(u, v, tmp.corners[i]).applyMatrix4(phone.matrixWorld);
          tmp.v.copy(w).applyMatrix4(cam.matrixWorldInverse);
          if (tmp.v.z > -cam.near) ok = false;
          w.project(cam);
          tmp.quad[i * 2] = ((w.x + 1) / 2) * width;
          tmp.quad[i * 2 + 1] = ((1 - w.y) / 2) * height;
        });
        screenWidthPx = Math.hypot(tmp.quad[2] - tmp.quad[0], tmp.quad[3] - tmp.quad[1]);
        placeScreenLayer(o, cache, ok ? tmp.quad : null, layerOn && ok);
      } else {
        placeScreenLayer(o, cache, null, false);
      }
      if (phone && f.toast > 0) {
        const a = phoneScreenPoint(0.5, 0.735, tmp.v).applyMatrix4(phone.matrixWorld).project(cam);
        const s = THREE.MathUtils.clamp(screenWidthPx / SCREEN_LAYER.width, 0.55, 1.35);
        applyToast(o, cache, f, ((a.x + 1) / 2) * width, ((1 - a.y) / 2) * height, s);
      } else {
        applyToast(o, cache, f, 0, 0, 1);
      }
    }

    if (!m.ready && phone) {
      // every program (phone, rings, star burst included) was linked by <WarmGate> before the first frame
      m.ready = true;
      onReady?.();
    }
  });

  return (
    <>
      <ambientLight intensity={0.12} />
      <spotLight
        ref={spot}
        position={[1.8, 7.5, 4.2]}
        angle={0.36}
        penumbra={1}
        decay={2}
        intensity={20}
        color="#fff3e6"
      />
      <pointLight position={[-2.4, 2.8, -2.2]} color={COLORS.violet2} intensity={14} decay={2} distance={12} />
      <pointLight position={[3.2, 1.2, -1.4]} color={COLORS.violet} intensity={10} decay={2} distance={10} />
      <pointLight ref={flashLight} color="#b3a4ff" intensity={0} decay={2} distance={7} />
      <LightPool radius={3.4} y={0.004} intensity={props.quality === "high" ? 1.15 : 0.8} intensityRef={poolLevel} />
      <group ref={productGroup}>
        <Suspense fallback={null}>
          <ProductRig
            key={props.product}
            product={props.product}
            quality={props.quality}
            anisotropy={props.anisotropy}
            sharedRef={sharedRef}
            pacer={pacer}
          />
        </Suspense>
      </group>
      <mesh ref={rings} material={ringsMaterial} visible={false} renderOrder={4}>
        <planeGeometry args={[4.2, 4.2]} />
      </mesh>
      <Suspense fallback={null}>
        <PhoneRig screen={screen} quality={props.quality} anisotropy={props.anisotropy} sharedRef={sharedRef} />
      </Suspense>
    </>
  );
}
