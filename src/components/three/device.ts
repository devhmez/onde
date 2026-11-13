// Lightweight, network-free GPU/device tiering (detect-gpu style heuristics without its benchmark fetch).
//
//  high — desktop-class GPU: floor reflections, bloom, contact shadows, clearcoat prints.
//  mid  — phones/tablets, small viewports, modest GPUs: same 3D choreography, cheap materials, no post-processing.
//  low  — software renderers, very old GPUs, tiny memory/CPU, or no WebGL: video / still fallbacks.

export type Tier = "high" | "mid" | "low";

export type DeviceProfile = {
  tier: Tier;
  /** Touch-first or narrow (< 768 px) viewport. */
  mobile: boolean;
  webgl: boolean;
  /** Unmasked renderer string when the browser exposes it (lower-cased), else "". */
  renderer: string;
  /** Max texture anisotropy we will request. */
  maxAnisotropy: number;
};

const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|microsoft basic render|mesa offscreen|basic render driver/;
const WEAK_GPU =
  /mali-[24]\d\d|mali-t[0-8]\d\d|adreno \(tm\) [1-4]\d\d|adreno [1-4]\d\d|powervr sgx|powervr rogue g[56]\d\d|intel.*(gma|hd graphics [2-4]\d{3}|hd graphics$)|videocore|vivante/;

let cached: DeviceProfile | null = null;

type NavigatorExtras = Navigator & {
  deviceMemory?: number;
  connection?: { saveData?: boolean };
};

function probeWebGL(): { ok: boolean; renderer: string; maxAnisotropy: number } {
  try {
    const canvas = document.createElement("canvas");
    const gl =
      (canvas.getContext("webgl2", { failIfMajorPerformanceCaveat: true }) as WebGL2RenderingContext | null) ??
      (canvas.getContext("webgl", { failIfMajorPerformanceCaveat: true }) as WebGLRenderingContext | null);
    if (!gl) return { ok: false, renderer: "", maxAnisotropy: 1 };
    let renderer = String(gl.getParameter(gl.RENDERER) ?? "");
    // Firefox already returns a sanitized real renderer through RENDERER and warns on the debug extension.
    const isFirefox = /firefox/i.test(navigator.userAgent);
    if (!isFirefox && (!renderer || /webkit|mozilla/i.test(renderer))) {
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      if (ext) renderer = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) ?? renderer);
    }
    const aniso =
      gl.getExtension("EXT_texture_filter_anisotropic") ?? gl.getExtension("WEBKIT_EXT_texture_filter_anisotropic");
    const maxAnisotropy = aniso ? Number(gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)) || 1 : 1;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return { ok: true, renderer: renderer.toLowerCase(), maxAnisotropy };
  } catch {
    return { ok: false, renderer: "", maxAnisotropy: 1 };
  }
}

export function detectDevice(): DeviceProfile {
  if (cached) return cached;
  if (typeof window === "undefined") {
    return { tier: "low", mobile: false, webgl: false, renderer: "", maxAnisotropy: 1 };
  }
  const nav = navigator as NavigatorExtras;
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const narrow = window.innerWidth < 768;
  const mobile = coarse || narrow || /iphone|ipad|ipod|android/i.test(nav.userAgent);
  const cores = nav.hardwareConcurrency ?? 4;
  const memory = nav.deviceMemory ?? 8;
  const saveData = nav.connection?.saveData === true;

  const probe = probeWebGL();
  let tier: Tier = "high";
  if (!probe.ok) tier = "low";
  else if (SOFTWARE.test(probe.renderer) || WEAK_GPU.test(probe.renderer)) tier = "low";
  else if (cores <= 2 || memory < 2) tier = "low";
  else if (mobile || saveData || cores <= 4 || memory <= 4) tier = "mid";

  // QA override: ?onde3d=high|mid|low forces a tier (handy to review every fallback on one machine).
  const forced = new URLSearchParams(window.location.search).get("onde3d");
  if (forced === "high" || forced === "mid" || forced === "low") tier = forced;

  cached = {
    tier,
    mobile,
    webgl: probe.ok,
    renderer: probe.renderer,
    maxAnisotropy: Math.min(8, Math.max(1, probe.maxAnisotropy)),
  };
  return cached;
}

/** DPR range per tier — never above 1.75 (ARCHITECTURE §0.6). */
export function dprFor(tier: Tier): [number, number] {
  return tier === "high" ? [1, 1.75] : [1, 1.5];
}
