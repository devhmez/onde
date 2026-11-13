"use client";

import {
  Suspense,
  lazy,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { PRODUCTS, type TapProduct } from "./config";
import { bundledTapDict } from "./dict";
import { CanvasBoundary } from "./boundary";
import {
  bump,
  hold,
  release,
  useDeviceProfile,
  useInView,
  usePageVisible,
  useReducedMotion,
  type Pacer,
} from "./hooks";
import styles from "./three.module.css";

const ViewerCanvas = lazy(() => import("./ViewerCanvas"));
const noopSubscribe = () => () => {};

export type ProductViewerProps = {
  product: TapProduct;
  className?: string;
  /** Accessible name. Defaults to the localized "<product>, 3D view" label (locale from `locale` or <html lang>). */
  alt?: string;
  /** Drag hint text. Defaults to the localized "Drag to rotate". */
  hint?: string;
  locale?: string;
  /** Show the product still while the model loads (default true). */
  poster?: boolean;
  onReady?: () => void;
};

/** Shared, mutable drag state (written by DOM pointer handlers, read by the render loop). */
export type ViewerControls = {
  yaw: number;
  pitch: number;
  velocity: number;
  dragging: boolean;
  lastInput: number;
};

/**
 * Drag-to-rotate 3D product viewer with inertia and idle auto-rotation, clear-acrylic reflections and studio lighting.
 * Horizontal drags rotate (vertical swipes still scroll the page on touch), arrow keys rotate when focused.
 */
export default function ProductViewer({
  product,
  className,
  alt,
  hint,
  locale,
  poster = true,
  onReady,
}: ProductViewerProps) {
  const device = useDeviceProfile();
  const reduced = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const inView = useInView(rootRef, "150px 0px");
  const pageVisible = usePageVisible();
  const kbdId = useId();
  const [readyFor, setReadyFor] = useState<TapProduct | null>(null);
  const [failed, setFailed] = useState(false);
  const [interacted, setInteracted] = useState(false);
  const [dragging, setDragging] = useState(false);
  const pacer = useMemo<Pacer>(() => ({ busyUntil: 0 }), []);
  const controls = useRef<ViewerControls>({ yaw: 0, pitch: 0, velocity: 0, dragging: false, lastInput: 0 });
  const drag = useRef({ id: -1, x: 0, y: 0, t: 0 });

  const docLang = useSyncExternalStore(
    noopSubscribe,
    () => document.documentElement.lang || "fr",
    () => "fr",
  );
  const lang = locale ?? docLang;
  const t = bundledTapDict(lang).viewer;
  const label = alt ?? t.alt[product];
  const ready = readyFor === product;
  const use3D = !!device && device.webgl && device.tier !== "low" && !failed;

  useEffect(() => {
    if (ready) onReady?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const markInput = () => {
    controls.current.lastInput = performance.now();
    if (!interacted) setInteracted(true);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!use3D || (e.pointerType === "mouse" && e.button !== 0)) return;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() };
    controls.current.dragging = true;
    controls.current.velocity = 0;
    hold(pacer);
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDragging(true);
    markInput();
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!controls.current.dragging || e.pointerId !== d.id) return;
    const el = rootRef.current;
    const w = el?.clientWidth || 400;
    const h = el?.clientHeight || 400;
    const now = performance.now();
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    const dYaw = (dx / w) * Math.PI * 1.35;
    const c = controls.current;
    c.yaw += dYaw;
    c.pitch = Math.max(-0.42, Math.min(0.32, c.pitch + (dy / h) * 0.9));
    const dt = Math.max(8, now - d.t) / 1000;
    c.velocity = c.velocity * 0.4 + (dYaw / dt) * 0.6;
    drag.current = { id: d.id, x: e.clientX, y: e.clientY, t: now };
    c.lastInput = now;
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== drag.current.id) return;
    controls.current.dragging = false;
    if (performance.now() - drag.current.t > 80) controls.current.velocity = 0;
    drag.current.id = -1;
    release(pacer, 2600);
    setDragging(false);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const c = controls.current;
    let handled = true;
    if (e.key === "ArrowLeft") c.yaw -= 0.4;
    else if (e.key === "ArrowRight") c.yaw += 0.4;
    else if (e.key === "ArrowUp") c.pitch = Math.max(-0.42, c.pitch - 0.15);
    else if (e.key === "ArrowDown") c.pitch = Math.min(0.32, c.pitch + 0.15);
    else if (e.key === "Home") {
      c.yaw = 0;
      c.pitch = 0;
    } else handled = false;
    if (!handled) return;
    e.preventDefault();
    c.velocity = 0;
    markInput();
    bump(pacer, 1800);
  };

  return (
    <div
      ref={rootRef}
      className={[styles.viewer, className].filter(Boolean).join(" ")}
      role="group"
      aria-label={label}
      aria-describedby={use3D ? kbdId : undefined}
      aria-busy={use3D && !ready}
      tabIndex={use3D ? 0 : -1}
      data-dragging={dragging ? "true" : "false"}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
    >
      {poster || !use3D ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className={styles.poster}
          src={PRODUCTS[product].still}
          alt={use3D ? "" : label}
          data-hidden={use3D && ready ? "true" : "false"}
          decoding="async"
          draggable={false}
        />
      ) : null}
      {use3D && device ? (
        <>
          <div className={styles.canvasWrap} data-ready={ready ? "true" : "false"} aria-hidden="true">
            <CanvasBoundary onError={() => setFailed(true)}>
              <Suspense fallback={null}>
                <ViewerCanvas
                  product={product}
                  tier={device.tier === "high" ? "high" : "mid"}
                  anisotropy={device.maxAnisotropy}
                  active={inView && pageVisible}
                  reduced={reduced}
                  controlsRef={controls}
                  pacer={pacer}
                  onReady={(p) => setReadyFor(p)}
                />
              </Suspense>
            </CanvasBoundary>
          </div>
          <span className={styles.loadingRing} data-hidden={ready ? "true" : "false"} aria-hidden="true" />
          <span className={styles.srOnly} id={kbdId}>
            {ready ? t.keyboard : t.loading}
          </span>
          <span className={styles.viewerHint} data-hidden={!ready || interacted ? "true" : "false"} aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 12h16M4 12l3-3M4 12l3 3M20 12l-3-3M20 12l-3 3" />
            </svg>
            {hint ?? t.hint}
          </span>
        </>
      ) : null}
    </div>
  );
}
