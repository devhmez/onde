// Scroll timeline of the TapStory — plain numbers only (no three.js), so DOM shells and the video fallback can
// share it without pulling WebGL code into their bundle.

export const BEATS = {
  rise: [0.0, 0.15],
  phoneIn: 0.11,
  hover: 0.26,
  contact: 0.31,
  hold: 0.345,
  /** The NFC banner drops in at the top of the screen the instant the phone touches the tag. */
  bannerIn: [0.325, 0.37],
  rebound: 0.38,
  hero: 0.47,
  press: [0.485, 0.52],
  bannerOut: [0.52, 0.555],
  /** Safari grows out of the banner, onde.tn/t/… loads… */
  safari: [0.52, 0.565],
  safariLoad: [0.55, 0.615],
  /** …and the redirect lands on ONDE's Google review page. */
  appOpen: [0.615, 0.65],
  push: [0.6, 0.69],
  stars: [0.69, 0.78],
  typing: [0.78, 0.87],
  post: [0.875, 0.9],
  toast: [0.905, 0.94],
  burst: [0.905, 0.99],
  /** Caption step starts: 01 Tap, 02 Notification, 03 Review. */
  steps: [0.1, 0.33, 0.6],
} as const;

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smooth = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4);
export const easeInQuad = (t: number) => t * t;
export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutBack = (t: number, s = 1.70158) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
export const smoothstep = (t: number) => t * t * (3 - 2 * t);
/** 0 → 1 → 0 over [a, b]. */
export const bump = (p: number, a: number, b: number) => Math.sin(Math.PI * smooth(p, a, b));

export type ScalarFrame = {
  productOffsetY: number;
  productLight: number;
  /** Extra yaw added to the product's rest yaw during the rise. */
  productSpin: number;
  ringBurst: number;
  ringIdle: number;
  flash: number;
  shake: number;
  recoil: number;
  screenGloss: number;
  screen: { safari: number; safariLoad: number; open: number; stars: number; typing: number; post: number };
  banner: { drop: number; press: number; out: number };
  toast: number;
  burst: number;
  step: number;
  stepBlend: [number, number, number];
  intro: number;
};

export function createScalarFrame(): ScalarFrame {
  return {
    productOffsetY: 0,
    productLight: 0,
    productSpin: 0,
    ringBurst: 0,
    ringIdle: 0,
    flash: 0,
    shake: 0,
    recoil: 0,
    screenGloss: 1,
    screen: { safari: 0, safariLoad: 0, open: 0, stars: 0, typing: 0, post: 0 },
    banner: { drop: 0, press: 0, out: 0 },
    toast: 0,
    burst: 0,
    step: 0,
    stepBlend: [0, 0, 0],
    intro: 1,
  };
}

export function evaluateScalars(p: number, out: ScalarFrame): ScalarFrame {
  const rise = smooth(p, BEATS.rise[0], BEATS.rise[1]);
  out.productOffsetY = -0.85 * (1 - easeOutCubic(rise));
  out.productSpin = -1.15 * (1 - easeOutQuart(rise));
  out.productLight = 0.18 + 0.82 * smoothstep(rise);

  out.ringBurst = p < BEATS.contact ? 0 : clamp01((p - BEATS.contact) / 0.08);
  out.ringIdle = smooth(p, 0.1, 0.18) * (1 - smooth(p, BEATS.contact - 0.03, BEATS.contact));
  out.flash = Math.exp(-Math.pow((p - BEATS.contact - 0.003) / 0.009, 2));
  out.shake = Math.exp(-Math.pow((p - BEATS.contact - 0.004) / 0.011, 2));
  out.recoil = bump(p, BEATS.contact, BEATS.contact + 0.03);

  out.screenGloss = 1 - smooth(p, BEATS.push[0], BEATS.push[1] - 0.03);
  out.screen.safari = smooth(p, BEATS.safari[0], BEATS.safari[1]);
  out.screen.safariLoad = smooth(p, BEATS.safariLoad[0], BEATS.safariLoad[1]);
  out.screen.open = easeOutCubic(smooth(p, BEATS.appOpen[0], BEATS.appOpen[1]));
  out.screen.stars = 5 * smooth(p, BEATS.stars[0], BEATS.stars[1]);
  out.screen.typing = smooth(p, BEATS.typing[0], BEATS.typing[1]);
  out.screen.post = smooth(p, BEATS.post[0], BEATS.post[1]);

  out.banner.drop = smooth(p, BEATS.bannerIn[0], BEATS.bannerIn[1]);
  out.banner.press = bump(p, BEATS.press[0], BEATS.press[1]);
  out.banner.out = smooth(p, BEATS.bannerOut[0], BEATS.bannerOut[1]);
  out.toast = smooth(p, BEATS.toast[0], BEATS.toast[1]);
  out.burst = p < BEATS.burst[0] ? 0 : smooth(p, BEATS.burst[0], BEATS.burst[1]);

  const [s1, s2, s3] = BEATS.steps;
  out.step = p < s2 ? 0 : p < s3 ? 1 : 2;
  const fade = 0.025;
  out.stepBlend[0] = smooth(p, s1 - fade, s1) * (1 - smooth(p, s2 - fade, s2));
  out.stepBlend[1] = smooth(p, s2 - fade, s2) * (1 - smooth(p, s3 - fade, s3));
  out.stepBlend[2] = smooth(p, s3 - fade, s3);
  out.intro = 1 - smooth(p, 0.06, s1);
  return out;
}
