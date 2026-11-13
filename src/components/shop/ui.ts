// Shared shop class recipes (plain strings so Tailwind picks them up).

/** Same width/gutters as the site nav (max 90rem, clamp(1rem, 4vw, 3rem) side padding). */
export const CONTAINER = "mx-auto w-full max-w-[90rem] px-[clamp(1rem,4vw,3rem)]";

export const EYEBROW = "text-[0.72rem] font-semibold uppercase leading-tight tracking-[0.32em] text-violet-3";

export const BTN_PRIMARY =
  "relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-full bg-violet font-semibold text-white " +
  "shadow-[0_14px_44px_-14px_rgba(70,28,247,0.95),inset_0_1px_0_rgba(255,255,255,0.22)] transition-colors duration-300 " +
  "hover:bg-[#5530ff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-2 " +
  "disabled:cursor-not-allowed disabled:opacity-60";

export const BTN_GHOST =
  "inline-flex items-center justify-center gap-2 rounded-full border border-white/12 bg-white/[0.04] font-semibold text-text " +
  "backdrop-blur transition-colors duration-300 hover:border-white/25 hover:bg-white/[0.08] " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-2";
