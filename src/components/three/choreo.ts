import * as THREE from "three";
import { DEFAULT_CONTACT, PHONE_BACK_Z, PHONE_SCREEN, PHONE_SIZE, SCENE_SCALE, type ContactSpec } from "./config";

// Pure choreography for the TapStory: scroll progress p ∈ [0,1] → camera, phone, product and effect states.
// Everything is derived from the product's tap zone (T) and face normal (N), so every product shares the same
// story; only the model, its scale/size, the tap pose and the camera framing change.

import {
  BEATS,
  clamp01,
  createScalarFrame,
  easeInOutCubic,
  easeInQuad,
  easeOutCubic,
  evaluateScalars,
  type ScalarFrame,
} from "./timeline";

type Ease = (t: number) => number;

// ---- types ---------------------------------------------------------------------------------------------------
export type Pose = { pos: THREE.Vector3; quat: THREE.Quaternion };
type CamKey = {
  p: number;
  target: THREE.Vector3;
  dir: THREE.Vector3;
  w: number;
  h: number;
  fill: number;
  /** Extra camera distance: how far the subject's front sits in front of the target (deep products, e.g. the L stand). */
  near?: number;
  ease?: Ease;
};
type PoseKey = { p: number; pose: Pose; ease?: Ease };

export type ChoreoInput = {
  /** In product-object space (scene units, origin = bottom centre of the presented model). */
  tap: THREE.Vector3;
  normal: THREE.Vector3;
  size: THREE.Vector3;
  center: THREE.Vector3;
  lift: number;
  yaw: number;
  /** Phone pose at contact (config ProductSpec.contact). */
  contact?: ContactSpec;
};

export type Choreo = {
  T: THREE.Vector3;
  N: THREE.Vector3;
  productRest: THREE.Vector3;
  productCenter: THREE.Vector3;
  yaw: number;
  phoneKeys: PoseKey[];
  camKeys: CamKey[];
  heroScreenCenter: THREE.Vector3;
};

export type Frame = ScalarFrame & {
  camPos: THREE.Vector3;
  camTarget: THREE.Vector3;
  phone: Pose;
  phoneVisible: boolean;
  productYaw: number;
};

// ---- helpers -------------------------------------------------------------------------------------------------
const UP = new THREE.Vector3(0, 1, 0);
const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const dirFromAngles = (yaw: number, elev: number) =>
  v3(Math.sin(yaw) * Math.cos(elev), Math.sin(elev), Math.cos(yaw) * Math.cos(elev)).normalize();

function basisQuat(z: THREE.Vector3, up = UP): THREE.Quaternion {
  const Z = z.clone().normalize();
  const X = new THREE.Vector3().crossVectors(up, Z);
  if (X.lengthSq() < 1e-6) X.set(1, 0, 0);
  X.normalize();
  const Y = new THREE.Vector3().crossVectors(Z, X).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
}

const qAxis = (axis: THREE.Vector3, angle: number) => new THREE.Quaternion().setFromAxisAngle(axis, angle);
const AY = v3(0, 1, 0);
const AZ = v3(0, 0, 1);

/** Camera distance so that a w×h rectangle fills `fill` of the usable viewport (after composition offsets). */
export function fitDistance(
  w: number,
  h: number,
  fovDeg: number,
  aspect: number,
  availX: number,
  availY: number,
  fill: number,
) {
  const t = Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2);
  const dV = h / 2 / (t * availY * fill);
  const dH = w / 2 / (t * aspect * availX * fill);
  return Math.max(dV, dH);
}

/** Subject offset in the frame (fractions of the viewport) — leaves room for the caption column / bar. */
export function composition(aspect: number) {
  const land = clamp01((aspect - 0.95) / 0.35); // 0 portrait … 1 landscape
  return { sx: 0.15 * land, sy: 0.06 * (1 - land) };
}

// ---- build ---------------------------------------------------------------------------------------------------
export function buildChoreo(input: ChoreoInput, portrait: boolean): Choreo {
  const yawQ = qAxis(AY, input.yaw);
  const productRest = v3(0, input.lift, 0);
  const T = input.tap.clone().applyQuaternion(yawQ).add(productRest);
  const N = input.normal.clone().applyQuaternion(yawQ).normalize();
  const productCenter = input.center.clone().applyQuaternion(yawQ).add(productRest);

  // Tap frame: Z = face normal, X = right, Y = up.
  const Qtap = basisQuat(N);
  const Xt = v3(1, 0, 0).applyQuaternion(Qtap);
  const Yt = v3(0, 1, 0).applyQuaternion(Qtap);

  // Phone contact orientation (tap frame): rolled so it enters from the right (default ~69°), back turned to the
  // face, its far end tilted towards the viewer. Screen keeps facing the camera side (+Z).
  const { roll, tilt, touch } = input.contact ?? DEFAULT_CONTACT;
  const localQ = (r: number, t: number) => qAxis(AY, t).multiply(qAxis(AZ, r));
  const S = SCENE_SCALE;
  const hx = (PHONE_SIZE.width / 2 - 0.003) * S;
  const hy = (PHONE_SIZE.height / 2 - 0.003) * S;
  // the point of the phone's back that lands on the tap zone: upper back (NFC antenna) or the top-back edge
  const anchor = v3(0, touch === "top" ? hy : 0.042 * S, PHONE_BACK_Z * S);
  const corners = [
    v3(-hx, hy, PHONE_BACK_Z * S),
    v3(hx, hy, PHONE_BACK_Z * S),
    v3(-hx, -hy, PHONE_BACK_Z * S),
    v3(hx, -hy, PHONE_BACK_Z * S),
  ];

  const poseInTapFrame = (q: THREE.Quaternion, gap: number): Pose => {
    const a = anchor.clone().applyQuaternion(q);
    let minZ = Infinity;
    for (const c of corners) minZ = Math.min(minZ, c.clone().applyQuaternion(q).z);
    const local = v3(-a.x, -a.y, gap - minZ);
    return {
      pos: local.applyQuaternion(Qtap).add(T),
      quat: Qtap.clone().multiply(q),
    };
  };

  const contact = poseInTapFrame(localQ(roll, tilt), 0.006);
  const hoverBase = poseInTapFrame(localQ(roll + 0.12, tilt - 0.22), 0.006);
  const hover: Pose = {
    pos: hoverBase.pos.clone().addScaledVector(N, 0.55).addScaledVector(Xt, 0.22),
    quat: hoverBase.quat,
  };
  const entryBase = poseInTapFrame(localQ(roll + 0.55, tilt - 0.65), 0.006);
  const entry: Pose = {
    pos: entryBase.pos.clone().addScaledVector(Xt, 2.8).addScaledVector(Yt, -1.2).addScaledVector(N, 1.6),
    quat: entryBase.quat,
  };
  const rebound: Pose = { pos: contact.pos.clone().addScaledVector(N, 0.2), quat: contact.quat.clone() };

  // Hero: the phone is lifted towards the viewer, upright, screen facing the camera.
  const heroDir = dirFromAngles(0.14, 0.07);
  const heroPos = T.clone().add(v3(0.55, 0.22, 1.9));
  const heroQ = basisQuat(heroDir);
  const hero: Pose = { pos: heroPos, quat: heroQ };
  const heroScreenCenter = v3(0, 0, PHONE_SCREEN.z * S)
    .applyQuaternion(heroQ)
    .add(heroPos);

  const phoneKeys: PoseKey[] = [
    { p: BEATS.phoneIn, pose: entry },
    { p: BEATS.hover, pose: hover, ease: easeOutCubic },
    { p: BEATS.contact, pose: contact, ease: easeInQuad },
    { p: BEATS.hold, pose: contact },
    { p: BEATS.rebound, pose: rebound, ease: easeOutCubic },
    { p: BEATS.hero, pose: hero, ease: easeInOutCubic },
  ];

  // Camera framing (rectangles to fit, in scene units).
  // The L stand's printed face stands 0.6 units in front of its turntable axis (the base runs behind it): back the
  // product shots off by that much so the face, not the axis, gets the intended framing (flat products: no change).
  const faceDepth = input.tap.z - input.center.z;
  const front = faceDepth > 0.1 ? faceDepth : 0;
  const pw = Math.max(input.size.x, 0.5);
  const ph = Math.max(input.size.y, 0.5);
  const tapMid = productCenter.clone().lerp(T, 0.35).addScaledVector(Xt, 0.5).addScaledVector(N, 0.25);
  const tapW = Math.max(pw, 0.9) + 1.9;
  const tapH = Math.max(ph, 1.1) + 1.25;
  const phoneW = PHONE_SIZE.width * S;
  const phoneH = PHONE_SIZE.height * S;
  const fillEnd = portrait ? 0.86 : 0.94;

  const camKeys: CamKey[] = [
    {
      p: 0,
      target: productCenter.clone().add(v3(0, -0.1, 0)),
      dir: dirFromAngles(-0.5, 0.02),
      w: pw * 2.1,
      h: ph * 2.1,
      fill: 1,
      near: front,
    },
    {
      p: BEATS.rise[1],
      target: productCenter.clone(),
      dir: dirFromAngles(0.1, 0.12),
      w: pw * 1.45,
      h: ph * 1.45,
      fill: 1,
      near: front,
      ease: easeInOutCubic,
    },
    {
      p: BEATS.hover,
      target: tapMid,
      dir: dirFromAngles(input.yaw + 0.62, 0.2),
      w: tapW,
      h: tapH,
      fill: 1,
      ease: easeInOutCubic,
    },
    {
      p: BEATS.contact + 0.006,
      target: tapMid.clone().lerp(T, 0.25),
      dir: dirFromAngles(input.yaw + 0.7, 0.16),
      w: tapW * 0.93,
      h: tapH * 0.93,
      fill: 1,
      ease: easeOutCubic,
    },
    {
      p: BEATS.rebound,
      target: tapMid.clone().lerp(T, 0.25),
      dir: dirFromAngles(input.yaw + 0.64, 0.16),
      w: tapW * 0.92,
      h: tapH * 0.92,
      fill: 1,
    },
    {
      p: BEATS.hero,
      target: heroPos.clone(),
      dir: heroDir,
      w: phoneW * 2.0,
      h: phoneH * 1.42,
      fill: 1,
      ease: easeInOutCubic,
    },
    { p: BEATS.push[0], target: heroPos.clone(), dir: heroDir, w: phoneW * 1.8, h: phoneH * 1.3, fill: 1 },
    // Close-up that still shows the whole iPhone (frame, island, ONDE's Google review page) — never a blank crop.
    {
      p: BEATS.push[1],
      target: heroPos.clone(),
      dir: heroDir,
      w: phoneW * 1.5,
      h: phoneH * 1.34,
      fill: fillEnd,
      ease: easeInOutCubic,
    },
    { p: 1, target: heroPos.clone(), dir: heroDir, w: phoneW * 1.5, h: phoneH * 1.34, fill: fillEnd },
  ];

  return { T, N, productRest, productCenter, yaw: input.yaw, phoneKeys, camKeys, heroScreenCenter };
}

// ---- evaluate ------------------------------------------------------------------------------------------------
function segment<K extends { p: number; ease?: Ease }>(keys: K[], p: number): [K, K, number] {
  if (p <= keys[0].p) return [keys[0], keys[0], 0];
  for (let i = 1; i < keys.length; i++) {
    if (p <= keys[i].p) {
      const a = keys[i - 1],
        b = keys[i];
      const t = (p - a.p) / Math.max(1e-6, b.p - a.p);
      return [a, b, (b.ease ?? easeInOutCubic)(clamp01(t))];
    }
  }
  const last = keys[keys.length - 1];
  return [last, last, 0];
}

const tmpDir = new THREE.Vector3();

export function createFrame(): Frame {
  return {
    ...createScalarFrame(),
    camPos: v3(),
    camTarget: v3(),
    phone: { pos: v3(), quat: new THREE.Quaternion() },
    phoneVisible: false,
    productYaw: 0,
  };
}

export function evaluate(c: Choreo, p: number, aspect: number, fov: number, out: Frame): Frame {
  // camera
  const [ca, cb, ct] = segment(c.camKeys, p);
  out.camTarget.lerpVectors(ca.target, cb.target, ct);
  tmpDir.lerpVectors(ca.dir, cb.dir, ct).normalize();
  const { sx, sy } = composition(aspect);
  const w = THREE.MathUtils.lerp(ca.w, cb.w, ct);
  const h = THREE.MathUtils.lerp(ca.h, cb.h, ct);
  const fill = THREE.MathUtils.lerp(ca.fill, cb.fill, ct);
  const near = THREE.MathUtils.lerp(ca.near ?? 0, cb.near ?? 0, ct);
  const dist = fitDistance(w, h, fov, aspect, 1 - 2 * sx, 1 - 2 * sy, fill) + near;
  out.camPos.copy(out.camTarget).addScaledVector(tmpDir, dist);

  // phone
  const [pa, pb, pt] = segment(c.phoneKeys, p);
  out.phone.pos.lerpVectors(pa.pose.pos, pb.pose.pos, pt);
  out.phone.quat.slerpQuaternions(pa.pose.quat, pb.pose.quat, pt);
  out.phoneVisible = p > BEATS.phoneIn - 0.01;
  evaluateScalars(p, out);
  out.phone.pos.addScaledVector(c.N, out.recoil * 0.05);
  out.productYaw = c.yaw + out.productSpin;
  return out;
}
