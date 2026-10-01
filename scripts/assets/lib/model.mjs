// Static (and simple skinned) models for the weapon / vehicle converter (scripts/assets/weapons.mjs):
// geometry helpers on plain arrays and a GLB writer with glTF-Transform (quantized attributes,
// EXT_meshopt_compression, KTX2 textures), the same encoding as the character files.
import { Document, NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization, KHRTextureBasisu } from '@gltf-transform/extensions';
import { quantize } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import * as THREE from 'three';

await MeshoptEncoder.ready;

/**
 * A mesh's triangles as plain arrays in the space `matrix` maps to (default: the mesh's world
 * matrix): { position, normal, uv, index } (Float32Array / Uint32Array), unindexed input
 * welded where position, normal and uv all match.
 */
export function meshArrays(mesh, matrix = mesh.matrixWorld) {
  const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
  const pos = g.attributes.position;
  const nrm = g.attributes.normal;
  const uv = g.attributes.uv;
  const nm = new THREE.Matrix3().getNormalMatrix(matrix);
  const v = new THREE.Vector3();
  const map = new Map();
  const position = [];
  const normal = [];
  const uvs = [];
  const index = [];
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(matrix);
    const p = [v.x, v.y, v.z];
    if (nrm) v.fromBufferAttribute(nrm, i).applyMatrix3(nm).normalize();
    else v.set(0, 1, 0);
    const n = [v.x, v.y, v.z];
    const t = uv ? [uv.getX(i), 1 - uv.getY(i)] : [0, 0]; // FBX/OBJ v-up -> glTF v-down
    const key = [...p, ...n, ...t].map((x) => Math.round(x * 1e5)).join(',');
    let k = map.get(key);
    if (k === undefined) {
      k = position.length / 3;
      map.set(key, k);
      position.push(...p);
      normal.push(...n);
      uvs.push(...t);
    }
    index.push(k);
  }
  // Mirrored transforms flip the winding.
  if (matrix.determinant() < 0) for (let i = 0; i < index.length; i += 3) [index[i + 1], index[i + 2]] = [index[i + 2], index[i + 1]];
  return { position: new Float32Array(position), normal: new Float32Array(normal), uv: new Float32Array(uvs), index: new Uint32Array(index) };
}

/** Concatenates mesh arrays (same attribute set). */
export function mergeArrays(list) {
  const out = { position: [], normal: [], uv: [], index: [] };
  let base = 0;
  for (const m of list) {
    out.position.push(...m.position);
    out.normal.push(...m.normal);
    out.uv.push(...m.uv);
    for (const i of m.index) out.index.push(i + base);
    base += m.position.length / 3;
  }
  return { position: new Float32Array(out.position), normal: new Float32Array(out.normal), uv: new Float32Array(out.uv), index: new Uint32Array(out.index) };
}

/** Moves every vertex by -offset (re-centers a part on its pivot). */
export function translateArrays(m, x, y, z) {
  for (let i = 0; i < m.position.length; i += 3) {
    m.position[i] -= x;
    m.position[i + 1] -= y;
    m.position[i + 2] -= z;
  }
  return m;
}

export function bounds(m, pick = null) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < m.position.length / 3; i++) {
    if (pick && !pick(m.position[i * 3], m.position[i * 3 + 1], m.position[i * 3 + 2])) continue;
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], m.position[i * 3 + k]);
      max[k] = Math.max(max[k], m.position[i * 3 + k]);
    }
  }
  return { min, max, center: min.map((a, k) => (a + max[k]) / 2), size: min.map((a, k) => max[k] - a) };
}

/**
 * Smooth normals with a crease angle: faces meeting at more than `angle` (radians) keep a
 * hard edge (vertices split), the rest are averaged (area weighted). Faceted low-poly models
 * shade like real surfaces this way.
 */
export function creaseNormals(m, angle = 0.6) {
  const { position, uv, index } = m;
  const nTri = index.length / 3;
  const fn = new Float32Array(nTri * 3);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let t = 0; t < nTri; t++) {
    a.fromArray(position, index[t * 3] * 3);
    b.fromArray(position, index[t * 3 + 1] * 3);
    c.fromArray(position, index[t * 3 + 2] * 3);
    b.sub(a);
    c.sub(a);
    b.cross(c); // length = 2 * area
    fn[t * 3] = b.x;
    fn[t * 3 + 1] = b.y;
    fn[t * 3 + 2] = b.z;
  }
  // Corners grouped by welded position.
  const key = (i) => `${Math.round(position[i * 3] * 1e4)},${Math.round(position[i * 3 + 1] * 1e4)},${Math.round(position[i * 3 + 2] * 1e4)}`;
  const groups = new Map();
  for (let k = 0; k < index.length; k++) {
    const id = key(index[k]);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(k);
  }
  const cos = Math.cos(angle);
  const out = { position: [], normal: [], uv: [], index: new Uint32Array(index.length) };
  const unit = (t) => {
    const l = Math.hypot(fn[t * 3], fn[t * 3 + 1], fn[t * 3 + 2]) || 1;
    return [fn[t * 3] / l, fn[t * 3 + 1] / l, fn[t * 3 + 2] / l];
  };
  const vmap = new Map();
  for (const corners of groups.values()) {
    for (const k of corners) {
      const t = Math.floor(k / 3);
      const u = unit(t);
      let nx = 0;
      let ny = 0;
      let nz = 0;
      for (const k2 of corners) {
        const t2 = Math.floor(k2 / 3);
        const u2 = unit(t2);
        if (u[0] * u2[0] + u[1] * u2[1] + u[2] * u2[2] < cos) continue;
        // Each face counts once per corner group.
        nx += fn[t2 * 3];
        ny += fn[t2 * 3 + 1];
        nz += fn[t2 * 3 + 2];
      }
      const l = Math.hypot(nx, ny, nz) || 1;
      const v = index[k];
      const n = [nx / l, ny / l, nz / l];
      const vk = `${v}|${n.map((x) => Math.round(x * 1e3)).join(',')}`;
      let o = vmap.get(vk);
      if (o === undefined) {
        o = out.position.length / 3;
        vmap.set(vk, o);
        out.position.push(position[v * 3], position[v * 3 + 1], position[v * 3 + 2]);
        out.normal.push(...n);
        out.uv.push(uv[v * 2], uv[v * 2 + 1]);
      }
      out.index[k] = o;
    }
  }
  return { position: new Float32Array(out.position), normal: new Float32Array(out.normal), uv: new Float32Array(out.uv), index: out.index };
}

function io() {
  return new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization, KHRTextureBasisu]).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
}

/**
 * Writes a GLB.
 * @param {{ name: string, extras?: object,
 *   materials: Record<string, { color?: Uint8Array, normal?: Uint8Array, orm?: Uint8Array,
 *     baseColor?: number[], metallic?: number, roughness?: number, doubleSided?: boolean, alpha?: 'BLEND' | 'MASK' }>,
 *   nodes: Array<{ name: string, t?: number[], r?: number[], s?: number[], extras?: object,
 *     meshes?: Array<{ arrays: object, material: string }>, children?: object[] }>,
 *   skin?: { bones: Array<{ name: string, parent: number, t: number[], r: number[] }>, ibm: Float32Array, node: string } }} model
 *   Node meshes: arrays { position, normal, uv, index, joints?, weights? } in the node's space.
 */
export async function writeModel(model) {
  const doc = new Document();
  const buf = doc.createBuffer();
  doc.createExtension(KHRTextureBasisu).setRequired(true);
  const scene = doc.createScene(model.name);
  const root = doc.createNode(model.name).setExtras(model.extras ?? {});
  scene.addChild(root);
  const tex = (name, bytes) => doc.createTexture(name).setImage(bytes).setMimeType('image/ktx2');
  const mats = {};
  for (const [name, m] of Object.entries(model.materials)) {
    const mat = doc
      .createMaterial(name)
      .setBaseColorFactor(m.baseColor ?? [1, 1, 1, 1])
      .setMetallicFactor(m.metallic ?? (m.orm ? 1 : 0))
      .setRoughnessFactor(m.roughness ?? 1)
      .setDoubleSided(!!m.doubleSided);
    if (m.alpha) mat.setAlphaMode(m.alpha);
    if (m.color) mat.setBaseColorTexture(tex(`${name}_color`, m.color));
    if (m.normal) mat.setNormalTexture(tex(`${name}_normal`, m.normal));
    if (m.orm) {
      const orm = tex(`${name}_orm`, m.orm);
      mat.setMetallicRoughnessTexture(orm).setOcclusionTexture(orm);
    }
    mats[name] = mat;
  }
  const acc = (type, array) => doc.createAccessor().setType(type).setArray(array).setBuffer(buf);
  const byName = {};
  const build = (spec, parent) => {
    const node = doc.createNode(spec.name);
    if (spec.t) node.setTranslation(spec.t);
    if (spec.r) node.setRotation(spec.r);
    if (spec.s) node.setScale(spec.s);
    if (spec.extras) node.setExtras(spec.extras);
    if (spec.meshes?.length) {
      const mesh = doc.createMesh(spec.name);
      for (const { arrays: a, material } of spec.meshes) {
        const prim = doc
          .createPrimitive()
          .setAttribute('POSITION', acc('VEC3', a.position))
          .setAttribute('NORMAL', acc('VEC3', a.normal))
          .setAttribute('TEXCOORD_0', acc('VEC2', a.uv))
          .setIndices(acc('SCALAR', a.position.length / 3 < 65536 ? Uint16Array.from(a.index) : a.index))
          .setMaterial(mats[material]);
        if (a.joints) {
          prim.setAttribute('JOINTS_0', acc('VEC4', a.joints));
          prim.setAttribute('WEIGHTS_0', acc('VEC4', a.weights).setNormalized(true));
        }
        mesh.addPrimitive(prim);
      }
      node.setMesh(mesh);
    }
    parent.addChild(node);
    byName[spec.name] = node;
    for (const c of spec.children ?? []) build(c, node);
    return node;
  };
  for (const n of model.nodes) build(n, root);
  if (model.skin) {
    const { bones, ibm } = model.skin;
    const joints = bones.map((b) => doc.createNode(b.name).setTranslation(b.t).setRotation(b.r));
    bones.forEach((b, i) => (b.parent >= 0 ? joints[b.parent] : root).addChild(joints[i]));
    const skin = doc.createSkin('skin').setInverseBindMatrices(acc('MAT4', ibm)).setSkeleton(joints[0]);
    for (const j of joints) skin.addJoint(j);
    byName[model.skin.node].setSkin(skin);
  }
  await doc.transform(
    quantize({
      pattern: /^(POSITION|NORMAL|TEXCOORD_0)$/,
      normalizeWeights: false,
      quantizationVolume: 'mesh',
      quantizePosition: 14,
      quantizeNormal: 10,
      quantizeTexcoord: 14,
    }),
  );
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
  return io().writeBinary(doc);
}

/** Per vertex: the four influences sorted by weight, weights as 8-bit summing to 255. */
export function packSkin(srcJ, srcW) {
  const n = srcW.length / 4;
  const joints = new Uint8Array(n * 4);
  const weights = new Uint8Array(n * 4);
  const order = [0, 1, 2, 3];
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    order.sort((a, b) => srcW[o + b] - srcW[o + a]);
    let sum = 0;
    for (let k = 0; k < 4; k++) {
      joints[o + k] = srcJ[o + order[k]];
      weights[o + k] = Math.round(srcW[o + order[k]] * 255);
      sum += weights[o + k];
    }
    weights[o] += 255 - sum;
    for (let k = 0; k < 4; k++) if (weights[o + k] === 0) joints[o + k] = joints[o];
  }
  return { joints, weights };
}

/** Principal axes of a point set (largest spread first), via power iteration on the covariance. */
export function principalAxes(position) {
  const n = position.length / 3;
  const c = [0, 0, 0];
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) c[k] += position[i * 3 + k] / n;
  const m = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < n; i++) {
    const d = [position[i * 3] - c[0], position[i * 3 + 1] - c[1], position[i * 3 + 2] - c[2]];
    for (let r = 0; r < 3; r++) for (let q = 0; q < 3; q++) m[r * 3 + q] += d[r] * d[q];
  }
  const axes = [];
  const mat = m.slice();
  for (let k = 0; k < 3; k++) {
    let v = [1, 0.3, 0.1];
    for (let it = 0; it < 200; it++) {
      const w = [0, 1, 2].map((r) => mat[r * 3] * v[0] + mat[r * 3 + 1] * v[1] + mat[r * 3 + 2] * v[2]);
      for (const a of axes) {
        const d = w[0] * a[0] + w[1] * a[1] + w[2] * a[2];
        for (let r = 0; r < 3; r++) w[r] -= d * a[r];
      }
      const l = Math.hypot(...w) || 1;
      v = w.map((x) => x / l);
    }
    axes.push(v);
  }
  return { center: c, axes };
}
