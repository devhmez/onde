#!/usr/bin/env node
// Tell IndexNow search engines (Bing, Yandex, Seznam, Naver, Yep…) which onde.tn pages are new or changed, so they
// crawl them within hours instead of weeks. Google does not use IndexNow: for Google, submit the sitemap in Search Console.
//
//   node scripts/indexnow.mjs                      # every URL of https://onde.tn/sitemap.xml
//   node scripts/indexnow.mjs --dry-run            # print what would be sent, send nothing
//   node scripts/indexnow.mjs https://onde.tn/fr/restaurants https://onde.tn/en/restaurants   # only these URLs
//   node scripts/indexnow.mjs --sitemap http://localhost:4000/sitemap.xml --dry-run          # read a local build's sitemap
//
// Options: --base <origin> (default: PUBLIC_BASE_URL or https://onde.tn) · --sitemap <url> (default: <base>/sitemap.xml)
// · --key <key> (default: INDEXNOW_KEY or the single public/<32 hex>.txt file) · --dry-run.
// The key file must be live first (https://onde.tn/<key>.txt answering the key): deploy, then run this script.
// Run it after a deploy that adds or changes pages; don't resubmit unchanged URLs again and again (engines throttle).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENDPOINT = "https://api.indexnow.org/indexnow";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const out = { base: process.env.PUBLIC_BASE_URL || "https://onde.tn", sitemap: "", key: process.env.INDEXNOW_KEY || "", dryRun: false, urls: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run" || a === "-n") out.dryRun = true;
    else if (a === "--base") out.base = argv[++i] ?? out.base;
    else if (a === "--sitemap") out.sitemap = argv[++i] ?? "";
    else if (a === "--key") out.key = argv[++i] ?? out.key;
    else if (a === "--help" || a === "-h") {
      const lines = fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1);
      console.log(lines.slice(0, lines.findIndex((l) => !l.startsWith("//"))).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
      process.exit(0);
    } else if (/^https?:\/\//.test(a)) out.urls.push(a);
    else {
      console.error(`Unknown argument: ${a} (see --help)`);
      process.exit(2);
    }
  }
  out.base = out.base.replace(/\/+$/, "");
  return out;
}

function findKey() {
  const dir = path.join(root, "public");
  const files = fs.readdirSync(dir).filter((f) => /^[a-f0-9]{32}\.txt$/i.test(f));
  if (files.length !== 1) {
    throw new Error(`Expected exactly one IndexNow key file public/<32 hex>.txt, found ${files.length}. Pass --key or INDEXNOW_KEY.`);
  }
  const key = fs.readFileSync(path.join(dir, files[0]), "utf8").trim();
  if (`${key}.txt` !== files[0]) throw new Error(`public/${files[0]} must contain exactly its own name without ".txt".`);
  return key;
}

async function sitemapUrls(sitemap) {
  const res = await fetch(sitemap, { headers: { "User-Agent": "onde-indexnow-script" } });
  if (!res.ok) throw new Error(`GET ${sitemap} → HTTP ${res.status}`);
  const xml = await res.text();
  // Only the page URLs (<loc>), not the image locations (<image:loc>) or the hreflang alternates (<xhtml:link>).
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim().replace(/&amp;/g, "&"));
}

const EXPLAIN = {
  200: "OK: URLs received.",
  202: "Accepted: URLs received, the key is still being validated.",
  400: "Bad request: invalid format.",
  403: "Forbidden: the key file was not found or does not match (is it deployed?).",
  422: "Unprocessable: some URLs don't belong to the host, or the key doesn't match the protocol.",
  429: "Too many requests: wait before resubmitting (possible spam signal).",
};

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const key = opts.key || findKey();
  if (!/^[a-zA-Z0-9-]{8,128}$/.test(key)) throw new Error("The IndexNow key must be 8-128 characters: a-z, A-Z, 0-9, '-'.");
  const host = new URL(opts.base).host;
  const keyLocation = `${opts.base}/${key}.txt`;

  const all = opts.urls.length ? opts.urls : await sitemapUrls(opts.sitemap || `${opts.base}/sitemap.xml`);
  const urlList = [...new Set(all)].filter((u) => {
    try {
      return new URL(u).host === host;
    } catch {
      return false;
    }
  });
  const skipped = all.length - urlList.length;
  console.log(`${urlList.length} URL(s) for ${host}${skipped ? ` (${skipped} skipped: other host or invalid)` : ""}`);
  if (!urlList.length) return;

  // The engines fetch the key file to check that we own the host: make sure it is live before submitting.
  try {
    const res = await fetch(keyLocation, { headers: { "User-Agent": "onde-indexnow-script" } });
    const body = res.ok ? (await res.text()).trim() : "";
    if (body !== key) console.warn(`Warning: ${keyLocation} → HTTP ${res.status}${res.ok ? " (content differs from the key)" : ""}. Deploy the key file first.`);
  } catch (err) {
    console.warn(`Warning: could not fetch ${keyLocation}: ${err instanceof Error ? err.message : err}`);
  }

  for (let i = 0; i < urlList.length; i += 10_000) {
    const batch = urlList.slice(i, i + 10_000);
    const payload = { host, key, keyLocation, urlList: batch };
    if (opts.dryRun) {
      console.log(`[dry run] POST ${ENDPOINT}`);
      console.log(JSON.stringify({ ...payload, urlList: batch.length > 12 ? [...batch.slice(0, 12), `… ${batch.length - 12} more`] : batch }, null, 2));
      continue;
    }
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload),
    });
    console.log(`IndexNow → HTTP ${res.status} ${EXPLAIN[res.status] ?? ""}`.trim());
    if (res.status >= 400) process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
