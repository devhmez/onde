import fr from "../../../messages/fr/tapstory.json";
import en from "../../../messages/en/tapstory.json";

export type TapStoryDict = typeof fr;
export type ThreeLocale = "fr" | "en";

const BUNDLED: Record<ThreeLocale, TapStoryDict> = { fr, en };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function merge<T>(base: T, patch: unknown): T {
  if (!isRecord(base) || !isRecord(patch)) return (typeof patch === typeof base ? patch : base) as T;
  const out: Record<string, unknown> = { ...base };
  for (const key of Object.keys(base)) {
    if (key in patch) out[key] = merge((base as Record<string, unknown>)[key], patch[key]);
  }
  return out as T;
}

/**
 * Accepts either the whole dictionary from getDictionary(locale) (uses `.tapstory`) or the tapstory namespace
 * itself. Missing keys fall back to the bundled messages/<locale>/tapstory.json, so the UI never renders blanks.
 */
export function resolveTapDict(dict: unknown, locale: string): TapStoryDict {
  const base = BUNDLED[locale === "en" ? "en" : "fr"];
  if (!isRecord(dict)) return base;
  const ns = isRecord(dict.tapstory) ? dict.tapstory : dict;
  return merge(base, ns);
}

export function bundledTapDict(locale: string): TapStoryDict {
  return BUNDLED[locale === "en" ? "en" : "fr"];
}
