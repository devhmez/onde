"use client";
// Product page stage: real-time 3D viewer (drag / auto-rotate, clear-acrylic reflections) in a pool of violet light, with a
// 3D ⇄ Photo switch. The still image is the loading state and the fallback (no WebGL, low-power device, load error).
// The canvas is unmounted while far off-screen so only one WebGL context is alive at a time on the page.
import dynamic from "next/dynamic";
import { motion, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import clsx from "clsx";
import type { Locale } from "@/i18n/config";
import type { StoryProduct } from "./catalog";
import { getShopMessages } from "./messages";
import ErrorBoundary from "./ErrorBoundary";
import ProductImage from "./ProductImage";
import { CubeIcon, ImageIcon } from "./Icons";

// The loading state renders where the viewer will appear, so it can read this product's still from context.
const StillContext = createContext<ReactNode>(null);
function StillWhileLoading() {
  return <>{useContext(StillContext)}</>;
}
const ProductViewer = dynamic(() => import("@/components/three/ProductViewer"), {
  ssr: false,
  loading: StillWhileLoading,
});

type Props = { model: StoryProduct; image: string; alt: string; locale: Locale; label?: string };

let webglCache: boolean | null = null;
function detectWebGL(): boolean {
  if (webglCache !== null) return webglCache;
  try {
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl2") || c.getContext("webgl")) as WebGLRenderingContext | null;
    webglCache = !!gl;
    gl?.getExtension("WEBGL_lose_context")?.loseContext(); // free the probe context right away
  } catch {
    webglCache = false;
  }
  return webglCache;
}
function lowPower(): boolean {
  const n = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  return !!n.connection?.saveData || (n.deviceMemory ?? 8) <= 2 || (n.hardwareConcurrency ?? 8) <= 2;
}
const noop = () => () => {};

export default function ProductStage({ model, image, alt, locale, label }: Props) {
  const t = getShopMessages(locale).product;
  const reduce = useReducedMotion();
  const capable = useSyncExternalStore(noop, () => detectWebGL() && !lowPower(), () => false);
  const [choice, setChoice] = useState<"3d" | "photo" | null>(null);
  const [failed, setFailed] = useState(false);
  const [near, setNear] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const mode: "3d" | "photo" = choice ?? (capable && !failed ? "3d" : "photo");
  const show3d = mode === "3d" && capable && !failed;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setNear(e.isIntersecting), { rootMargin: "300px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // photo-mode parallax
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const sx = useSpring(px, { stiffness: 120, damping: 18 });
  const sy = useSpring(py, { stiffness: 120, damping: 18 });
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (reduce || e.pointerType !== "mouse" || show3d || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    px.set(((e.clientX - r.left) / r.width - 0.5) * 16);
    py.set((0.5 - (e.clientY - r.top) / r.height) * 12);
  };

  // Photo mode: floating still with cursor parallax.
  const still = (
    <motion.div className="absolute inset-[8%]" style={{ rotateY: sx, rotateX: sy, transformPerspective: 900 }}>
      <motion.div
        className="relative size-full"
        animate={reduce ? undefined : { y: [0, -12, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      >
        <ProductImage
          src={image}
          alt={alt}
          fill
          preload
          sizes="(min-width: 1024px) 50vw, 92vw"
          className="object-contain drop-shadow-[0_40px_50px_rgba(0,0,0,0.6)]"
        />
      </motion.div>
    </motion.div>
  );
  // While the 3D chunk loads: same framing as the viewer's own poster, so the hand-off is seamless.
  const loadingStill = (
    <div className="absolute inset-0">
      <ProductImage src={image} alt={alt} fill sizes="(min-width: 1024px) 50vw, 92vw" className="object-contain" />
    </div>
  );

  return (
    <div
      ref={ref}
      id="product-stage"
      data-fly-source
      onPointerMove={onMove}
      onPointerLeave={() => {
        px.set(0);
        py.set(0);
      }}
      className="relative isolate aspect-square w-full overflow-hidden rounded-[36px] border border-white/[0.07] bg-[radial-gradient(120%_90%_at_50%_100%,#1a1340_0%,#0b0a10_55%,#050407_100%)]"
    >
      {/* light pool + NFC rings */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-[10%] bottom-[8%] -z-10 h-[30%] rounded-[50%] bg-violet/45 blur-[60px]" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-[28%] bottom-[12%] -z-10 h-[6%] rounded-[50%] bg-violet-3/50 blur-xl" />
      <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-[46%] -z-10 size-0">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="absolute left-1/2 top-1/2 size-[70%] min-h-64 min-w-64 -translate-x-1/2 -translate-y-1/2 rounded-full border border-violet-2/25"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={reduce ? { scale: 0.8 + i * 0.35, opacity: 0.35 } : { scale: [0.6, 2.2], opacity: [0.55, 0] }}
            transition={reduce ? { duration: 0 } : { duration: 4.5, repeat: Infinity, delay: i * 1.5, ease: "easeOut" }}
          />
        ))}
      </div>
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-1/3 bg-gradient-to-t from-black/40 to-transparent" />

      {show3d && near ? (
        <ErrorBoundary fallback={still} onError={() => setFailed(true)}>
          <StillContext.Provider value={loadingStill}>
            <div className="absolute inset-0">
              <ProductViewer product={model} locale={locale} alt={label ?? alt} hint={t.viewerHint} className="size-full" />
            </div>
          </StillContext.Provider>
        </ErrorBoundary>
      ) : (
        still
      )}

      {/* mode switch */}
      {capable && !failed && (
        <div
          role="group"
          aria-label={t.viewerModes}
          className="absolute right-4 top-4 z-10 flex rounded-full border border-white/10 bg-ink/60 p-1 backdrop-blur-md"
        >
          {(["3d", "photo"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setChoice(m)}
              className={clsx(
                "relative inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold transition-colors",
                "focus-visible:outline-2 focus-visible:outline-violet-2",
                mode === m ? "text-white" : "text-muted hover:text-text",
              )}
            >
              {mode === m && (
                <motion.span
                  layoutId="stage-mode"
                  className="absolute inset-0 -z-10 rounded-full bg-violet"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              {m === "3d" ? <CubeIcon size={15} /> : <ImageIcon size={15} />}
              {m === "3d" ? t.viewer3d : t.viewerPhoto}
            </button>
          ))}
        </div>
      )}

    </div>
  );
}
