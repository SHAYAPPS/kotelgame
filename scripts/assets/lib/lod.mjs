// Levels of detail with meshoptimizer: every LOD indexes the same vertex buffer, so the
// GPU keeps one copy of the vertices and the LODs only differ in their index buffers.
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

await MeshoptSimplifier.ready;
await MeshoptEncoder.ready;

function simplifyTo(geo, index, targetTris, lockBorder) {
  if (index.length / 3 <= targetTris) return index;
  // Normals and UVs matter for shading/texture seams; positions dominate.
  const n = geo.count;
  const attrs = new Float32Array(n * 5);
  for (let i = 0; i < n; i++) {
    attrs[i * 5] = geo.normal[i * 3] * 0.5;
    attrs[i * 5 + 1] = geo.normal[i * 3 + 1] * 0.5;
    attrs[i * 5 + 2] = geo.normal[i * 3 + 2] * 0.5;
    attrs[i * 5 + 3] = geo.uvAtlas[i * 2];
    attrs[i * 5 + 4] = geo.uvAtlas[i * 2 + 1];
  }
  const flags = lockBorder ? ['LockBorder'] : [];
  const [out] = MeshoptSimplifier.simplifyWithAttributes(index, geo.position, 3, attrs, 5, [0.5, 0.5, 0.5, 1, 1], null, targetTris * 3, 0.2, flags);
  return out;
}

/**
 * @param {object} geo merged geometry with `uvAtlas`
 * @param {Uint32Array} index LOD0 source triangles
 * @param {number[]} targets max triangles per LOD, e.g. [12000, 4000, 1300]
 * @returns {{ geo: object, lods: Uint32Array[] }} geometry compacted to the used vertices,
 *   LOD0 in vertex-cache order
 */
export function buildLods(geo, index, targets) {
  const lods = [];
  let src = index;
  targets.forEach((t, i) => {
    // LOD0 keeps part borders (collars, cuffs); lower LODs may move them.
    src = simplifyTo(geo, src, t, i === 0);
    lods.push(Uint32Array.from(src));
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
  return { geo: out, lods };
}
