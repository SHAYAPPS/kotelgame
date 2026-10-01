import {
  AnimationMixer,
  BufferGeometry,
  DataTexture,
  DataUtils,
  Float32BufferAttribute,
  FloatType,
  Group,
  HalfFloatType,
  DynamicDrawUsage,
  InstancedBufferGeometry,
  InstancedInterleavedBuffer,
  InterleavedBuffer,
  InterleavedBufferAttribute,
  Matrix4,
  Mesh,
  MeshStandardNodeMaterial,
  NearestFilter,
  Quaternion,
  RGBAFormat,
  Sphere,
  Vector3,
} from 'three/webgpu';
import {
  Fn,
  If,
  abs,
  attribute,
  cos,
  dot,
  float,
  floor,
  fract,
  int,
  ivec2,
  mat4,
  materialColor,
  materialNormal,
  max,
  mix,
  mod,
  normalGeometry,
  normalLocal,
  normalViewGeometry,
  normalize,
  positionGeometry,
  positionPrevious,
  screenCoordinate,
  select,
  sin,
  textureLoad,
  uniform,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { PART, PARTS } from './config.js';
import { makeOutfit } from './wardrobe.js';
import { blackHat, hatFit, headscarf, kippah, kippahFit, KIPPAH, scarfFit } from './attachments.js';
import { ACT, CROWD } from '../story/crowd/CrowdField.js';

// The far (and not so far) crowd: thousands of animated people for a few dozen draw calls.
// Per character type, its animations are baked once into a float texture (the skinning
// matrices of every bone, 12 frames a second, for the crowd's few clips) and its LOD1 / LOD2
// meshes are compacted, with the head wear (kippah, hat, headscarf: the same fitted shapes
// as the full characters wear) merged in and skinned to the head. Each instance carries its
// clip and phase, its outfit (a row of a small palette texture: the wardrobe's tints), a head
// turn (glancing at the player) and a fade (arriving / gone); the vertex shader skins from the
// texture. Members within CROWD.near of the camera use LOD1, the rest LOD2.

const FPS = 12;
const WEAR = PARTS; // the merged head wear's part (after the model's own)
const SLOTS = PARTS + 1;
const OUTFITS = 40; // palette rows per type
const INST = 12; // floats per member in the instance buffer

// The clip each act plays, per sex.
const CLIPS = {
  [ACT.pray]: ['praying_swaying', 'praying_swaying'],
  [ACT.stand]: ['idle_breathing', 'idle_weightshift'],
  [ACT.talk]: ['talk_general', 'talk_general'],
  [ACT.walk]: ['walk_male', 'walk_female'],
  [ACT.run]: ['run_scared_lookback', 'run_standard'],
  [ACT.sit]: ['sit_reading', 'sit_reading'],
  [ACT.oldWalk]: ['old_walk', 'old_walk'],
  [ACT.back]: ['walk_back_male', 'walk_back_female'],
};

const _m = new Matrix4();
const _q = new Quaternion();
const _p = new Vector3();
const _s = new Vector3(1, 1, 1);
const UP = new Vector3(0, 1, 0);

/** Bakes a type's crowd clips: { texture, clips: act -> { start, count, speed }, head, headBind }. */
function bake(type) {
  const root = new Group();
  const body = SkeletonUtils.clone(type.scene);
  body.rotation.y = Math.PI; // like CharacterModel: yaw 0 faces -Z
  root.add(body);
  const meshes = [];
  body.traverse((o) => o.isSkinnedMesh && meshes.push(o));
  const mesh = meshes[0];
  const skeleton = mesh.skeleton;
  const bones = skeleton.bones;
  const B = bones.length;
  const female = type.info.sex === 'f' ? 1 : 0;
  const mixer = new AnimationMixer(body);
  const clips = {};
  const frames = [];
  let start = 0;
  for (const [act, names] of Object.entries(CLIPS)) {
    const name = names[female];
    const clip = type.clips.get(name);
    if (!clip) continue;
    const count = Math.max(2, Math.round(clip.duration * FPS));
    clips[act] = { start, count, duration: clip.duration, speed: (type.meta?.[name]?.speed ?? 0) * (type.hipsRatio ?? 1) };
    const action = mixer.clipAction(clip);
    for (let f = 0; f < count; f++) {
      mixer.stopAllAction();
      action.reset().play();
      mixer.setTime((f / count) * clip.duration);
      root.updateMatrixWorld(true);
      frames.push(skinMatrices(mesh, bones));
    }
    mixer.stopAllAction();
    start += count;
  }
  // Rows: frames, 4 texels (a matrix's columns) per bone.
  const w = B * 4;
  const h = frames.length;
  const data = new Uint16Array(w * h * 4);
  frames.forEach((mats, f) => {
    for (let b = 0; b < B; b++) {
      const e = mats[b];
      const o = (f * w + b * 4) * 4;
      for (let k = 0; k < 16; k++) data[o + k] = DataUtils.toHalfFloat(e[k]);
    }
  });
  const texture = new DataTexture(data, w, h, RGBAFormat, HalfFloatType);
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.needsUpdate = true;
  // From the head bone's own frame into the mesh's bind space: the skinning matrix of the head
  // is boneWorld * boneInverse * bindMatrix, so a point fixed to the bone (head wear, made in the
  // bone's frame) is at bindMatrix^-1 * boneInverse^-1 * p in bind space. Its origin is the
  // head joint: the pivot of a head turn.
  const head = bones.findIndex((b) => b.name === 'Head');
  const wearToBind = new Matrix4().copy(mesh.bindMatrix).invert().multiply(new Matrix4().copy(skeleton.boneInverses[head]).invert());
  const headBind = new Vector3().setFromMatrixPosition(wearToBind);
  return { texture, clips, head, headBind, wearToBind, bones: B };
}

/** Each bone's skinning matrix in the character root's space (mesh world * bind^-1 * bone * inverse * bind). */
function skinMatrices(mesh, bones) {
  const out = [];
  const inv = mesh.skeleton.boneInverses;
  for (let b = 0; b < bones.length; b++) {
    _m.multiplyMatrices(bones[b].matrixWorld, inv[b]);
    _m.premultiply(mesh.bindMatrixInverse).premultiply(mesh.matrixWorld);
    _m.multiply(mesh.bindMatrix);
    out.push(_m.elements.slice());
  }
  return out;
}

/**
 * LOD `lod`'s triangles with only the vertices they use, plus head wear (geometry in the
 * Head bone's frame) skinned to the head.
 */
function compactLod(type, lod, wearGeo, bakeInfo) {
  const meshes = [];
  type.scene.traverse((o) => o.isSkinnedMesh && meshes.push(o));
  const g = meshes[Math.min(lod, meshes.length - 1)].geometry;
  const index = g.index.array;
  const map = new Int32Array(g.attributes.position.count).fill(-1);
  const used = [];
  for (let k = 0; k < index.length; k++) {
    const v = index[k];
    if (map[v] < 0) {
      map[v] = used.length;
      used.push(v);
    }
  }
  const wear = wearGeo ? (wearGeo.index ? wearGeo.toNonIndexed() : wearGeo) : null;
  const nw = wear ? wear.attributes.position.count : 0;
  const n = used.length + nw;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const uv = new Float32Array(n * 2);
  const si = new Float32Array(n * 4);
  const sw = new Float32Array(n * 4);
  const part = new Float32Array(n);
  const A = g.attributes;
  used.forEach((v, i) => {
    pos[i * 3] = A.position.getX(v);
    pos[i * 3 + 1] = A.position.getY(v);
    pos[i * 3 + 2] = A.position.getZ(v);
    nor[i * 3] = A.normal.getX(v);
    nor[i * 3 + 1] = A.normal.getY(v);
    nor[i * 3 + 2] = A.normal.getZ(v);
    if (A.uv) {
      uv[i * 2] = A.uv.getX(v);
      uv[i * 2 + 1] = A.uv.getY(v);
    }
    for (let k = 0; k < 4; k++) {
      si[i * 4 + k] = A.skinIndex.getComponent(v, k);
      sw[i * 4 + k] = A.skinWeight.getComponent(v, k);
    }
    part[i] = A._part ? A._part.getX(v) : 0;
  });
  const idx = Array.from(index, (v) => map[v]);
  if (wear) {
    const p = new Vector3();
    const nn = new Vector3();
    const normalMat = bakeInfo.wearToBind.clone();
    for (let i = 0; i < nw; i++) {
      const j = used.length + i;
      p.fromBufferAttribute(wear.attributes.position, i).applyMatrix4(bakeInfo.wearToBind);
      nn.fromBufferAttribute(wear.attributes.normal, i).transformDirection(normalMat);
      pos.set([p.x, p.y, p.z], j * 3);
      nor.set([nn.x, nn.y, nn.z], j * 3);
      si[j * 4] = bakeInfo.head;
      sw[j * 4] = 1;
      part[j] = WEAR;
      idx.push(j);
    }
  }
  // One interleaved vertex buffer (WebGPU allows only 8 buffers per draw; the instances need theirs).
  const STRIDE = 17;
  const data = new Float32Array(n * STRIDE);
  for (let i = 0; i < n; i++) {
    const o = i * STRIDE;
    data.set(pos.subarray(i * 3, i * 3 + 3), o);
    data.set(nor.subarray(i * 3, i * 3 + 3), o + 3);
    data.set(uv.subarray(i * 2, i * 2 + 2), o + 6);
    data.set(si.subarray(i * 4, i * 4 + 4), o + 8);
    data.set(sw.subarray(i * 4, i * 4 + 4), o + 12);
    data[o + 16] = part[i];
  }
  const ib = new InterleavedBuffer(data, STRIDE);
  const out = new BufferGeometry();
  out.setAttribute('position', new InterleavedBufferAttribute(ib, 3, 0));
  out.setAttribute('normal', new InterleavedBufferAttribute(ib, 3, 3));
  out.setAttribute('uv', new InterleavedBufferAttribute(ib, 2, 6));
  out.setAttribute('skinIndex', new InterleavedBufferAttribute(ib, 4, 8));
  out.setAttribute('skinWeight', new InterleavedBufferAttribute(ib, 4, 12));
  out.setAttribute('_part', new InterleavedBufferAttribute(ib, 1, 16));
  out.setIndex(idx);
  return out;
}

/**
 * The crowd material (node based): the type's own (atlas, normal map), skinned in the vertex
 * stage from the baked texture (each instance's clip, phase and rate; the head turned about
 * the neck joint for a glance), then placed (position + yaw); recolored per outfit from the
 * palette; dithered while fading in / out; the merged head wear without the normal map.
 */
function crowdMaterial(type, bakeInfo, palette, uniforms) {
  const meshes = [];
  type.scene.traverse((o) => o.isSkinnedMesh && meshes.push(o));
  const src = meshes[0].material;
  const m = new MeshStandardNodeMaterial();
  for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'roughness', 'metalness', 'alphaTest', 'side']) if (src[k] !== undefined && src[k] !== null) m[k] = src[k];
  m.color.copy(src.color);
  m.normalScale.copy(src.normalScale);
  m.name = `crowd-${type.id}`;
  const bones = bakeInfo.texture;
  const head = int(bakeInfo.head);
  const headBind = vec3(...bakeInfo.headBind.toArray());
  const time = uniforms.time;
  const anim = attribute('aAnim', 'vec4'); // start frame, frames, phase 0..1, cycles per second
  const state = attribute('aState', 'vec2'); // head turn (rad), fade 0..1
  const place = attribute('aPlace', 'vec4'); // x, y, z, yaw
  const outfit = int(attribute('aOutfit', 'float').add(0.5));
  const part = int(attribute('_part', 'float').add(0.5));
  const rotY = (v, c, s) => vec3(c.mul(v.x).add(s.mul(v.z)), v.y, s.negate().mul(v.x).add(c.mul(v.z)));
  m.positionNode = Fn(() => {
    const N = anim.y;
    const F = mod(time.mul(anim.w).mul(N).add(anim.z.mul(N)), N).toVar();
    const f0 = int(anim.x).add(int(floor(F))).toVar();
    const f1 = int(anim.x).add(int(mod(floor(F).add(1), N))).toVar();
    const ft = fract(F).toVar();
    const bone = (b, f) => mat4(textureLoad(bones, ivec2(b.mul(4), f)), textureLoad(bones, ivec2(b.mul(4).add(1), f)), textureLoad(bones, ivec2(b.mul(4).add(2), f)), textureLoad(bones, ivec2(b.mul(4).add(3), f)));
    const boneAt = (b) => bone(b, f0).mul(ft.oneMinus()).add(bone(b, f1).mul(ft));
    const flags = textureLoad(palette, ivec2(part.mul(2).add(1), outfit));
    const p0 = vec4(positionGeometry.add(normalGeometry.mul(flags.y)), 1).toVar();
    const n0 = vec4(normalGeometry, 0).toVar();
    // The glance: the head's vertices turn about the head joint.
    const look = state.x;
    const lc = cos(look).toVar();
    const ls = sin(look).toVar();
    const pv = boneAt(head).mul(vec4(headBind, 1)).xyz.toVar();
    const pos = vec3(0).toVar();
    const nor = vec3(0).toVar();
    const si = attribute('skinIndex', 'vec4');
    const sw = attribute('skinWeight', 'vec4');
    for (const c of ['x', 'y', 'z', 'w']) {
      const w = sw[c];
      If(w.greaterThan(0), () => {
        const b = int(si[c].add(0.5));
        const M = boneAt(b).toVar();
        const pp = M.mul(p0).xyz.toVar();
        const nn = M.mul(n0).xyz.toVar();
        If(b.equal(head).and(abs(look).greaterThan(0.002)), () => {
          pp.assign(pv.add(rotY(pp.sub(pv), lc, ls)));
          nn.assign(rotY(nn, lc, ls));
        });
        pos.addAssign(pp.mul(w));
        nor.addAssign(nn.mul(w));
      });
    }
    // Placed: turned to the member's yaw, moved to its spot.
    const yc = cos(place.w).toVar();
    const ys = sin(place.w).toVar();
    normalLocal.assign(normalize(rotY(nor, yc, ys)));
    const placed = select(flags.z.greaterThan(0.5).or(state.y.lessThanEqual(0)), vec3(0), rotY(pos, yc, ys).add(place.xyz)).toVar();
    // Motion vectors: where it was last frame (the camera's own motion; people move slowly).
    positionPrevious.assign(placed);
    return placed;
  })();
  // The outfit's tint on the atlas (the texel's luminance relative to the part's mean).
  const t = textureLoad(palette, ivec2(part.mul(2), outfit));
  const fl = textureLoad(palette, ivec2(part.mul(2).add(1), outfit));
  const base = materialColor;
  const l = dot(base.rgb, vec3(0.2126, 0.7152, 0.0722));
  const rel = mix(l.div(max(fl.w, 0.02)), float(1), fl.x);
  m.colorNode = vec4(mix(base.rgb, t.rgb.mul(rel), t.a), base.a);
  // Fading in / out: dithered.
  const fade = state.y;
  const h = fract(sin(dot(screenCoordinate.xy, vec2(12.9898, 78.233))).mul(43758.5453));
  m.maskNode = fade.greaterThanEqual(0.999).or(h.lessThanEqual(fade));
  // The head wear: no normal map.
  m.normalNode = select(part.greaterThanEqual(int(WEAR)), normalViewGeometry, materialNormal);
  return m;
}

/** Palette rows for a list of outfits: per part [tint rgba][flat, inflate, hide, luminance]. */
function paletteTexture(type, outfits) {
  const w = SLOTS * 2;
  const data = new Float32Array(w * OUTFITS * 4);
  outfits.forEach((o, row) => {
    for (let p = 0; p < SLOTS; p++) {
      const t = o.tints[p];
      const at = (row * w + p * 2) * 4;
      if (t) data.set([t[0], t[1], t[2], t[3] ?? 1], at);
      data.set([o.flat[p] ?? 0, o.inflate[p] ?? 0, o.hide?.[p] ?? 0, type.info.partLum?.[p] ?? 0.3], at + 4);
    }
  });
  const tex = new DataTexture(data, w, OUTFITS, RGBAFormat, FloatType);
  tex.magFilter = NearestFilter;
  tex.minFilter = NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

/** A wardrobe outfit with its head wear as the crowd draws it: a variant + the wear's color. */
function crowdOutfit(id, info, kind, rand) {
  const o = makeOutfit(id, info, kind, rand);
  const tints = { ...o.tints };
  const flat = { ...o.flat };
  const hide = {};
  let wear = 'none';
  const h = o.head;
  if (h?.type === 'blackHat') {
    wear = 'hat';
    tints[WEAR] = [0.02, 0.02, 0.025, 1];
  } else if (h?.type === 'kippah') {
    wear = 'kippah';
    const style = h.style ?? 'velvet';
    const c = style === 'white' ? [0.92, 0.92, 0.9] : style === 'knit' ? [0.85, 0.83, 0.78] : [0.03, 0.03, 0.035];
    tints[WEAR] = [...c, 1];
  } else if (h?.type === 'scarf') {
    wear = 'scarf';
    const c = h.color;
    tints[WEAR] = [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255, 1];
    hide[PART.hair] = 1;
  }
  flat[WEAR] = 1;
  // source / kind: the same person as a full character (the player talks to them).
  return { tints, flat, inflate: o.inflate ?? {}, hide, wear, source: o, kind };
}

const WEARS = ['none', 'kippah', 'hat', 'scarf'];

export class CrowdRenderer {
  /**
   * @param {import('three').Scene} scene
   * @param {import('./CharacterLibrary.js').CharacterLibrary} library
   */
  constructor(scene, library) {
    this.scene = scene;
    this.library = library;
    this.root = new Group();
    this.root.name = 'crowd';
    scene.add(this.root);
    this.uniforms = { time: uniform(0) };
    this.types = []; // { id, info, bake, outfits: [...], byKind: { kind: [rows] }, meshes: { wear: [near, far] } }
  }

  /**
   * Prepares a character type for the crowd; returns its index. `kinds`: the NPC kinds its
   * outfits are drawn for (wardrobe.js), e.g. ['worshipper', 'civilian', 'tourist'].
   */
  addType(id, kinds, rand = Math.random) {
    const type = this.library.types.get(id);
    if (!type) return -1;
    const info = type.info;
    const b = bake(type);
    // Outfits: an even share per kind.
    const outfits = [];
    const byKind = {};
    for (let i = 0; i < OUTFITS; i++) {
      const kind = kinds[i % kinds.length];
      const o = crowdOutfit(id, info, kind, rand);
      (byKind[kind] ??= []).push(i);
      outfits.push(o);
    }
    const palette = paletteTexture(type, outfits);
    const material = crowdMaterial(type, b, palette, this.uniforms);
    // Head wear shapes for this head (the same fits the full characters use).
    const head = info.head;
    const wearGeo = { none: null };
    if (head) {
      try {
        if (info.sex === 'f') {
          const fit = type.fitted('scarf', (pts, t) => scarfFit(head, t.headSurface(PART.fixed), t.headSurface(PART.hair)));
          wearGeo.scarf = headscarf(head, 0xffffff, fit).geometry;
        } else {
          wearGeo.hat = blackHat(head, { fit: type.fitted('hat', (pts) => hatFit(head, pts)) }).geometry;
          wearGeo.kippah = kippah(head, { style: 'velvet', fit: type.fitted('kippah:velvet', (pts) => kippahFit(head, pts, KIPPAH.velvet.arc)) }).geometry;
        }
      } catch (e) {
        console.warn(`crowd head wear for ${id}`, e);
      }
    }
    const meshes = {};
    for (const wear of WEARS) {
      if (wear !== 'none' && !wearGeo[wear]) continue;
      meshes[wear] = [1, 2].map((lod) => ({ geometry: compactLod(type, lod, wearGeo[wear], b), mesh: null }));
    }
    this.types.push({ id, info, bake: b, outfits, byKind, meshes, material, members: {} });
    return this.types.length - 1;
  }

  /** A palette row for a member of `kind` (wardrobe kind) of type `t`. */
  outfitFor(t, kind, rand = Math.random) {
    const rows = this.types[t].byKind[kind] ?? Object.values(this.types[t].byKind)[0];
    return rows[Math.floor(rand() * rows.length) % rows.length];
  }

  /** The head wear an outfit row comes with (which mesh draws it). */
  wearOf(t, row) {
    return this.types[t].outfits[row].wear;
  }

  /** Builds the instanced meshes for the field's members (call once they are all added). */
  build(field) {
    for (const T of this.types) {
      for (const wear of Object.keys(T.meshes)) T.members[wear] = [];
    }
    for (const m of field.members) {
      const T = this.types[m.type];
      let wear = T.outfits[m.outfit].wear;
      if (!T.meshes[wear]) wear = 'none';
      T.members[wear].push(m);
    }
    for (const T of this.types) {
      for (const [wear, lods] of Object.entries(T.meshes)) {
        const cap = Math.max(1, T.members[wear].length);
        for (const l of lods) {
          if (l.mesh) {
            l.mesh.removeFromParent();
            l.mesh.geometry.dispose();
          }
          // One draw per type, wear and LOD: the members are instances (placed by the shader).
          const g = new InstancedBufferGeometry().copy(l.geometry);
          // Per member, one interleaved buffer: clip (4), place (4), look + fade (2), outfit, pad.
          const inst = new InstancedInterleavedBuffer(new Float32Array(cap * INST), INST).setUsage(DynamicDrawUsage);
          g.setAttribute('aAnim', new InterleavedBufferAttribute(inst, 4, 0));
          g.setAttribute('aPlace', new InterleavedBufferAttribute(inst, 4, 4));
          g.setAttribute('aState', new InterleavedBufferAttribute(inst, 2, 8));
          g.setAttribute('aOutfit', new InterleavedBufferAttribute(inst, 1, 10));
          g.userData.inst = inst;
          g.instanceCount = 0;
          g.boundingSphere = new Sphere(new Vector3(), 1e5);
          const mesh = new Mesh(g, T.material);
          mesh.frustumCulled = false;
          mesh.castShadow = false;
          mesh.receiveShadow = true;
          mesh.name = `crowd-${T.id}-${wear}`;
          l.mesh = mesh;
          this.root.add(mesh);
        }
      }
    }
  }

  /** Per frame: every member into its type's near or far mesh. */
  update(field, camera, dt) {
    this.uniforms.time.value += dt;
    const cx = camera.position.x;
    const cz = camera.position.z;
    const near2 = CROWD.near * CROWD.near;
    for (const T of this.types) {
      for (const [wear, lods] of Object.entries(T.meshes)) {
        const list = T.members[wear];
        const counts = [0, 0];
        for (const m of list) {
          if (m.fade <= 0) continue;
          const d2 = (m.x - cx) ** 2 + (m.z - cz) ** 2;
          const k = d2 < near2 ? 0 : 1;
          const mesh = lods[k].mesh;
          const i = counts[k]++;
          const g = mesh.geometry;
          const d = g.userData.inst.array;
          const o = i * INST;
          d[o + 4] = m.x;
          d[o + 5] = m.y;
          d[o + 6] = m.z;
          d[o + 7] = m.yaw;
          const c = T.bake.clips[m.act] ?? T.bake.clips[ACT.stand];
          // Moving people play their cycle at their own speed (no sliding feet).
          let rate = m.rate / c.duration;
          if ((m.act === ACT.walk || m.act === ACT.run || m.act === ACT.oldWalk || m.act === ACT.back) && c.speed > 0) rate = (m.speed / c.speed) / c.duration;
          d[o] = c.start;
          d[o + 1] = c.count;
          d[o + 2] = m.phase;
          d[o + 3] = rate;
          d[o + 8] = m.look;
          d[o + 9] = m.fade;
          d[o + 10] = m.outfit;
        }
        lods.forEach((l, k) => {
          const mesh = l.mesh;
          const g = mesh.geometry;
          g.instanceCount = counts[k];
          mesh.visible = counts[k] > 0;
          if (!counts[k]) return;
          g.userData.inst.needsUpdate = true;
        });
      }
    }
  }

  dispose() {
    this.root.removeFromParent();
  }
}
