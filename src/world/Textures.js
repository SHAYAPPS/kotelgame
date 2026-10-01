import { LinearSRGBColorSpace, NoColorSpace, RepeatWrapping, SRGBColorSpace } from 'three/webgpu';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { applyStone } from './stoneMaterial.js';

/**
 * Surface texture sets (KTX2, see public/assets/textures/manifest.json and
 * scripts/assets/): <id>_color (sRGB), <id>_normal, <id>_orm (AO / roughness / metalness).
 * Materials are created untextured and get their maps when the set arrives, so the level
 * shows immediately and textures stream in.
 */
export class TextureLibrary {
  constructor(renderer, { base = 'assets/textures/' } = {}) {
    this.base = base;
    // The Basis transcoder ships with three (Vite bundles it via import.meta.url).
    this.loader = new KTX2Loader().detectSupport(renderer);
    this.sets = new Map(); // id -> Promise<set>
    this.anisotropy = 4;
    this.textures = [];
    this._manifest = null;
  }

  manifest() {
    if (!this._manifest) {
      this._manifest = fetch(`${this.base}manifest.json`)
        .then((r) => (r.ok ? r.json() : {}))
        .catch(() => ({}));
    }
    return this._manifest;
  }

  _tex(url, colorSpace) {
    return new Promise((resolve, reject) => {
      this.loader.load(
        url,
        (t) => {
          t.wrapS = t.wrapT = RepeatWrapping;
          t.colorSpace = colorSpace;
          t.anisotropy = this.anisotropy;
          this.textures.push(t);
          resolve(t);
        },
        undefined,
        reject,
      );
    });
  }

  /** @returns {Promise<{ meters: number, color, normal, orm } | null>} */
  load(id) {
    if (!this.sets.has(id)) {
      this.sets.set(
        id,
        this.manifest().then(async (m) => {
          const info = m[id];
          if (!info) return null;
          const [color, normal, orm] = await Promise.all([
            this._tex(`${this.base}${id}_color.ktx2`, SRGBColorSpace),
            this._tex(`${this.base}${id}_normal.ktx2`, NoColorSpace),
            this._tex(`${this.base}${id}_orm.ktx2`, LinearSRGBColorSpace),
          ]);
          return { meters: info.meters, color, normal, orm };
        }).catch((e) => {
          console.warn(`Texture set "${id}" failed to load`, e);
          return null;
        }),
      );
    }
    return this.sets.get(id);
  }

  setAnisotropy(n) {
    this.anisotropy = n;
    for (const t of this.textures) {
      t.anisotropy = n;
      t.needsUpdate = true;
    }
  }

  /**
   * Give a material a texture set. UVs are in meters, so the repeat is 1 / (meters the
   * texture covers) times `scale`. `normalScale` sets the relief strength.
   */
  apply(material, id, { scale = 1, normalScale = 1, offset = [0, 0] } = {}) {
    return this.load(id).then((set) => {
      if (!set) return;
      // Stone (node materials: world/stoneMaterial.js) samples the set itself.
      if (material.userData.stone) return applyStone(material, set, { scale, normalScale, offset, ...material.userData.stone });
      const rep = scale / set.meters;
      const clone = (t) => {
        const c = t.clone();
        c.repeat.set(rep, rep);
        c.offset.set(offset[0], offset[1]);
        this.textures.push(c);
        return c;
      };
      material.map = clone(set.color);
      material.normalMap = clone(set.normal);
      material.normalScale.set(normalScale, normalScale);
      const orm = clone(set.orm);
      material.roughnessMap = orm;
      material.aoMap = orm;
      material.aoMapIntensity = 0.8;
      material.roughness = 1;
      material.needsUpdate = true;
    });
  }
}
