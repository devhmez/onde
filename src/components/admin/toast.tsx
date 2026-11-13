"use client";
// Toasts that slide in from the bottom-right (motion/react). useToast() works anywhere under <AdminProviders>.
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

type Kind = "ok" | "err" | "info";
type Toast = { id: number; kind: Kind; title: string; body?: string };
type Api = { push: (kind: Kind, title: string, body?: string) => void; ok: (t: string, b?: string) => void; err: (t: string, b?: string) => void; info: (t: string, b?: string) => void };

const Ctx = createContext<Api | null>(null);

export function useToast(): Api {
  const api = useContext(Ctx);
  if (!api) throw new Error("useToast must be used inside <AdminProviders>");
  return api;
}

export function AdminProviders({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (kind: Kind, title: string, body?: string) => {
      const id = ++seq.current;
      setToasts((t) => [...t.slice(-3), { id, kind, title, body }]);
      window.setTimeout(() => dismiss(id), kind === "err" ? 7000 : 4200);
    },
    [dismiss],
  );
  const api = useMemo<Api>(
    () => ({
      push,
      ok: (t, b) => push("ok", t, b),
      err: (t, b) => push("err", t, b),
      info: (t, b) => push("info", t, b),
    }),
    [push],
  );

  return (
    <MotionConfig reducedMotion="user">
      <Ctx.Provider value={api}>
        {children}
        <div className="toasts" role="region" aria-label="Notifications" aria-live="polite">
          <AnimatePresence initial={false}>
            {toasts.map((t) => (
              <motion.div
                key={t.id}
                layout
                className={`toast ${t.kind}`}
                role={t.kind === "err" ? "alert" : "status"}
                initial={{ opacity: 0, x: 40, scale: 0.96 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 40, transition: { duration: 0.2 } }}
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
                onClick={() => dismiss(t.id)}
              >
                <span className="ti" aria-hidden>
                  {t.kind === "ok" ? "✓" : t.kind === "err" ? "!" : "i"}
                </span>
                <div>
                  <b>{t.title}</b>
                  {t.body ? <div className="muted">{t.body}</div> : null}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </Ctx.Provider>
    </MotionConfig>
  );
}
