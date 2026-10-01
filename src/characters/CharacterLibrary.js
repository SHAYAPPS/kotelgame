import { AnimationClip, AnimationUtils, Matrix4, Vector3, VectorKeyframeTrack } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { decodeClips } from './animLibrary.js';
import { CharacterModel } from './CharacterModel.js';
import { CHARACTER } from './config.js';
import { SoldierAnimator } from './SoldierAnimator.js';
import { CivilianAnimator } from './CivilianAnimator.js';
import { dressCharacter, prepareFits } from './outfits.js';

const _a = new Vector3();
const _b = new Vector3();

/** Points over a mesh's triangles (those with every vertex `on`): every vertex, plus one per sub-triangle `spacing` m across. */
function samples({ pos, on, index }, spacing) {
  const out = [];
  for (let i = 0; i < on.length; i++) if (on[i]) out.push(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
  const d = (i, j) => Math.hypot(pos[i] - pos[j], pos[i + 1] - pos[j + 1], pos[i + 2] - pos[j + 2]);
  for (let k = 0; k < index.count; k += 3) {
    const A = index.getX(k);
    const B = index.getX(k + 1);
    const C = index.getX(k + 2);
    if (!on[A] || !on[B] || !on[C]) continue;
    const a = A * 3;
    const b = B * 3;
    const c = C * 3;
    const n = Math.ceil(Math.max(d(a, b), d(b, c), d(c, a)) / spacing);
    if (n < 2) continue; // small enough: its corners will do
    const emit = (u, w) => {
      for (let x = 0; x < 3; x++) out.push(pos[a + x] + u * (pos[b + x] - pos[a + x]) + w * (pos[c + x] - pos[a + x]));
    };
    // The centroid of each of the n x n sub-triangles (no point twice, none on the edges).
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n - i; j++) {
        emit((i + 1 / 3) / n, (j + 1 / 3) / n);
        if (i + j < n - 1) emit((i + 2 / 3) / n, (j + 2 / 3) / n);
      }
    }
  }
  return new Float32Array(out);
}

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
    // Ankle height standing (foot IK puts the sole on the ground).
    this.ankle = (bone('LeftFoot').getWorldPosition(_a).y + bone('RightFoot').getWorldPosition(_b).y) / 2;
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
  }

  /**
   * The head's rest-pose surface: points ~5 mm apart over every LOD0 triangle that follows the
   * Head bone, of one part (PART in config.js; -1: every part: skin, hair, a hood, a cap), in
   * the Head bone's frame (meters). Sampled over the triangles, not only at their corners: a
   * low-poly cap's crown is a few big triangles. Head wear is fitted to it (headFit.js). Cached.
   */
  headSurface(part = -1) {
    return this.surface(`head:${part}`, { bones: ['Head', 'HeadTop_End'], frame: 'Head', part });
  }

  /** The chest and upper back (what follows Spine1 / Spine2), in Spine2's frame: the vest's fit. */
  torsoSurface() {
    return this.surface('torso', { bones: ['Spine1', 'Spine2'], frame: 'Spine2', spacing: 0.01 });
  }

  /**
   * Rest-pose surface points over the LOD0 triangles whose vertices follow one of `bones`
   * (one part, -1: any), in the `frame` bone's space, `spacing` m apart. Cached by `key`.
   */
  surface(key, { bones, frame, part = -1, spacing = 0.005 }) {
    this._surfaces ??= new Map();
    if (!this._surfaces.has(key)) {
      const v = this._vertices(bones, frame, part);
      this._surfaces.set(key, v ? samples(v, spacing) : new Float32Array(0));
    }
    return this._surfaces.get(key);
  }

  /** Fitted shapes (headFit.js results) for this model, built once: key -> make(every part's head surface, this). */
  fitted(key, make) {
    this._fits ??= new Map();
    if (!this._fits.has(key)) this._fits.set(key, make(this.headSurface(), this));
    return this._fits.get(key);
  }

  /** LOD0 vertices whose main bone is one of `boneNames` (one part's, -1: any): rest positions in `frameName`'s frame. */
  _vertices(boneNames, frameName, partId) {
    const sm = this.scene.getObjectByProperty('isSkinnedMesh', true);
    const g = sm.geometry;
    const part = g.getAttribute('_part');
    const si = g.getAttribute('skinIndex');
    const sw = g.getAttribute('skinWeight');
    const bones = sm.skeleton.bones;
    const ids = new Set(boneNames.map((name) => bones.findIndex((b) => b.name === name)).filter((i) => i >= 0));
    const frame = bones.find((b) => b.name === frameName);
    if (!part || !frame || !ids.size) return null;
    const inv = new Matrix4().copy(frame.matrixWorld).invert();
    const n = part.count;
    const pos = new Float32Array(n * 3);
    const on = new Uint8Array(n);
    const used = new Uint8Array(n);
    for (let k = 0; k < g.index.count; k++) used[g.index.getX(k)] = 1; // LOD0's own vertices
    for (let i = 0; i < n; i++) {
      if (!used[i] || (partId >= 0 && Math.round(part.getX(i)) !== partId)) continue;
      let best = -1;
      let bw = -1;
      for (let k = 0; k < 4; k++) {
        const w = sw.getComponent(i, k);
        if (w > bw) {
          bw = w;
          best = si.getComponent(i, k);
        }
      }
      if (!ids.has(best)) continue;
      sm.getVertexPosition(i, _a).applyMatrix4(sm.matrixWorld).applyMatrix4(inv);
      pos[i * 3] = _a.x;
      pos[i * 3 + 1] = _a.y;
      pos[i * 3 + 2] = _a.z;
      on[i] = 1;
    }
    return { pos, on, index: g.index };
  }

  /**
   * A clip variant: `upper` keeps only upper-body tracks (plus the IK targets), `additive`
   * makes it relative to its first frame (hit reactions, recoil on top of anything).
   */
  clip(name, { upper = false, additive = false, leftArm = false, lower = false } = {}) {
    const key = `${name}:${upper ? 'u' : ''}${additive ? 'a' : ''}${leftArm ? 'l' : ''}${lower ? 'd' : ''}`;
    if (this._variants.has(key)) return this._variants.get(key);
    const base = this.clips.get(name);
    if (!base) return null;
    let clip = base;
    if (upper || leftArm || lower) {
      // upper: the upper body plus the IK targets; leftArm: the left arm, neck and head only
      // (a gesture while the right hand keeps the rifle); lower: the hips and legs (stairs).
      const re = leftArm ? CHARACTER.leftArmBones : CHARACTER.upperBones;
      clip = new AnimationClip(key, base.duration, base.tracks.filter((t) => {
        const node = t.name.slice(0, t.name.lastIndexOf('.'));
        if (lower) return !re.test(node) && !node.startsWith('ik');
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

  /** @param {(done: number, total: number) => void} [onProgress] the files loaded so far */
  load(onProgress = null) {
    if (this._loading) return this._loading;
    this._loading = (async () => {
      const manifest = await fetch(`${this.base}manifest.json`).then((r) => {
        if (!r.ok) throw new Error(`manifest ${r.status}`);
        return r.json();
      });
      const entries = Object.entries(manifest.characters);
      const total = entries.length + 2;
      let done = 1;
      onProgress?.(done, total);
      await MeshoptDecoder.ready;
      const bin = await fetch(`${this.base}${manifest.anims.file}`).then((r) => r.arrayBuffer());
      const clips = decodeClips(manifest.anims, bin, MeshoptDecoder);
      onProgress?.(++done, total);
      const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).setKTX2Loader(this.ktx2);
      await Promise.all(
        entries.map(async ([id, info]) => {
          const gltf = await loader.loadAsync(`${this.base}${info.file}`);
          this.types.set(id, new CharacterType(id, info, gltf, clips, manifest.anims));
          onProgress?.(++done, total);
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

  /**
   * Fit every type's head wear and vest now, one type at a time between frames (the loading
   * screen): the crowd dresses later without a hitch.
   * @param {(done: number, total: number) => void} [onProgress]
   */
  async prepareFits(onProgress = null) {
    const types = [...this.types.values()];
    for (let i = 0; i < types.length; i++) {
      try {
        prepareFits(types[i]);
      } catch (e) {
        console.warn(`Fitting ${types[i].id}'s gear failed.`, e);
      }
      onProgress?.(i + 1, types.length);
      await new Promise((r) => setTimeout(r, 0));
    }
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
   * @param {{ variant?: number, band?: number, world?: object, rand?: () => number, kind?: string }} opts
   *   kind: 'police' (a beret, no vest)
   */
  soldier(id, { variant = 0, band, world = null, rand = Math.random, kind = null } = {}) {
    const model = this.create(id);
    dressCharacter(model, { variant, band, rand, kind });
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
