"use client";
// 3D tilt-on-hover wrapper with a moving glare highlight (fine pointers only, reduced-motion safe).
import { useRef, type ReactNode, type PointerEvent as ReactPointerEvent } from "react";
import clsx from "clsx";
import { gsap, isFinePointer, prefersReducedMotion } from "@/lib/motion";

export default function TiltCard({ children, className, max = 7 }: { children: ReactNode; className?: string; max?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const glareRef = useRef<HTMLDivElement>(null);

  const enabled = () => isFinePointer() && !prefersReducedMotion();

  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse" || !enabled()) return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    gsap.to(el, {
      rotateY: (px - 0.5) * 2 * max,
      rotateX: -(py - 0.5) * 2 * max,
      transformPerspective: 900,
      duration: 0.5,
      ease: "power3.out",
      overwrite: "auto",
    });
    if (glareRef.current) {
      glareRef.current.style.opacity = "1";
      glareRef.current.style.background = `radial-gradient(420px circle at ${px * 100}% ${py * 100}%, rgb(140 123 255 / 0.18), transparent 55%)`;
    }
  };

  const onLeave = () => {
    const el = ref.current;
    if (!el) return;
    gsap.to(el, { rotateX: 0, rotateY: 0, duration: 0.9, ease: "elastic.out(1, 0.5)", overwrite: "auto" });
    if (glareRef.current) glareRef.current.style.opacity = "0";
  };

  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      className={clsx("relative h-full [transform-style:preserve-3d]", className)}
    >
      {children}
      <div
        ref={glareRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-500"
      />
    </div>
  );
}
