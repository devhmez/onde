"use client";

import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { COLORS } from "./config";
import { CANVAS_RESIZE, PerfGuard, RenderDriver } from "./driver";
import { BlobShadow, ContactShadow, GlowPlane, LightPool, StudioEnvironment } from "./fx";
import { bump, useWindowPointer, type Pacer } from "./hooks";
import type { Quality } from "./materials";
import { preloadProduct, useProductLayout } from "./models";
import { compileComposer, FirstFrame, WarmGate } from "./warmup";

const DPR_STEPS = [1.75, 1.5, 1.25, 1];

type Props = {
  tier: "high" | "mid";
  anisotropy: number;
  active: boolean;
  reduced: boolean;
  onReady?: () => void;
};

export default function HeroCanvas({ tier, anisotropy, active, reduced, onReady }: Props) {
  const [dprIndex, setDprIndex] = useState(tier === "high" ? 0 : 1);
  const [degraded, setDegraded] = useState(false);
  // frameloop "never" until every shader is linked in the background (see warmup.ts) — no first-render stall
  const [warm, setWarm] = useState(false);
  const quality: Quality = tier === "high" && !degraded ? "high" : "mid";
  const pacer = useMemo<Pacer>(() => ({ busyUntil: 0 }), []);
  const pointer = useWindowPointer(() => {
    if (!reduced) bump(pacer, 700);
  });
  const layoutRef = useRef<object | null>(null);
  const composerRef = useRef<{ passes?: unknown[] } | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);

  useEffect(() => preloadProduct("stand-white"), []);

  const isReady = useCallback(
    () =>
      !!layoutRef.current &&
      !!sceneRef.current?.environment &&
      (quality !== "high" || (composerRef.current?.passes?.length ?? 0) > 1),
    [quality],
  );

  return (
    <Canvas
      frameloop={warm ? "demand" : "never"}
      resize={CANVAS_RESIZE}
      dpr={[1, DPR_STEPS[dprIndex]]}
      gl={{
        alpha: true,
        antialias: true,
        premultipliedAlpha: true,
        powerPreference: "high-performance",
        stencil: false,
      }}
      camera={{ fov: 26, near: 0.1, far: 60, position: [0, 1.3, 8] }}
      onCreated={({ gl, scene }) => {
        gl.setClearColor(0x000000, 0);
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.2;
        sceneRef.current = scene;
      }}
      style={{ position: "absolute", inset: 0 }}
    >
      <WarmGate
        isReady={isReady}
        offscreen={quality === "high"}
        prepare={(gl) => compileComposer(gl, composerRef.current)}
        onWarm={() => setWarm(true)}
      />
      {warm ? <FirstFrame onFrame={onReady} /> : null}
      <RenderDriver active={active} pacer={pacer} idleFps={reduced ? 0.01 : quality === "high" ? 60 : 30} />
      {reduced ? null : (
        <PerfGuard
          pacer={pacer}
          always={quality === "high"}
          onSlow={() => {
            if (dprIndex < DPR_STEPS.length - 1) setDprIndex((i) => i + 1);
            else setDegraded(true);
          }}
        />
      )}
      <Suspense fallback={null}>
        <HeroScene
          quality={quality}
          anisotropy={anisotropy}
          pointer={pointer}
          reduced={reduced}
          pacer={pacer}
          layoutRef={layoutRef}
          composerRef={composerRef}
        />
      </Suspense>
    </Canvas>
  );
}

function HeroScene({
  quality,
  anisotropy,
  pointer,
  reduced,
  pacer,
  layoutRef,
  composerRef,
}: {
  quality: Quality;
  anisotropy: number;
  pointer: RefObject<{ x: number; y: number }>;
  reduced: boolean;
  pacer: Pacer;
  layoutRef: RefObject<object | null>;
  composerRef: RefObject<{ passes?: unknown[] } | null>;
}) {
  const layout = useProductLayout("stand-white", quality, anisotropy);
  const spin = useRef<THREE.Group>(null);
  const float = useRef<THREE.Group>(null);
  const size = useThree((s) => s.size);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const H = layout.size.y;
  // The 12 × 12 cm stand is as deep as it is wide (L base behind the face): the orbit sweeps its footprint diagonal.
  const R = Math.hypot(layout.size.x, layout.size.z) / 2;
  const halfW = R + 0.15;
  // glow, light pool and shadow were tuned for a 1.3-unit half-width frame: keep them in proportion
  const fx = halfW / 1.3;
  const lift = 0.34;
  const motion = useRef({ yaw: -0.35, pitch: 0.02 });

  // Frame the stand (with room for the orbit and the light pool) for any container aspect.
  useLayoutEffect(() => {
    const aspect = size.width / Math.max(1, size.height);
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const halfH = (H + lift + 0.55) / 2;
    const d = Math.max(halfH / t, halfW / (t * aspect)) * 1.05;
    const cy = (H + lift) / 2 - 0.02;
    camera.position.set(0, cy + d * 0.1, d);
    camera.lookAt(0, cy, 0);
    camera.updateProjectionMatrix();
    bump(pacer, 300);
  }, [size, camera, H, halfW, pacer]);

  // Tells the warm gate the model is mounted (the gate then precompiles it); readiness is reported on the first frame.
  useLayoutEffect(() => {
    layoutRef.current = layout;
    bump(pacer, 1500);
    return () => {
      if (layoutRef.current === layout) layoutRef.current = null;
    };
  }, [layout, layoutRef, pacer]);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    const t = state.clock.elapsedTime;
    const m = motion.current;
    const px = pointer.current?.x ?? 0;
    const py = pointer.current?.y ?? 0;
    const idleYaw = reduced ? -0.38 : -0.32 + Math.sin(t * 0.3) * 0.46;
    const targetYaw = idleYaw + (reduced ? 0 : px * 0.42);
    const targetPitch = 0.02 + (reduced ? 0 : py * 0.13);
    const k = 1 - Math.exp(-dt * 2.6);
    m.yaw += (targetYaw - m.yaw) * k;
    m.pitch += (targetPitch - m.pitch) * k;
    if (spin.current) spin.current.rotation.set(m.pitch, m.yaw, 0);
    if (float.current) float.current.position.y = lift + (reduced ? 0 : Math.sin(t * 0.85) * 0.07);
  });

  return (
    <>
      <StudioEnvironment mood="violet" />
      <ambientLight intensity={0.12} />
      <spotLight position={[2.4, 6.5, 4.6]} angle={0.42} penumbra={1} intensity={85} decay={2} color="#fff3e8" />
      <pointLight position={[-1.9, 2.5, -1.8]} color={COLORS.violet2} intensity={28} decay={2} distance={9} />
      <pointLight position={[2.1, 0.9, -1.5]} color={COLORS.violet} intensity={20} decay={2} distance={9} />
      <GlowPlane position={[0, H * 0.55 + lift, -1.2]} scale={[3.0 * fx, 3.2 * fx]} intensity={0.32} falloff={5.5} />
      <group ref={float} position-y={lift}>
        <group position-y={H / 2}>
          <group ref={spin}>
            <group position-y={-H / 2}>
              <primitive object={layout.object} />
            </group>
          </group>
        </group>
      </group>
      <LightPool radius={1.5 * fx} y={0.002} intensity={1.2} ripple={reduced ? 0 : 1} />
      {quality === "high" ? (
        <ContactShadow
          position={[0, 0.001, 0]}
          opacity={0.62}
          scale={4.6 * fx}
          blur={2.8}
          far={2.4}
          resolution={256}
          color="#05030f"
          frames={reduced ? 2 : Infinity}
        />
      ) : (
        <BlobShadow radius={1.25 * fx} opacity={0.55} />
      )}
      {quality === "high" ? (
        <EffectComposer ref={composerRef as never} multisampling={4}>
          <Bloom mipmapBlur intensity={0.85} luminanceThreshold={0.72} luminanceSmoothing={0.22} radius={0.72} />
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        </EffectComposer>
      ) : null}
    </>
  );
}
