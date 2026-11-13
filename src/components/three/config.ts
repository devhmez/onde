// Shared, framework-free configuration for every real-time 3D component.
//
// GLB facts this module relies on (parsed from the glTF JSON chunk of public/models/*.glb, Blender glTF I/O 5.2):
//  - Units are meters, Y-up. Every printed face is a separate primitive whose UV v=0 is the TOP of the artwork.
//  - stand_white / stand_black (the real 12 × 12 cm stand): ONE clear 3 mm acrylic sheet bent 90° into an L.
//    Root "WRoot"/"KRoot" at the origin (K* names = black variant). Children:
//      "WAcrylic" (identity) — the whole bent sheet, primitives AcrylicEdge (polished cut edges) + AcrylicBase
//        (panel faces, bend, base faces). Panel x ±0.06, y 0..0.12, front face z = +0.0015; base on y 0..0.003
//        running BEHIND the panel to z = -0.1185 (120 mm deep overall). Inner bend radius 2 mm, outer 5 mm.
//      "WPanel" t=(0, 0.06, 0.001625), quaternion (0.70711, 0, 0, 0.70711) = +90° about X — the opaque print layer
//        glued on the front face: WFront (artwork, clearcoat) on local +Y → world +Z, WBack (plain ink) behind it.
//    Printed face: plane z = 0.0017, normal exactly (0, 0, 1) (no lean), print x ±0.0585, y 0.0055..0.1185.
//    WFront UV covers the full 120 × 120 mm face: u = 0.5 + x/0.12, v = 1 - y/0.12 (v = 0 at the top).
//    "TAP HERE" icon centre: UV (0.5, 0.7722) → world (0, 0.02734, 0.0017).
//    BBox (-0.06, 0, -0.1185)..(0.06, 0.12, 0.0017): after useProductLayout's recentring at SCENE_SCALE the face sits at
//    z ≈ +0.6 scene units in front of the pivot and the base reaches back to z ≈ -0.6; the stand is 1.2 units tall.
//  - card / keychain / sticker lie flat in XZ, printed face on +Y, artwork top towards -Z
//    (the keychain ring "KeyRing" is at z = -0.0285). Rotating +90° about X stands them up facing +Z.
//    Sizes: card 0.0856 × 0.054, key tag 0.032 × 0.048 (+ ring Ø 0.0234), sticker Ø 0.036.
//  - phone: body "Phone" (Titanium / BackGlass / BlackGlass) 0.0722 × 0.15 × 0.0082 lying in XZ; child
//    "PhoneScreen" t=(0,-0.0043,0) holds the display primitive with material **"Screen"** on its -Y face.
//    Screen UV: u=0 at x=+0.0333, u=1 at x=-0.0333, v=0 at z=-0.0722 (top, dynamic island side).
//    Euler XYZ (-π/2, π, 0) turns the phone so the screen looks at +Z, its top is +Y and the UVs read unmirrored.

export const TAP_PRODUCTS = ["stand-white", "stand-black", "card", "keychain", "sticker"] as const;
export type TapProduct = (typeof TAP_PRODUCTS)[number];
export const isTapProduct = (v: unknown): v is TapProduct =>
  typeof v === "string" && (TAP_PRODUCTS as readonly string[]).includes(v);

export type Vec3 = readonly [number, number, number];

/** glTF meters → scene units. Everything in our scenes is authored at 1 unit = 10 cm. */
export const SCENE_SCALE = 10;

export const PHONE_MODEL = "/models/phone.glb";

/** Phone: rotation that makes the display look at +Z with its top up (see header). */
export const PHONE_PRESENT: Vec3 = [-Math.PI / 2, Math.PI, 0];
/** Display rectangle in meters (Screen primitive bounds). */
export const PHONE_SCREEN = { width: 0.0666, height: 0.1444, z: 0.0045 } as const;
/** Phone back glass plane (phone frame, meters). */
export const PHONE_BACK_Z = -0.0042;
export const PHONE_SIZE = { width: 0.0722, height: 0.15 } as const;

export type ThreeLocaleKey = "fr" | "en";

/** Localized phone screens (1179×2556): ONDE lock screen, onde.tn redirect in Safari, ONDE's Google review page. */
export function phoneTextures(locale: string) {
  const l: ThreeLocaleKey = locale === "en" ? "en" : "fr";
  return {
    lock: `/textures/phone/lock-${l}.webp`,
    safari: `/textures/phone/safari-${l}.webp`,
    a: `/textures/phone/review-A-${l}.webp`,
    b: `/textures/phone/review-B-${l}.webp`,
    regions: "/textures/phone/regions.json",
  } as const;
}

export type ProductKind = "stand" | "card" | "keychain" | "sticker";

/**
 * Phone pose when it touches the tag in the tap story (tap frame: Z = face normal, X = right, Y = up).
 *  - roll: about the face normal; π/2 lays the phone flat across the face, entering from the right with its top
 *    pointing left. tilt: about the face's vertical axis, negative = the phone's far end lifts towards the viewer.
 *  - touch: which point of the phone's back lands on the tap zone — "antenna" = the upper back (NFC coil), the phone
 *    lies almost flat on the face; "top" = the top-back edge, the phone rests its top edge on the zone and leans out
 *    (exact contact when roll = π/2), for tags low on a face where a flat phone would cover the artwork / hit the floor.
 */
export type ContactSpec = { roll: number; tilt: number; touch: "antenna" | "top" };
export const DEFAULT_CONTACT: ContactSpec = { roll: 1.2, tilt: -0.24, touch: "antenna" };

export type ProductSpec = {
  model: string;
  /** Transparent studio still used as poster / loading state / static fallback. */
  still: string;
  kind: ProductKind;
  /** Euler XYZ applied to the raw glTF so the printed face looks at +Z and its top is +Y. */
  present: Vec3;
  /** NFC tap zone on the printed face (raw model space, meters). */
  tap: Vec3;
  /** Outward normal of the printed face (raw model space). */
  normal: Vec3;
  /** Height of the presented model's lowest point above the floor in the tap story (scene units). */
  lift: number;
  /** Rest yaw in the tap story — turns the face towards the camera's side of the stage. */
  yaw: number;
  /** Phone pose at contact (defaults to DEFAULT_CONTACT). */
  contact?: ContactSpec;
};

/** The 12 × 12 cm stand: TAP HERE sits 2.7 cm above the table, so the phone rests its top edge on it (see ContactSpec). */
const STAND_CONTACT: ContactSpec = { roll: Math.PI / 2, tilt: -0.24, touch: "top" };

export const PRODUCTS: Record<TapProduct, ProductSpec> = {
  "stand-white": {
    model: "/models/stand_white.glb",
    still: "/products/stand_white.webp",
    kind: "stand",
    present: [0, 0, 0],
    tap: [0, 0.0273, 0.0021],
    normal: [0, 0, 1],
    lift: 0.42,
    yaw: 0.3,
    contact: STAND_CONTACT,
  },
  "stand-black": {
    model: "/models/stand_black.glb",
    still: "/products/stand_black.webp",
    kind: "stand",
    present: [0, 0, 0],
    tap: [0, 0.0273, 0.0021],
    normal: [0, 0, 1],
    lift: 0.42,
    yaw: 0.3,
    contact: STAND_CONTACT,
  },
  card: {
    model: "/models/card.glb",
    still: "/products/card.webp",
    kind: "card",
    present: [Math.PI / 2, 0, 0],
    tap: [0, 0.0005, 0],
    normal: [0, 1, 0],
    lift: 0.95,
    yaw: 0.32,
  },
  keychain: {
    model: "/models/keychain.glb",
    still: "/products/keychain.webp",
    kind: "keychain",
    present: [Math.PI / 2, 0, 0],
    tap: [0, 0.0016, 0.002],
    normal: [0, 1, 0],
    lift: 0.95,
    yaw: 0.32,
  },
  sticker: {
    model: "/models/sticker.glb",
    still: "/products/sticker.webp",
    kind: "sticker",
    present: [Math.PI / 2, 0, 0],
    tap: [0, 0.0004, 0],
    normal: [0, 1, 0],
    lift: 1.0,
    yaw: 0.32,
  },
};

/** Vertical fallbacks for weak GPUs (9:16, silent, single keyframe — scrubbed with throttled seeks). */
export const FALLBACK_VIDEOS = {
  tap: { src: "/media/loop-v_tap.mp4", poster: "/media/loop-v_tap.webp", duration: 1.5 },
  // 0 → 2.2 s of this clip is the review page (stars fill, text, blue Post); later it shows other destinations.
  screen: { src: "/media/loop-v_screen.mp4", poster: "/media/loop-v_screen.webp", duration: 2.2 },
} as const;

/** Brand palette (mirrors the tokens in globals.css — three.js needs raw values). */
export const COLORS = {
  ink: "#050407",
  ink2: "#0b0a10",
  violet: "#461cf7",
  violet2: "#7b5cff",
  violet3: "#8c7bff",
  gold: "#f5a524",
  text: "#ecebf2",
} as const;
