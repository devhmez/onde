// Canonical admin origin. Every origin is a separate installable web app (and a separate push-notification identity on
// iPhone), so the dashboard must live on ONE origin: https://admin.onde.tn (Caddy already serves it, Host preserved).
// Pure (env + string parsing, no next/* or DB imports): also used by src/proxy.ts.
//
//   ADMIN_HOST=admin.onde.tn   explicit admin host
//   ADMIN_HOST= / ADMIN_HOST=off  no canonical host (no redirect)
//   (unset)                    "admin." + host of PUBLIC_BASE_URL, when that is a real public domain

const IPV4_RE = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const HOST_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/;

/** Lowercased hostname without port or trailing dot ("Onde.TN:443" → "onde.tn", "[::1]:8080" → "[::1]"). */
export function hostnameOf(hostHeader: string | null | undefined): string {
  const h = String(hostHeader ?? "").trim().toLowerCase();
  if (!h) return "";
  if (h.startsWith("[")) {
    const end = h.indexOf("]");
    return end > 0 ? h.slice(0, end + 1) : h;
  }
  return h.replace(/:\d*$/, "").replace(/\.$/, "");
}

/** True for a real public DNS name — not localhost / *.localhost, not an IP literal, not a single-label name. */
export function isPublicHostname(hostname: string): boolean {
  const h = hostnameOf(hostname);
  if (!h || h === "localhost" || h.endsWith(".localhost") || h.startsWith("[") || h.includes(":")) return false;
  if (IPV4_RE.test(h)) return false;
  return HOST_RE.test(h);
}

function hostFromConfig(raw: string): string | null {
  let v = raw.trim().toLowerCase();
  if (!v) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//.test(v)) {
    try {
      v = new URL(v).host;
    } catch {
      return null;
    }
  }
  v = hostnameOf(v.split("/")[0]);
  return isPublicHostname(v) ? v : null;
}

/**
 * The canonical admin host ("admin.onde.tn"), or null when there is none (local development, IP access, disabled).
 * Read at call time so the same build works with any environment.
 */
export function adminHost(): string | null {
  const explicit = process.env.ADMIN_HOST;
  if (explicit !== undefined) {
    const v = explicit.trim().toLowerCase();
    if (v === "" || v === "off" || v === "false" || v === "0") return null;
    return hostFromConfig(v);
  }
  let base: string;
  try {
    base = new URL(process.env.PUBLIC_BASE_URL?.trim() || "https://onde.tn").hostname.toLowerCase();
  } catch {
    return null;
  }
  if (!isPublicHostname(base) || base.startsWith("admin.")) return null;
  return `admin.${base.replace(/^www\./, "")}`;
}

/** "https://admin.onde.tn" — or null when no canonical admin host is configured. */
export function adminOrigin(): string | null {
  const h = adminHost();
  return h ? `https://${h}` : null;
}

/** True when the request's Host is the canonical admin host ("/" there means the dashboard). */
export function isAdminHost(hostHeader: string | null | undefined): boolean {
  const target = adminHost();
  return target !== null && hostnameOf(hostHeader) === target;
}

/**
 * Where an admin page request must be sent (308), or null to serve it here. Only GET/HEAD page loads on a public host
 * that is not the admin host are moved; APIs, server actions (POST), localhost / IP access (health checks, SSH tunnel)
 * and requests already on the admin host are never redirected, so there is no loop.
 */
export function canonicalAdminRedirect(input: { method: string; host: string | null; pathname: string; search: string }): string | null {
  if (input.method !== "GET" && input.method !== "HEAD") return null;
  if (input.pathname !== "/admin" && !input.pathname.startsWith("/admin/")) return null;
  const target = adminHost();
  if (!target) return null;
  const host = hostnameOf(input.host);
  if (!isPublicHostname(host) || host === target) return null;
  return `https://${target}${input.pathname}${input.search}`;
}
