import "server-only";
// Messages live in /messages/<locale>/<namespace>.json — each feature owns its namespace file.
// getDictionary merges every namespace file for the locale into one object: dict.<namespace>.<key>
import fs from "node:fs/promises";
import path from "node:path";
import type { Locale } from "./config";

type Dict = Record<string, unknown>;
const cache = new Map<Locale, Dict>();

export async function getDictionary(locale: Locale): Promise<Dict> {
  if (process.env.NODE_ENV === "production" && cache.has(locale)) return cache.get(locale)!;
  const dir = path.join(process.cwd(), "messages", locale);
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json"));
  const dict: Dict = {};
  for (const f of files) dict[f.replace(/\.json$/, "")] = JSON.parse(await fs.readFile(path.join(dir, f), "utf8"));
  cache.set(locale, dict);
  return dict;
}
