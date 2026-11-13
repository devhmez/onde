"use client";

import { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { COLORS, PRODUCTS, type TapProduct } from "./config";
import { CANVAS_RESIZE, PerfGuard, RenderDriver } from "./driver";
import { BlobShadow, ContactShadow, GlowPlane, LightPool, StudioEnvironment } from "./fx";
import { bump, type Pacer } from "./hooks";
import type { Quality } from "./materials";
import { preloadProduct, useProductLayout } from "./models";
import type { ViewerControls } from "./ProductViewer";
import { FirstFrame, WarmGate } from "./warmup";

const DPR_STEPS = [1.75, 1.5, 1.25, 1];
const LIFT = 0.16;

type Props = {
  product: TapProduct;
  tier: "high" | "mid";
  anisotropy: number;
  active: boolean;
  reduced: boolean;
  controlsRef: RefObject<ViewerControls>;
  pacer: Pacer;
  onReady: (product: TapProduct) => void;
};

export default function ViewerCanvas(props: Props) {
  const { tier, active, reduced, pacer } = props;
  const [dprIndex, setDprIndex] = useState(tier === "high" ? 0 : 1);
  const [degraded, setDegraded] = useState(false);
  const quality: Quality = tier === "high" && !degraded ? "high" : "mid";
  // frameloop "never" until every shader is linked in the background (warmup.ts) — no first-render stall
  const [warm, setWarm] = useState(false);
  const layoutRef = useRef<object | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const isReady = useCallback(() => !!layoutRef.current && !!sceneRef.current?.environment, []);

  useEffect(() => preloadProduct(props.product), [props.product]);

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
      camera={{ fov: 28, near: 0.05, far: 60, position: [0, 1.2, 6] }}
      onCreated={({ gl, scene }) => {
        gl.setClearColor(0x000000, 0);
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.12;
        sceneRef.current = scene;
      }}
      style={{ position: "absolute", inset: 0, touchAction: "pan-y" }}
    >
      <WarmGate isReady={isReady} onWarm={() => setWarm(true)} />
      {warm ? <FirstFrame /> : null}
      <RenderDriver active={active} pacer={pacer} idleFps={reduced ? 0.01 : quality === "high" ? 60 : 30} />
      <PerfGuard
        pacer={pacer}
        onSlow={() => {
          if (dprIndex < DPR_STEPS.length - 1) setDprIndex((i) => i + 1);
          else setDegraded(true);
        }}
      />
      <StudioEnvironment mood="studio" />
      <ambientLight intensity={0.16} />
      <spotLight position={[2.6, 6.5, 5]} angle={0.45} penumbra={1} intensity={70} decay={2} color="#fff5ec" />
      <pointLight position={[-2.2, 2.6, -3.6]} color={COLORS.violet2} intensity={14} decay={2} distance={12} />
      <pointLight position={[2.6, 1.4, -3.6]} color={COLORS.violet} intensity={9} decay={2} distance={12} />
      <Suspense fallback={null}>
        <ViewerModel key={props.product} {...props} quality={quality} layoutRef={layoutRef} />
      </Suspense>
    </Canvas>
  );
}

function ViewerModel({
  product,
  anisotropy,
  quality,
  controlsRef,
  reduced,
  pacer,
  onReady,
  layoutRef,
}: Props & { quality: Quality; layoutRef: RefObject<object | null> }) {
  const layout = useProductLayout(product, quality, anisotropy);
  const spec = PRODUCTS[product];
  const pivot = useRef<THREE.Group>(null);
  const bob = useRef<THREE.Group>(null);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const shown = useRef({ yaw: 0, pitch: 0, inited: false, swaying: false, swayT: 0 });
  const restYaw = spec.kind === "stand" ? 0.42 : 0.36;
  const restPitch = spec.kind === "stand" ? 0 : -0.12;
  const H = layout.size.y;

  // Fit the product's silhouette (it only sways ±35° when idle, so width/height drive the framing).
  useLayoutEffect(() => {
    const aspect = size.width / Math.max(1, size.height);
    const vt = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const w = Math.max(layout.size.x, layout.size.z) * 1.3;
    const h = layout.size.y * 1.32 + LIFT;
    // The L stand's printed face stands in front of its turntable axis (the base runs behind it): back off by that
    // much so the face — not the axis — gets this framing and never crowds the frame when it swings forward.
    const near = layout.tap.z > 0.1 ? layout.tap.z * Math.cos(restYaw) : 0;
    const d = Math.max(h / 2 / vt, w / 2 / (vt * aspect)) + near;
    const cy = LIFT + H / 2 - H * 0.04;
    const elev = 0.1;
    camera.position.set(0, cy + Math.sin(elev) * d, Math.cos(elev) * d);
    camera.lookAt(0, cy, 0);
    camera.updateProjectionMatrix();
    bump(pacer, 300);
  }, [size, camera, layout, H, restYaw, pacer]);

  useLayoutEffect(() => {
    layoutRef.current = layout;
    return () => {
      if (layoutRef.current === layout) layoutRef.current = null;
    };
  }, [layout, layoutRef]);

  useEffect(() => {
    const c = controlsRef.current;
    if (!shown.current.inited) {
      c.yaw = restYaw;
      c.pitch = restPitch;
      shown.current = { yaw: restYaw, pitch: restPitch, inited: true, swaying: false, swayT: 0 };
    }
    bump(pacer, 1600);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout]);

  // Ready once this model has actually been drawn (frames only run after the warm gate opened).
  const reported = useRef(false);

  useFrame((state, delta) => {
    if (!reported.current) {
      reported.current = true;
      requestAnimationFrame(() => onReady(product));
    }
    const dt = Math.min(delta, 0.05);
    const c = controlsRef.current;
    const s = shown.current;
    const now = performance.now();
    if (!c.dragging) {
      c.velocity *= Math.exp(-dt * 2.4);
      if (Math.abs(c.velocity) > 0.002) c.yaw += c.velocity * dt;
      const idle = now - c.lastInput;
      if (!reduced && idle > 2600 && Math.abs(c.velocity) < 0.05) {
        // showcase sway around the 3/4 front view (the printed face is the product)
        if (!s.swaying) {
          s.swaying = true;
          s.swayT = 0;
          const turn = Math.PI * 2;
          c.yaw = restYaw + ((((c.yaw - restYaw) % turn) + turn * 1.5) % turn) - turn / 2;
          s.yaw = c.yaw;
        }
        s.swayT += dt;
        const ramp = Math.min(1, s.swayT / 2.5);
        const target = restYaw + Math.sin(s.swayT * 0.45) * 0.5;
        c.yaw += (target - c.yaw) * (1 - Math.exp(-dt * 1.4 * ramp));
      } else {
        s.swaying = false;
      }
      c.pitch += (restPitch - c.pitch) * (1 - Math.exp(-dt * 1.6));
    } else {
      s.swaying = false;
    }
    const k = 1 - Math.exp(-dt * 12);
    s.yaw += (c.yaw - s.yaw) * k;
    s.pitch += (c.pitch - s.pitch) * k;
    if (pivot.current) pivot.current.rotation.set(s.pitch, s.yaw, 0);
    if (bob.current) bob.current.position.y = LIFT + (reduced ? 0 : Math.sin(state.clock.elapsedTime * 0.9) * 0.025);
  });

  return (
    <>
      <GlowPlane
        position={[0, LIFT + H * 0.55, -1.2]}
        scale={[Math.max(1.6, H * 1.5), Math.max(1.6, H * 1.5)]}
        intensity={0.3}
        falloff={5}
      />
      <group ref={bob} position-y={LIFT}>
        <group position-y={H / 2}>
          <group ref={pivot}>
            <group position-y={-H / 2}>
              <primitive object={layout.object} />
            </group>
          </group>
        </group>
      </group>
      <LightPool
        radius={Math.max(0.8, Math.max(layout.size.x, H) * 0.62)}
        y={0.002}
        intensity={0.75}
        ripple={reduced ? 0 : 0.6}
      />
      {quality === "high" ? (
        <ContactShadow
          position={[0, 0.001, 0]}
          opacity={0.55}
          scale={Math.max(2.4, H * 2.2)}
          blur={2.4}
          far={Math.max(1.2, H)}
          resolution={256}
          color="#05030f"
          frames={reduced ? 2 : Infinity}
        />
      ) : (
        <BlobShadow radius={Math.max(0.8, layout.size.x * 0.75)} opacity={0.5} />
      )}
    </>
  );
}
