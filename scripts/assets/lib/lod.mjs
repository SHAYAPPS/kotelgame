// Levels of detail with meshoptimizer: every LOD indexes the same vertex buffer, so the
// GPU keeps one copy of the vertices and the LODs only differ in their index buffers.
//
// Each LOD is bounded by an error (relative to the body's size: 0.003 of 1.8 m is 5 mm), not
// by a triangle count. A count target is a floor for meshoptimizer: when the locked face and
// the clothing borders leave nothing cheap to remove, it reaches the count anyway by
// collapsing whole limbs (sleeves into blades, feet into spikes). `max` caps the count:
// past it the LOD may take a bounded extra error (x3) to get there.
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

await MeshoptSimplifier.ready;
await MeshoptEncoder.ready;

// LOD0 < 12 m (drawn up close: talking faces, hands on rifles), LOD1 to 32 m (a person
// ~50-120 px tall: 1.4 cm is under a pixel), LOD2 beyond (prune drops buckles and straps
// smaller than the error instead of leaving them as shards).
// LOD1 simplifies the face (the LOD0 lock region: lips, eyes, teeth) to its own smaller
// error first: at the body's error the teeth poke through the lips and the eyes go dark.
export const DEFAULT_LODS = [
  { error: 0.003, max: 28000, normals: 0.25, uv: 1 },
  { error: 0.007, faceError: 0.0025, max: 6000, normals: 0.1, uv: 0.5 },
  { error: 0.02, max: 2500, normals: 0.1, uv: 0.5, prune: true },
];

function attributes(geo) {
  const n = geo.count;
  const attrs = new Float32Array(n * 5);
  for (let i = 0; i < n; i++) {
    attrs[i * 5] = geo.normal[i * 3];
    attrs[i * 5 + 1] = geo.normal[i * 3 + 1];
    attrs[i * 5 + 2] = geo.normal[i * 3 + 2];
    attrs[i * 5 + 3] = geo.uvAtlas[i * 2];
    attrs[i * 5 + 4] = geo.uvAtlas[i * 2 + 1];
  }
  return attrs;
}

function simplify(geo, attrs, index, spec, lockBorder, lock) {
  const w = [spec.normals, spec.normals, spec.normals, spec.uv, spec.uv];
  const flags = [];
  if (lockBorder) flags.push('LockBorder');
  if (spec.prune) flags.push('Prune');
  const run = (src, target, error, locked) => MeshoptSimplifier.simplifyWithAttributes(src, geo.position, 3, attrs, 5, w, locked, target * 3, error, flags);
  if (spec.faceError && spec.face) {
    // The face alone (everything else locked), then the rest with the face locked.
    const rest = new Uint8Array(geo.count);
    for (let i = 0; i < geo.count; i++) rest[i] = spec.face[i] ? 0 : 1;
    [index] = run(index, 0, spec.faceError, rest);
    lock = spec.face;
  }
  let [out, error] = run(index, 0, spec.error, lock);
  if (out.length / 3 > spec.max) [out, error] = run(index, spec.max, spec.error * 3, lock);
  return { index: out, error };
}

/**
 * @param {object} geo merged geometry with `uvAtlas`
 * @param {Uint32Array} index LOD0 source triangles
 * @param {{ error: number, faceError?: number, max: number, normals: number, uv: number, prune?: boolean }[]} specs
 *   per LOD (DEFAULT_LODS); each LOD simplifies the previous one
 * @param {{ lock?: Uint8Array, lining?: Uint8Array }} opts lock: 1 per vertex LOD0 must keep
 *   (the face); lining: 1 per vertex of a lining (dropped from LOD1 on)
 * @returns {{ geo: object, lods: Uint32Array[], errors: number[] }} geometry compacted to the
 *   used vertices, LOD0 in vertex-cache order; the error each LOD reached (relative)
 */
export function buildLods(geo, index, specs = DEFAULT_LODS, { lock = null, lining = null } = {}) {
  const attrs = attributes(geo);
  const lods = [];
  const errors = [];
  let src = index;
  let total = 0;
  specs.forEach((spec, i) => {
    if (i === 1 && lining) {
      // Linings (the inside of a skirt) only matter up close; farther away the simplified
      // lining would poke through the outside.
      src = src.filter((_, k) => !(lining[src[k - (k % 3)]] && lining[src[k - (k % 3) + 1]] && lining[src[k - (k % 3) + 2]]));
    }
    // LOD0 keeps part borders (collars, cuffs) and the locked vertices (the face: talking,
    // blinking); lower LODs may move them (LOD1 keeps the face to an error of its own).
    const r = simplify(geo, attrs, src, { ...spec, face: lock }, i === 0, i === 0 ? lock : null);
    src = r.index;
    total += r.error;
    lods.push(Uint32Array.from(src));
    errors.push(+total.toFixed(4));
  });
  // Vertex cache / fetch order for LOD0; the remap moves every vertex attribute.
  const lod0 = lods[0];
  const [remap, unique] = MeshoptEncoder.reorderMesh(lod0, true, false);
  const pick = (arr, size, Type = arr.constructor) => {
    const out = new Type(unique * size);
    for (let old = 0; old < geo.count; old++) {
      const nw = remap[old];
      if (nw === 0xffffffff) continue;
      for (let k = 0; k < size; k++) out[nw * size + k] = arr[old * size + k];
    }
    return out;
  };
  const out = {
    count: unique,
    position: pick(geo.position, 3),
    normal: pick(geo.normal, 3),
    uvAtlas: pick(geo.uvAtlas, 2),
    joints: pick(geo.joints, 4),
    weights: pick(geo.weights, 4),
    part: pick(geo.part, 1),
  };
  // Lower LODs use a subset of LOD0's vertices: just renumber them.
  for (let i = 1; i < lods.length; i++) {
    const l = lods[i];
    for (let k = 0; k < l.length; k++) l[k] = remap[l[k]];
  }
  return { geo: out, lods, errors };
}
