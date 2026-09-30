import { AnimationClip, AnimationUtils, Vector3, VectorKeyframeTrack } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { decodeClips } from './animLibrary.js';
import { CharacterModel } from './CharacterModel.js';
import { CHARACTER } from './config.js';
import { SoldierAnimator } from './SoldierAnimator.js';
import { CivilianAnimator } from './CivilianAnimator.js';
import { dressCharacter } from './outfits.js';

const _a = new Vector3();
const _b = new Vector3();

/** One character model as loaded: template scene, material and its own clip set. */
export class CharacterType {
  constructor(id, info, gltf, sourceClips, anims) {
    this.id = id;
    this.info = info;
    this.scene = gltf.scene;
    this.scene.updateMatrixWorld(true);
    const bone = (n) => this.scene.getObjectByName(n);
    // Proportions vs the source skeleton (Y Bot) the clips were made on.
    this.hipsRatio = info.hips / anims.sourceHips;
    const armLen = (side) =>
      bone(`${side}Arm`).getWorldPosition(_a).distanceTo(bone(`${side}ForeArm`).getWorldPosition(_b)) +
      bone(`${side}ForeArm`).getWorldPosition(_a).distanceTo(bone(`${side}Hand`).getWorldPosition(_b));
    this.armRatio = armLen('Right') / anims.sourceArm;
    this.clips = new Map();
    for (const [name, clip] of sourceClips) {
      const tracks = clip.tracks.map((t) => {
        const k = t.name === 'Hips.position' ? this.hipsRatio : t.name === 'ikHandR.position' ? this.armRatio : 1;
        if (k === 1) return t;
        const v = t.values.slice();
        for (let i = 0; i < v.length; i++) v[i] *= k;
        return new VectorKeyframeTrack(t.name, t.times, v);
      });
      this.clips.set(name, new AnimationClip(name, clip.duration, tracks));
    }
    this._variants = new Map();
    this.meta = anims.clips;
    this.rifle = anims.rifle;
  }

  /**
   * A clip variant: `upper` keeps only upper-body tracks (plus the IK targets), `additive`
   * makes it relative to its first frame (hit reactions, recoil on top of anything).
   */
  clip(name, { upper = false, additive = false } = {}) {
    const key = `${name}:${upper ? 'u' : ''}${additive ? 'a' : ''}`;
    if (this._variants.has(key)) return this._variants.get(key);
    const base = this.clips.get(name);
    if (!base) return null;
    let clip = base;
    if (upper) {
      const re = CHARACTER.upperBones;
      clip = new AnimationClip(key, base.duration, base.tracks.filter((t) => {
        const node = t.name.slice(0, t.name.lastIndexOf('.'));
        return re.test(node) || node.startsWith('ik');
      }));
    }
    if (additive) {
      clip = AnimationUtils.makeClipAdditive(clip === base ? base.clone() : clip, 0);
      clip.name = key;
    }
    this._variants.set(key, clip);
    return clip;
  }
}

/**
 * Loads the animated characters (public/assets/characters/, built by
 * `npm run assets:characters`): the manifest, the shared clip library and every model.
 * Views ask `ready` and build their models once it is true (placeholders until then).
 */
export class CharacterLibrary {
  constructor({ ktx2Loader, base = 'assets/characters/' } = {}) {
    this.base = base;
    this.ktx2 = ktx2Loader;
    this.types = new Map();
    this.ready = false;
    this.failed = false;
    this.manifest = null;
    this._loading = null;
  }

  load() {
    if (this._loading) return this._loading;
    this._loading = (async () => {
      const manifest = await fetch(`${this.base}manifest.json`).then((r) => {
        if (!r.ok) throw new Error(`manifest ${r.status}`);
        return r.json();
      });
      await MeshoptDecoder.ready;
      const bin = await fetch(`${this.base}${manifest.anims.file}`).then((r) => r.arrayBuffer());
      const clips = decodeClips(manifest.anims, bin, MeshoptDecoder);
      const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).setKTX2Loader(this.ktx2);
      await Promise.all(
        Object.entries(manifest.characters).map(async ([id, info]) => {
          const gltf = await loader.loadAsync(`${this.base}${info.file}`);
          this.types.set(id, new CharacterType(id, info, gltf, clips, manifest.anims));
        }),
      );
      this.manifest = manifest;
      this.ready = true;
      return this;
    })().catch((e) => {
      console.warn('Characters failed to load; using placeholders.', e);
      this.failed = true;
      return this;
    });
    return this._loading;
  }

  has(id) {
    return this.types.has(id);
  }

  /** Ids of the loaded characters with this role ('squad' | 'enemy' | 'civilian'). */
  ids(role, sex = null) {
    return [...this.types.values()].filter((t) => t.info.role === role && (!sex || t.info.sex === sex)).map((t) => t.id);
  }

  /** @returns {CharacterModel} */
  create(id, options = {}) {
    const type = this.types.get(id);
    if (!type) throw new Error(`No character "${id}"`);
    return new CharacterModel(type, options);
  }

  /**
   * A dressed soldier (squad or enemy) and its animator. The views go through these so the
   * character code loads with the library (its own chunk).
   * @param {{ variant?: number, band?: number, world?: object, rand?: () => number }} opts
   */
  soldier(id, { variant = 0, band, world = null, rand = Math.random } = {}) {
    const model = this.create(id);
    dressCharacter(model, { variant, band, rand });
    return { model, animator: new SoldierAnimator(model, { world, rand }) };
  }

  /** A dressed civilian (clothes by NPC kind) and its animator. */
  civilian(id, kind, { rand = Math.random } = {}) {
    const model = this.create(id);
    dressCharacter(model, { kind, rand });
    return { model, animator: new CivilianAnimator(model, { kind, rand }) };
  }

  /** Just the dressed model (e.g. the truck's gunner, posed by its view). */
  dressed(id, opts = {}) {
    const model = this.create(id);
    dressCharacter(model, opts);
    return model;
  }
}

export { characters } from './registry.js';
