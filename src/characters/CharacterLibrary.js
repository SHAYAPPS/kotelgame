import { AnimationClip, AnimationUtils, Matrix4, Vector3, VectorKeyframeTrack } from 'three';
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
    // Face morphs (mouth, blink) only on LOD0: three keeps a morph texture per geometry.
    const lodMeshes = [];
    this.scene.traverse((o) => {
      if (o.isSkinnedMesh) lodMeshes.push(o);
    });
    for (const m of lodMeshes.slice(1)) {
      m.geometry.morphAttributes = {};
      m.morphTargetInfluences = undefined;
      m.morphTargetDictionary = undefined;
    }
    const bone = (n) => this.scene.getObjectByName(n);
    // Proportions vs the source skeleton (Y Bot) the clips were made on.
    this.hipsRatio = info.hips / anims.sourceHips;
    const armLen = (side) =>
      bone(`${side}Arm`).getWorldPosition(_a).distanceTo(bone(`${side}ForeArm`).getWorldPosition(_b)) +
      bone(`${side}ForeArm`).getWorldPosition(_a).distanceTo(bone(`${side}Hand`).getWorldPosition(_b));
    this.armRatio = armLen('Right') / anims.sourceArm;
    // Meters per geometry unit at rest (the GLB's positions are quantized into a unit box):
    // world = mesh.matrixWorld * bindMatrixInverse * (bone.matrixWorld * boneInverse) * bindMatrix.
    const sm = this.scene.getObjectByProperty('isSkinnedMesh', true);
    const bm = new Matrix4().multiplyMatrices(sm.skeleton.bones[0].matrixWorld, sm.skeleton.boneInverses[0]);
    const rest = new Matrix4().copy(sm.matrixWorld).multiply(sm.bindMatrixInverse).multiply(bm).multiply(sm.bindMatrix);
    this.unit = _a.setFromMatrixColumn(rest, 0).length();
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
    this._shell = null;
  }

  /**
   * How far the hair stands off the skull around a direction (Head-bone frame, in the space
   * of the skull ellipsoid measured by the converter: center at the forehead ring, radii
   * rx / crown / rz), as a scale on that ellipsoid: 1 = bald. Never below the scalp (checked
   * over `skinCone`); on the hair at its `q` quantile (a few strands may poke out), unless
   * `withHair` is off (the hair is hidden, e.g. under a headscarf).
   * Kippot, hats and scarves sit on it.
   * @param {{ x: number, y: number, z: number }} dir unit direction in ellipsoid space
   */
  hairScale(dir, cone = 0.35, q = 0.85, skinCone = cone + 0.4, withHair = true) {
    const shell = this._shellData();
    if (!shell) return 1;
    let skin = 1;
    const cs = Math.cos(skinCone);
    const S = shell.skin;
    for (let i = 0; i < S.n; i++) {
      if (S.dir[i * 3] * dir.x + S.dir[i * 3 + 1] * dir.y + S.dir[i * 3 + 2] * dir.z >= cs && S.rho[i] > skin) skin = S.rho[i];
    }
    if (!withHair) return skin + 0.02;
    const hair = this._scratch;
    hair.length = 0;
    const ch = Math.cos(cone);
    const Hr = shell.hair;
    for (let i = 0; i < Hr.n; i++) {
      if (Hr.dir[i * 3] * dir.x + Hr.dir[i * 3 + 1] * dir.y + Hr.dir[i * 3 + 2] * dir.z >= ch) hair.push(Hr.rho[i]);
    }
    hair.sort((a, b) => a - b);
    const onHair = hair.length >= 6 ? hair[Math.floor((hair.length - 1) * q)] : 1;
    return Math.max(skin + 0.02, onHair);
  }

  /** Hair and scalp points around the head as directions + radii on the skull ellipsoid. */
  _shellData() {
    if (this._shell !== null) return this._shell;
    const h = this.info.head;
    if (!h?.ring) return (this._shell = undefined);
    const { y: cy, cz, rx, rz } = h.ring;
    const ry = Math.max(0.04, h.topY - cy);
    const conv = (pts) => {
      const n = pts.length / 3;
      const dir = new Float32Array(n * 3);
      const rho = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const dx = pts[i * 3] / rx;
        const dy = (pts[i * 3 + 1] - cy) / ry;
        const dz = (pts[i * 3 + 2] - cz) / rz;
        const r = Math.hypot(dx, dy, dz) || 1;
        dir[i * 3] = dx / r;
        dir[i * 3 + 1] = dy / r;
        dir[i * 3 + 2] = dz / r;
        rho[i] = r;
      }
      return { n, dir, rho };
    };
    this._scratch = [];
    return (this._shell = { hair: conv(this._headPoints(4)), skin: conv(this._headPoints(0)) });
  }

  /** Rest positions of one part's vertices that follow the head, in the Head bone's frame. */
  _headPoints(partId) {
    const sm = this.scene.getObjectByProperty('isSkinnedMesh', true);
    const g = sm.geometry;
    const part = g.getAttribute('_part');
    const si = g.getAttribute('skinIndex');
    const sw = g.getAttribute('skinWeight');
    const bones = sm.skeleton.bones;
    const head = bones.findIndex((b) => b.name === 'Head');
    const top = bones.findIndex((b) => b.name === 'HeadTop_End');
    if (!part || head < 0) return new Float32Array(0);
    const inv = new Matrix4().copy(bones[head].matrixWorld).invert();
    const out = [];
    const used = new Uint8Array(part.count);
    for (let k = 0; k < g.index.count; k++) used[g.index.getX(k)] = 1; // LOD0's own vertices
    for (let i = 0; i < part.count; i++) {
      if (!used[i] || Math.round(part.getX(i)) !== partId) continue;
      let best = -1;
      let bw = -1;
      for (let k = 0; k < 4; k++) {
        const w = sw.getComponent(i, k);
        if (w > bw) {
          bw = w;
          best = si.getComponent(i, k);
        }
      }
      if (best !== head && best !== top) continue;
      sm.getVertexPosition(i, _a).applyMatrix4(sm.matrixWorld).applyMatrix4(inv);
      out.push(_a.x, _a.y, _a.z);
    }
    return new Float32Array(out);
  }

  /**
   * A clip variant: `upper` keeps only upper-body tracks (plus the IK targets), `additive`
   * makes it relative to its first frame (hit reactions, recoil on top of anything).
   */
  clip(name, { upper = false, additive = false, leftArm = false } = {}) {
    const key = `${name}:${upper ? 'u' : ''}${additive ? 'a' : ''}${leftArm ? 'l' : ''}`;
    if (this._variants.has(key)) return this._variants.get(key);
    const base = this.clips.get(name);
    if (!base) return null;
    let clip = base;
    if (upper || leftArm) {
      // upper: the upper body plus the IK targets; leftArm: the left arm, neck and head only
      // (a gesture while the right hand keeps the rifle).
      const re = leftArm ? CHARACTER.leftArmBones : CHARACTER.upperBones;
      clip = new AnimationClip(key, base.duration, base.tracks.filter((t) => {
        const node = t.name.slice(0, t.name.lastIndexOf('.'));
        return re.test(node) || (!leftArm && node.startsWith('ik'));
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

  /** A dressed civilian (a wardrobe outfit, else one for the NPC kind) and its animator. */
  civilian(id, kind, { rand = Math.random, outfit = null } = {}) {
    const model = this.create(id);
    dressCharacter(model, { kind, rand, outfit });
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
