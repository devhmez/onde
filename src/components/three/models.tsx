"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import {
  PHONE_MODEL,
  PHONE_PRESENT,
  PHONE_SCREEN,
  PRODUCTS,
  SCENE_SCALE,
  TAP_PRODUCTS,
  type TapProduct,
} from "./config";
import { boundsOf, prepareModel, type Quality } from "./materials";

// Our GLBs use neither Draco nor Meshopt: disabling both keeps drei from wiring decoders (no gstatic fetch).
const useModel = (url: string) => useGLTF(url, false, false);

export function preloadProduct(product: TapProduct) {
  useGLTF.preload(PRODUCTS[product].model, false, false);
}
export function preloadPhone() {
  useGLTF.preload(PHONE_MODEL, false, false);
}
/** Warm the cache for every product during idle time (TapStory switcher, shop). */
export function preloadAllProductsIdle() {
  if (typeof window === "undefined") return () => {};
  const run = () => TAP_PRODUCTS.forEach((p) => preloadProduct(p));
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  if (w.requestIdleCallback) {
    const id = w.requestIdleCallback(run, { timeout: 4000 });
    return () => w.cancelIdleCallback?.(id);
  }
  const t = window.setTimeout(run, 2500);
  return () => window.clearTimeout(t);
}

export type ProductLayout = {
  /** Ready-to-render object: presented (face +Z, top +Y), scaled to scene units, bottom-centre at its origin. */
  object: THREE.Object3D;
  /** Bounding box size in scene units. */
  size: THREE.Vector3;
  /** Centre of the bounding box relative to the object's origin. */
  center: THREE.Vector3;
  /** NFC tap zone and face normal relative to the object's origin. */
  tap: THREE.Vector3;
  normal: THREE.Vector3;
  byMaterial: Map<string, THREE.Mesh[]>;
};

export function useProductLayout(product: TapProduct, quality: Quality, anisotropy: number): ProductLayout {
  const spec = PRODUCTS[product];
  const gltf = useModel(spec.model);
  // One self-contained memo: every invocation clones its own tree, so StrictMode's double-invoked memo never
  // re-parents objects that belong to the result React keeps.
  const built = useMemo(() => {
    const prepared = prepareModel(gltf.scene, { quality, anisotropy });
    const euler = new THREE.Euler(spec.present[0], spec.present[1], spec.present[2]);
    const inner = new THREE.Group();
    inner.name = `product:${product}`;
    inner.rotation.copy(euler);
    inner.scale.setScalar(SCENE_SCALE);
    inner.add(prepared.root);
    const box = boundsOf(inner);
    const offset = new THREE.Vector3(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
    inner.position.copy(offset);
    const outer = new THREE.Group();
    outer.add(inner);
    const size = box.getSize(new THREE.Vector3());
    const layout: ProductLayout = {
      object: outer,
      size,
      center: new THREE.Vector3(0, size.y / 2, 0),
      tap: new THREE.Vector3(...spec.tap).applyEuler(euler).multiplyScalar(SCENE_SCALE).add(offset),
      normal: new THREE.Vector3(...spec.normal).applyEuler(euler).normalize(),
      byMaterial: prepared.byMaterial,
    };
    return { layout, dispose: prepared.dispose };
  }, [gltf.scene, quality, anisotropy, spec, product]);
  useEffect(() => () => built.dispose(), [built]);
  return built.layout;
}

export type PhoneLayout = {
  /** Phone presented with the display facing +Z, top +Y, centred at its origin, in scene units. */
  object: THREE.Object3D;
  screenMaterial: THREE.MeshPhysicalMaterial | THREE.MeshBasicMaterial;
};

/** Phone with its "Screen" material swapped for an emissive display that shows `texture`. */
export function usePhoneLayout(texture: THREE.Texture, quality: Quality, anisotropy: number): PhoneLayout {
  const gltf = useModel(PHONE_MODEL);
  const built = useMemo(() => {
    const prepared = prepareModel(gltf.scene, { quality, anisotropy });
    const screenMaterial =
      quality === "high"
        ? // Emissive display under real glass: env reflections glide over it (intensity is animated by the scene).
          new THREE.MeshPhysicalMaterial({
            name: "Screen",
            color: new THREE.Color("#000000"),
            emissive: new THREE.Color("#ffffff"),
            emissiveMap: texture,
            emissiveIntensity: 1,
            metalness: 0,
            roughness: 0.05,
            clearcoat: 1,
            clearcoatRoughness: 0.02,
            envMapIntensity: 0.35,
            toneMapped: false,
            fog: false,
          })
        : new THREE.MeshBasicMaterial({ name: "Screen", map: texture, toneMapped: false, fog: false });
    for (const mesh of prepared.byMaterial.get("Screen") ?? []) mesh.material = screenMaterial;
    const inner = new THREE.Group();
    inner.name = "phone";
    inner.rotation.set(PHONE_PRESENT[0], PHONE_PRESENT[1], PHONE_PRESENT[2]);
    inner.scale.setScalar(SCENE_SCALE);
    inner.add(prepared.root);
    const outer = new THREE.Group();
    outer.add(inner);
    return {
      layout: { object: outer, screenMaterial } satisfies PhoneLayout,
      dispose: () => {
        prepared.dispose();
        screenMaterial.dispose();
      },
    };
  }, [gltf.scene, texture, quality, anisotropy]);
  useEffect(() => () => built.dispose(), [built]);
  return built.layout;
}

/** Point on the display in the presented phone frame (scene units). u,v follow the texture (v = 0 at the top). */
export function phoneScreenPoint(u: number, v: number, out = new THREE.Vector3()) {
  return out.set(
    (u - 0.5) * PHONE_SCREEN.width * SCENE_SCALE,
    (0.5 - v) * PHONE_SCREEN.height * SCENE_SCALE,
    (PHONE_SCREEN.z + 0.0002) * SCENE_SCALE,
  );
}
