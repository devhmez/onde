"use client";
// Offer cards with micro-stories: delivery meter fills to the free threshold, the returning-customer price
// gets struck and drops, the cash-on-delivery stamp lands. Plays when scrolled into view (static if reduced).
import { useRef } from "react";
import { gsap, useGSAP, registerGsap, prefersReducedMotion } from "@/lib/motion";

export type OfferCardsData = {
  delivery: { title: string; body: string; badge: string; done: string; from: string; to: string };
  returning: { title: string; body: string; badge: string; example: string; before: string; after: string; pct: string };
  cod: { title: string; body: string; badge: string; paid: string };
};

export default function OfferCards({ data }: { data: OfferCardsData }) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      registerGsap();
      const q = gsap.utils.selector(el);
      if (prefersReducedMotion()) {
        gsap.set(q(".offer-meter"), { scaleX: 1 });
        gsap.set(q(".offer-truck"), { left: "100%" });
        gsap.set(q(".offer-done, .offer-after, .offer-stamp"), { opacity: 1, scale: 1, y: 0 });
        gsap.set(q(".offer-strike"), { scaleX: 1 });
        return;
      }
      gsap.from(q(".offer-card"), {
        y: 60,
        opacity: 0,
        duration: 1.2,
        stagger: 0.12,
        ease: "onde.expo",
        scrollTrigger: { trigger: el, start: "top 82%", once: true },
      });
      const tl = gsap.timeline({ scrollTrigger: { trigger: el, start: "top 70%", once: true }, delay: 0.3 });
      tl.fromTo(q(".offer-meter"), { scaleX: 0 }, { scaleX: 1, duration: 1.6, ease: "power2.inOut" }, 0)
        .fromTo(q(".offer-truck"), { left: "0%" }, { left: "100%", duration: 1.6, ease: "power2.inOut" }, 0)
        .fromTo(q(".offer-done"), { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.6, ease: "back.out(2.6)" }, 1.55)
        .fromTo(q(".offer-strike"), { scaleX: 0 }, { scaleX: 1, duration: 0.5, ease: "power3.inOut" }, 0.5)
        .fromTo(q(".offer-after"), { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.7, ease: "onde.expo" }, 0.85)
        .fromTo(
          q(".offer-stamp"),
          { opacity: 0, scale: 1.8, rotate: -22 },
          { opacity: 1, scale: 1, rotate: -8, duration: 0.55, ease: "back.out(1.6)" },
          1.1,
        );
    },
    { scope: ref },
  );

  const { delivery, returning, cod } = data;

  return (
    <div ref={ref} className="grid gap-4 md:grid-cols-3">
      {/* Free delivery */}
      <article className="offer-card relative flex flex-col overflow-hidden rounded-[28px] border border-white/[0.07] bg-panel/70 p-7 md:p-8">
        <p className="w-fit rounded-full bg-violet/20 px-3 py-1 text-[0.72rem] font-semibold text-violet-3">{delivery.badge}</p>
        <h3 className="text-display mt-6 text-[clamp(1.7rem,2.6vw,2.2rem)]">{delivery.title}</h3>
        <p className="mt-3 text-[0.95rem] leading-relaxed text-muted">{delivery.body}</p>
        <div className="mt-auto pt-10" aria-hidden="true">
          <div className="relative h-10">
            <span className="offer-truck absolute bottom-3 -translate-x-1/2 text-violet-3" style={{ left: "0%" }}>
              <svg viewBox="0 0 32 20" className="h-5 w-8">
                <path d="M2 3h17v11H2zM19 7h6l4 4v3h-10z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                <circle cx="8" cy="16" r="2.4" fill="#050407" stroke="currentColor" strokeWidth="1.8" />
                <circle cx="24" cy="16" r="2.4" fill="#050407" stroke="currentColor" strokeWidth="1.8" />
              </svg>
            </span>
          </div>
          <div className="relative h-2 overflow-hidden rounded-full bg-white/[0.07]">
            <span className="offer-meter absolute inset-0 origin-left rounded-full bg-gradient-to-r from-violet to-ok" style={{ transform: "scaleX(0)" }} />
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-muted">
            <span>{delivery.from}</span>
            <span className="offer-done inline-flex items-center gap-1 rounded-full bg-ok/15 px-2.5 py-1 font-semibold text-ok opacity-0">
              ✓ {delivery.done}
            </span>
            <span className="font-semibold text-text">{delivery.to}</span>
          </div>
        </div>
      </article>

      {/* Returning customer */}
      <article className="offer-card relative flex flex-col overflow-hidden rounded-[28px] border border-violet-2/30 bg-gradient-to-b from-violet/25 to-panel/70 p-7 md:p-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full blur-3xl"
          style={{ background: "rgb(123 92 255 / 0.35)" }}
        />
        <p className="relative w-fit rounded-full bg-white/10 px-3 py-1 text-[0.72rem] font-semibold text-text">{returning.badge}</p>
        <h3 className="text-display relative mt-6 text-[clamp(1.7rem,2.6vw,2.2rem)]">{returning.title}</h3>
        <p className="relative mt-3 text-[0.95rem] leading-relaxed text-text/70">{returning.body}</p>
        <div className="relative mt-auto flex items-end gap-4 pt-10" aria-hidden="true">
          <div className="flex flex-col">
            <span className="text-[0.68rem] uppercase tracking-[0.2em] text-muted">{returning.example}</span>
            <span className="relative mt-1 w-fit font-display text-2xl font-semibold text-text/50">
              {returning.before}
              <span className="offer-strike absolute left-[-4%] top-1/2 h-[2px] w-[108%] origin-left bg-off" style={{ transform: "scaleX(0)" }} />
            </span>
          </div>
          <span className="offer-after font-display text-[2.6rem] font-bold leading-none tracking-[-0.03em] text-text opacity-0">
            {returning.after}
          </span>
          <span className="offer-after mb-1 rounded-full bg-ok/15 px-2.5 py-1 text-xs font-bold text-ok opacity-0">−{returning.pct}</span>
        </div>
      </article>

      {/* Cash on delivery */}
      <article className="offer-card relative flex flex-col overflow-hidden rounded-[28px] border border-white/[0.07] bg-panel/70 p-7 md:p-8">
        <p className="w-fit rounded-full bg-violet/20 px-3 py-1 text-[0.72rem] font-semibold text-violet-3">{cod.badge}</p>
        <h3 className="text-display mt-6 text-[clamp(1.7rem,2.6vw,2.2rem)]">{cod.title}</h3>
        <p className="mt-3 text-[0.95rem] leading-relaxed text-muted">{cod.body}</p>
        <div className="relative mt-auto flex h-28 items-end pt-10" aria-hidden="true">
          <div className="relative h-20 w-36 rounded-xl border border-white/10 bg-gradient-to-br from-panel-2 to-ink p-3">
            <span className="block h-1.5 w-16 rounded bg-white/15" />
            <span className="mt-2 block h-1.5 w-24 rounded bg-white/10" />
            <span className="mt-2 block h-1.5 w-12 rounded bg-white/10" />
            <svg viewBox="0 0 24 24" className="absolute bottom-3 right-3 h-6 w-6 text-ok">
              <rect x="2.5" y="6" width="19" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
              <circle cx="12" cy="12" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
            </svg>
          </div>
          <span className="offer-stamp absolute bottom-6 left-24 rounded-lg border-2 border-ok px-3 py-1.5 text-xs font-extrabold uppercase tracking-[0.14em] text-ok opacity-0">
            {cod.paid}
          </span>
        </div>
      </article>
    </div>
  );
}
