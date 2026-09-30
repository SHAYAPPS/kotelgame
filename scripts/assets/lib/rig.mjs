// Skeleton + merged skinned mesh of a Mixamo FBX character, in meters, at its bind pose.
import * as THREE from 'three';
import { boneName } from './fbx.mjs';

const _m = new THREE.Matrix4();
const _t = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _n = new THREE.Matrix3();
const _v = new THREE.Vector3();

/**
 * The bone hierarchy in depth-first order with unique names (Mixamo rigs sometimes have two
 * bones with the same name, e.g. a zero-length helper under Spine2; the extra ones get a
 * suffix so animation tracks bind to the real bone).
 * @returns {{ bones: { name, parent, object, world: THREE.Matrix4, t: number[], q: number[] }[], unit: number }}
 */
export function extractSkeleton(root, { height = null } = {}) {
  root.updateMatrixWorld(true);
  const objects = [];
  root.traverse((o) => {
    if (o.isBone) objects.push(o);
  });
  const names = new Set();
  const bones = objects.map((o) => {
    let name = boneName(o.name);
    for (let i = 2; names.has(name); i++) name = `${boneName(o.name)}_${i}`;
    names.add(name);
    return { name, object: o, parent: -1 };
  });
  for (const b of bones) b.parent = objects.indexOf(b.object.parent);

  // Units: Mixamo exports centimeters, but some characters come out at other scales.
  const top = bones.find((b) => b.name === 'HeadTop_End') ?? bones.find((b) => b.name === 'Head');
  const topY = top.object.getWorldPosition(_v).y;
  let unit = topY > 140 && topY < 215 ? 0.01 : topY > 1.4 && topY < 2.15 ? 1 : 1.78 / topY;
  if (height) unit = height / topY;

  for (const b of bones) {
    b.object.matrixWorld.decompose(_t, _q, _s);
    b.world = new THREE.Matrix4().compose(_t.multiplyScalar(unit), _q, new THREE.Vector3(1, 1, 1));
  }
  // Duplicate bones (a second copy of the hierarchy for one mesh, or a zero-length helper)
  // at the same place as the first bone of that name become aliases of it: their vertices
  // follow the animated bone.
  const first = new Map();
  let aliasDrift = 0;
  for (const b of bones) {
    const base = boneName(b.object.name);
    const p = first.get(base);
    if (!p) {
      first.set(base, b);
      continue;
    }
    const d = _t.setFromMatrixPosition(b.world).distanceTo(_s.setFromMatrixPosition(p.world));
    if (d < 0.01) {
      b.alias = p;
      aliasDrift = Math.max(aliasDrift, d);
    }
  }
  const kept = bones.filter((b) => !b.alias);
  const index = new Map(kept.map((b, i) => [b, i]));
  const resolve = (b) => (b.alias ? b.alias : b);
  for (const b of kept) {
    // Parent: the nearest ancestor bone, through aliases.
    let o = b.object.parent;
    let parent = null;
    while (o && !parent) {
      const pb = bones.find((x) => x.object === o);
      if (pb) parent = resolve(pb);
      o = o.parent;
    }
    b.parent = parent ? index.get(parent) : -1;
  }
  for (const b of kept) {
    const local = b.parent >= 0 ? _m.copy(kept[b.parent].world).invert().multiply(b.world) : _m.copy(b.world);
    local.decompose(_t, _q, _s);
    b.t = _t.toArray();
    b.q = _q.normalize().toArray();
  }
  // Bone object -> index in `kept` (aliases map to their bone).
  const indexOf = new Map(bones.map((b) => [b.object, index.get(resolve(b))]));
  return { bones: kept, unit, indexOf, aliases: bones.length - kept.length, aliasDrift };
}

/**
 * Merges the character's skinned meshes into one welded, indexed geometry in root space
 * (meters, bind pose). Per vertex: position, normal, uv (FBX convention, v up), four joints
 * and weights (renormalized), a part id and a material id.
 * @param {(mesh, material) => boolean} keep drop meshes / material groups (eyelashes...)
 * @param {(mesh, material) => number} partOf tint slot
 */
export function mergeMeshes(root, skeleton, { keep = () => true, partOf = () => 0 } = {}) {
  const { unit } = skeleton;
  const boneIndex = skeleton.indexOf;
  const materials = []; // distinct materials in first-use order
  const matId = (m) => {
    let i = materials.indexOf(m);
    if (i < 0) i = materials.push(m) - 1;
    return i;
  };
  const verts = []; // flat records, welded later
  const meshes = [];
  root.traverse((o) => {
    if (o.isSkinnedMesh) meshes.push(o);
  });
  let bindDrift = 0;
  for (const mesh of meshes) {
    const g = mesh.geometry;
    const pos = g.attributes.position;
    const nrm = g.attributes.normal;
    const uv = g.attributes.uv;
    const si = g.attributes.skinIndex;
    const sw = g.attributes.skinWeight;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    // FBXLoader binds with the pose node's matrix; normally the mesh's world matrix.
    for (let k = 0; k < 16; k++) bindDrift = Math.max(bindDrift, Math.abs(mesh.bindMatrix.elements[k] - mesh.matrixWorld.elements[k]));
    const M = mesh.bindMatrix;
    _n.getNormalMatrix(M);
    const groups = g.groups.length ? g.groups : [{ start: 0, count: g.index ? g.index.count : pos.count, materialIndex: 0 }];
    for (const grp of groups) {
      const material = mats[grp.materialIndex ?? 0];
      if (!keep(mesh, material)) continue;
      const mid = matId(material);
      const part = partOf(mesh, material);
      for (let k = grp.start; k < grp.start + grp.count; k++) {
        const i = g.index ? g.index.getX(k) : k;
        _v.fromBufferAttribute(pos, i).applyMatrix4(M).multiplyScalar(unit);
        const p = _v.toArray();
        _v.fromBufferAttribute(nrm, i).applyMatrix3(_n).normalize();
        const n = _v.toArray();
        const j = [0, 0, 0, 0];
        const w = [0, 0, 0, 0];
        let sum = 0;
        for (let c = 0; c < 4; c++) {
          const bone = mesh.skeleton.bones[si.getComponent(i, c)];
          const weight = sw.getComponent(i, c);
          if (weight <= 0 || !bone) continue;
          j[c] = boneIndex.get(bone);
          w[c] = weight;
          sum += weight;
        }
        if (sum <= 0) throw new Error(`vertex without weights in ${mesh.name}`);
        for (let c = 0; c < 4; c++) w[c] /= sum;
        verts.push({ p, n, uv: uv ? [uv.getX(i), uv.getY(i)] : [0, 0], j, w, part, mat: mid, mesh: mesh.name });
      }
    }
  }
  // Weld identical vertices.
  const key = (v) =>
    v.p.map((x) => Math.round(x * 1e5)).join(',') + '|' + v.n.map((x) => Math.round(x * 1e3)).join(',') + '|' + v.uv.map((x) => Math.round(x * 1e5)).join(',') + '|' + v.mat;
  const map = new Map();
  const unique = [];
  const index = new Uint32Array(verts.length);
  for (let k = 0; k < verts.length; k++) {
    const kk = key(verts[k]);
    let i = map.get(kk);
    if (i === undefined) {
      i = unique.length;
      map.set(kk, i);
      unique.push(verts[k]);
    }
    index[k] = i;
  }
  const n = unique.length;
  const out = {
    count: n,
    position: new Float32Array(n * 3),
    normal: new Float32Array(n * 3),
    uv: new Float32Array(n * 2),
    joints: new Uint16Array(n * 4),
    weights: new Float32Array(n * 4),
    part: new Uint8Array(n),
    mat: new Uint8Array(n),
    meshName: new Array(n),
    index,
    materials,
    bindDrift,
  };
  unique.forEach((v, i) => {
    out.position.set(v.p, i * 3);
    out.normal.set(v.n, i * 3);
    out.uv.set(v.uv, i * 2);
    out.joints.set(v.j, i * 4);
    out.weights.set(v.w, i * 4);
    out.part[i] = v.part;
    out.mat[i] = v.mat;
    out.meshName[i] = v.mesh;
  });
  return out;
}

/**
 * Tiled UVs (outside 0..1) can't live in an atlas: move each triangle back into the unit
 * tile (every triangle lies inside one tile), duplicating vertices shared across tiles.
 * Returns the number of shifted triangles; `geo` is updated in place.
 */
export function wrapUVs(geo) {
  const idx = geo.index;
  const copies = new Map(); // `${vertex}:${du},${dv}` -> new vertex
  const extra = [];
  let shifted = 0;
  for (let t = 0; t < idx.length; t += 3) {
    let cu = 0;
    let cv = 0;
    for (let k = 0; k < 3; k++) {
      cu += geo.uv[idx[t + k] * 2] / 3;
      cv += geo.uv[idx[t + k] * 2 + 1] / 3;
    }
    const du = Math.floor(cu);
    const dv = Math.floor(cv);
    if (!du && !dv) continue;
    shifted++;
    for (let k = 0; k < 3; k++) {
      const v = idx[t + k];
      const key = `${v}:${du},${dv}`;
      let nv = copies.get(key);
      if (nv === undefined) {
        nv = geo.count + extra.length;
        copies.set(key, nv);
        extra.push({ src: v, du, dv });
      }
      idx[t + k] = nv;
    }
  }
  if (!extra.length) return 0;
  const n = geo.count + extra.length;
  const grow = (arr, size) => {
    const out = new arr.constructor(n * size);
    out.set(arr);
    extra.forEach((e, i) => out.set(arr.subarray(e.src * size, e.src * size + size), (geo.count + i) * size));
    return out;
  };
  geo.position = grow(geo.position, 3);
  geo.normal = grow(geo.normal, 3);
  geo.uv = grow(geo.uv, 2);
  geo.joints = grow(geo.joints, 4);
  geo.weights = grow(geo.weights, 4);
  geo.part = grow(geo.part, 1);
  geo.mat = grow(geo.mat, 1);
  extra.forEach((e, i) => {
    const o = (geo.count + i) * 2;
    geo.uv[o] -= e.du;
    geo.uv[o + 1] -= e.dv;
    geo.meshName.push(geo.meshName[e.src]);
  });
  geo.count = n;
  return shifted;
}

/** Inverse bind matrices (column-major, 16 floats per bone). */
export function inverseBinds(bones) {
  const out = new Float32Array(bones.length * 16);
  bones.forEach((b, i) => _m.copy(b.world).invert().toArray(out, i * 16));
  return out;
}

/** World-space rest position of a bone (meters). */
export function bonePosition(skeleton, name) {
  const b = skeleton.bones.find((x) => x.name === name);
  return b ? new THREE.Vector3().setFromMatrixPosition(b.world) : null;
}
