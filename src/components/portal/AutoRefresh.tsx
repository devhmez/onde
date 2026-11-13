"use client";
// Keeps the figures fresh: re-renders the page on the server every `everyMs` while it is visible, and at once when the
// phone comes back to it after that long (unlocked, back from another app). Nothing runs in a background tab. A
// refresh keeps what the visitor is doing (an open "Changer le lien" sheet, a location being typed): only the server
// figures change.
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function AutoRefresh({ everyMs }: { everyMs: number }) {
  const router = useRouter();
  useEffect(() => {
    let last = Date.now();
    let timer: number | undefined;
    const refresh = () => {
      last = Date.now();
      router.refresh();
    };
    const schedule = () => {
      window.clearTimeout(timer);
      if (document.visibilityState !== "visible") return;
      timer = window.setTimeout(
        () => {
          refresh();
          schedule();
        },
        Math.max(1000, everyMs - (Date.now() - last)),
      );
    };
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - last >= everyMs) refresh();
      schedule();
    };
    schedule();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, everyMs]);
  return null;
}
