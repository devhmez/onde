import * as THREE from "three";

export type Quality = "high" | "mid";

export type PreparedModel = {
  /** Deep clone of the glTF scene with per-instance materials (safe to mutate). */
  root: THREE.Object3D;
  /** Meshes keyed by their (upgraded) material name, e.g. "Screen", "WFront". */
  byMaterial: Map<string, THREE.Mesh[]>;
  dispose: () => void;
};

const PRINTED = /^(WFront|WBack|KFront|KBack|CardFront|KeyFront|StickerFront)$/;

/**
 * Clear 3 mm cast acrylic — the review stand is one bent sheet (see config.ts).
 *
 * A sheet this thin barely shifts what is behind it, so it is drawn as a glass *overlay* instead of with transmission
 * (three.js clears its transmission buffer to milky white on transparent canvases, which turned the clear base into a
 * frosted slab): the shader output is only what the surface reflects/emits, added on top of the background, while the
 * small alpha just dims what is behind (premultiplied "over"). The page or stage stays visible through the base, the
 * faces keep their Fresnel reflections and the polished cut edges read as bright, faintly green-blue glass lines.
 */
export function makeAcrylic(kind: "edge" | "base"): THREE.MeshPhysicalMaterial {
  const edge = kind === "edge";
  return new THREE.MeshPhysicalMaterial({
    name: edge ? "AcrylicEdge" : "AcrylicBase",
    color: new THREE.Color(edge ? "#2f3b37" : "#000000"),
    emissive: new THREE.Color(edge ? "#121c1a" : "#000000"),
    metalness: 0,
    roughness: edge ? 0.14 : 0.035,
    ior: 1.49,
    // kept low on the faces: at grazing angles they mirror the violet lights/backdrop (F90 = specularIntensity),
    // which ACES pushed to a filled magenta/blue slab — capped so the base stays a faint clear plate with a light
    // sheen and only the polished cut edges read bright
    specularIntensity: edge ? 1 : 0.05,
    envMapIntensity: edge ? 1.0 : 0.18,
    transparent: true,
    opacity: edge ? 0.3 : 0.05,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendEquationAlpha: THREE.AddEquation,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
}

function upgradeTexture(tex: THREE.Texture | null, anisotropy: number) {
  if (!tex) return;
  if (tex.colorSpace !== THREE.SRGBColorSpace) {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
  }
  if (tex.anisotropy !== anisotropy) {
    tex.anisotropy = anisotropy;
    tex.needsUpdate = true;
  }
}

/**
 * Clone a cached glTF scene and give it production materials:
 *  - AcrylicEdge / AcrylicBase → clear-sheet overlay (see makeAcrylic): Fresnel reflections over the background
 *  - printed faces keep their artwork (sRGB, anisotropic filtering) and clearcoat
 *  - metals / glass get tuned roughness + environment response
 * Geometries and textures stay shared with the loader cache; only the materials created here are disposed.
 */
export function prepareModel(source: THREE.Object3D, opts: { quality: Quality; anisotropy: number }): PreparedModel {
  const root = source.clone(true);
  const owned: THREE.Material[] = [];
  const byMaterial = new Map<string, THREE.Mesh[]>();

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const original = mesh.material as THREE.Material;
    const name = original.name;
    let next: THREE.Material;

    if (name === "AcrylicEdge" || name === "AcrylicBase") {
      next = makeAcrylic(name === "AcrylicEdge" ? "edge" : "base");
    } else {
      const m = original.clone() as THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial;
      if (PRINTED.test(name)) {
        upgradeTexture(m.map, opts.anisotropy);
        m.envMapIntensity = 1.1;
        if ("clearcoat" in m && opts.quality === "mid") m.clearcoat = Math.min(m.clearcoat, 0.6);
      } else if (name === "Titanium") {
        m.metalness = 1;
        m.roughness = 0.26;
        m.color.set("#8e8c96");
        m.envMapIntensity = 1.4;
      } else if (name === "Steel") {
        m.metalness = 1;
        m.roughness = 0.14;
        m.envMapIntensity = 1.6;
      } else if (name === "BlackGlass" || name === "BackGlass" || /Edge$/.test(name)) {
        m.envMapIntensity = 1.3;
      }
      next = m;
    }
    next.name = name;
    mesh.material = next;
    owned.push(next);
    const list = byMaterial.get(name);
    if (list) list.push(mesh);
    else byMaterial.set(name, [mesh]);
  });

  return {
    root,
    byMaterial,
    dispose: () => {
      for (const m of owned) m.dispose();
    },
  };
}

/** World-space bounding box of an object (after its current transforms). */
export function boundsOf(obj: THREE.Object3D): THREE.Box3 {
  obj.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(obj);
}
