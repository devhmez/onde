// Messages of the client page (messages/<locale>/portal.json). The French file is the shape; src/i18n/contracts.ts
// makes `tsc` fail when the English file misses a key.
import type frPortal from "../../../messages/fr/portal.json";

export type PortalDict = typeof frPortal;

/** "{n} taps" → "12 taps". Unknown placeholders are left as they are. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? String(values[k]) : m));
}
