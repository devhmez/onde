"use client";
// A tiny WhatsApp conversation that plays when scrolled into view: your prefilled message types itself,
// "ONDE is typing…", then the reply pops in. Reduced motion → the whole conversation, static.
import { useEffect, useRef, useState } from "react";
import { useInView } from "motion/react";
import clsx from "clsx";
import { useReducedMotionPref } from "../motion";
import { IconCheck } from "../icons";

export default function ChatPreview({ me, them, typing }: { me: string; them: string; typing: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -20% 0px" });
  const reduce = useReducedMotionPref();
  const [chars, setChars] = useState(0);
  const [stage, setStage] = useState<"idle" | "typing-me" | "sent" | "typing-them" | "done">("idle");
  const chars$ = Array.from(me);

  useEffect(() => {
    if (!inView || reduce) return;
    const timers: number[] = [];
    let i = 0;
    const start = window.setTimeout(() => {
      setStage("typing-me");
      const tick = () => {
        i += 1;
        setChars(i);
        if (i < chars$.length) timers.push(window.setTimeout(tick, 28 + Math.random() * 40));
        else {
          timers.push(window.setTimeout(() => setStage("sent"), 350));
          timers.push(window.setTimeout(() => setStage("typing-them"), 1000));
          timers.push(window.setTimeout(() => setStage("done"), 2300));
        }
      };
      tick();
    }, 400);
    timers.push(start);
    return () => timers.forEach((t) => window.clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, reduce, me]);

  const showAll = reduce;
  const typed = showAll ? me : chars$.slice(0, chars).join("");
  const sent = showAll || stage === "sent" || stage === "typing-them" || stage === "done";
  const replied = showAll || stage === "done";

  return (
    <div ref={ref} aria-hidden className="relative flex min-h-[188px] flex-col justify-end gap-2 rounded-3xl bg-[#0b141a]/80 p-4 ring-1 ring-white/5 [background-image:radial-gradient(rgba(255,255,255,.035)_1px,transparent_1px)] [background-size:14px_14px]">
      {(stage !== "idle" || showAll) && (
        <div className={clsx("max-w-[86%] self-end rounded-2xl rounded-tr-md px-3.5 py-2 text-sm leading-snug text-white shadow transition-colors duration-300", sent ? "bg-[#005c4b]" : "bg-[#005c4b]/70")}>
          <span>{typed}</span>
          {!sent ? <span className="op-caret ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 bg-white/80" /> : null}
          <span className="ml-2 inline-flex translate-y-0.5 items-center text-[10px] text-white/60">
            <IconCheck size={12} className={sent ? "text-[#53bdeb]" : "text-white/40"} />
            <IconCheck size={12} className={clsx("-ml-2", replied ? "text-[#53bdeb]" : sent ? "text-white/40" : "opacity-0")} />
          </span>
        </div>
      )}
      {stage === "typing-them" && !showAll ? (
        <div className="inline-flex items-center gap-2 self-start rounded-2xl rounded-tl-md bg-[#202c33] px-3.5 py-2.5 text-xs text-white/60">
          <span className="flex gap-1">
            {[0, 0.15, 0.3].map((d) => (
              <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/60" style={{ animationDelay: `${d}s` }} />
            ))}
          </span>
          {typing}
        </div>
      ) : null}
      {replied ? (
        <div className={clsx("max-w-[86%] self-start rounded-2xl rounded-tl-md bg-[#202c33] px-3.5 py-2 text-sm leading-snug text-white shadow", !reduce && "op-fade-up")}>{them}</div>
      ) : null}
    </div>
  );
}
