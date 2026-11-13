import "server-only";
// What the /[locale]/inactive page needs about a smart-link code: why it could not redirect, and which product it is
// (so a stock review stand reads "Ce présentoir ONDE n'est pas encore activé"). Cached per request: generateMetadata
// and the page share one lookup. Never throws — a DB hiccup falls back to the generic "not activated" copy.
import { cache } from "react";
import type { TagState } from "./data";
import type { InactiveDict } from "./types";

export type InactiveProduct = keyof InactiveDict["products"];
const PRODUCTS: readonly string[] = ["stand", "card", "keychain", "sticker"] satisfies InactiveProduct[];

export const loadInactiveTag = cache(async (code: string | null): Promise<{ state: TagState; kind: InactiveProduct | null }> => {
  if (!code) return { state: "inactive", kind: null };
  try {
    const { resolveTag } = await import("@/server/tags");
    const r = await resolveTag(code);
    const kind = r.kind && PRODUCTS.includes(r.kind) ? (r.kind as InactiveProduct) : null;
    if (r.status === "missing") return { state: "unknown", kind: null };
    if (r.status === "disabled") return { state: "paused", kind };
    return { state: r.url ? "active" : "inactive", kind };
  } catch (err) {
    console.warn("[pages] tag state unavailable, using defaults:", err instanceof Error ? err.message : err);
    return { state: "inactive", kind: null };
  }
});
