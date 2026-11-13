// Minimal, dependency-free user-agent helpers (device class for tap/page-view analytics + bot detection).
export type DeviceClass = "ios" | "android" | "desktop" | "other";

// Named crawlers / link-preview fetchers / HTTP libraries. Deliberately avoids a bare "bot" match so phone models
// such as "CUBOT" are not misclassified.
const BOT_NAMES_RE =
  /googlebot|google-inspectiontool|googleother|adsbot|mediapartners|bingbot|bingpreview|applebot|duckduckbot|yandexbot|baiduspider|slurp|facebookexternalhit|facebookcatalog|meta-externalagent|whatsapp\/|telegrambot|discordbot|slackbot|slack-imgproxy|skypeuripreview|linkedinbot|pinterestbot|twitterbot|redditbot|embedly|vkshare|quora link preview|ahrefsbot|semrushbot|mj12bot|dotbot|petalbot|bytespider|gptbot|chatgpt-user|oai-searchbot|claudebot|claude-web|ccbot|perplexitybot|amazonbot|lighthouse|pagespeed|gtmetrix|headlesschrome|phantomjs|puppeteer|playwright|python-requests|python-urllib|aiohttp|httpx|go-http-client|okhttp|java\/|curl\/|wget\/|libwww|httpclient|axios\/|node-fetch|undici|uptimerobot|pingdom|statuscake|site24x7|better ?uptime/i;
const BOT_GENERIC_RE = /bot\/|crawler|spider|\+https?:\/\/|compatible;[^)]*(?:bot|crawl|preview)/i;

/** True for crawlers, link-preview fetchers (WhatsApp, Messenger, Telegram…), monitors and HTTP libraries. */
export function isBot(ua: string | null | undefined): boolean {
  if (!ua) return true; // real browsers always send a UA
  return BOT_NAMES_RE.test(ua) || BOT_GENERIC_RE.test(ua);
}

/** Classify a user agent: iPhone/iPad/iPod → ios, Android → android, Windows/macOS/Linux/ChromeOS → desktop. */
export function parseDevice(ua: string | null | undefined): DeviceClass {
  if (!ua) return "other";
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/android/i.test(ua)) return "android";
  if (/windows nt|macintosh|mac os x|cros|x11|linux/i.test(ua)) {
    // Mobile Linux variants that are neither Android nor desktop (KaiOS, Tizen, …)
    if (/kaios|tizen|mobile/i.test(ua) && !/macintosh|windows nt/i.test(ua)) return "other";
    return "desktop";
  }
  return "other";
}
