// Removes body triangles hidden under clothing (Fuse characters model the whole body under
// separate shirt / pants / shoe shells). Saves triangles and stops skin poking through the
// clothes when joints bend or the mesh is simplified.

const CELL = 0.04;

function cellKey(x, y, z) {
  return `${Math.floor(x / CELL)},${Math.floor(y / CELL)},${Math.floor(z / CELL)}`;
}

/**
 * @param {object} geo merged geometry (rig.mjs)
 * @param {(i: number) => boolean} isBody vertex belongs to the skin mesh
 * @param {(i: number) => boolean} isCover vertex belongs to a covering mesh (clothes, shoes)
 * @param {number} reach how far outside the skin a covering surface may be (m)
 * @returns {Uint32Array} the index buffer without the hidden triangles
 */
export function removeHidden(geo, isBody, isCover, reach = 0.06) {
  const P = geo.position;
  const N = geo.normal;
  const idx = geo.index;
  // Grid of covering triangles.
  const grid = new Map();
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t];
    if (!isCover(a)) continue;
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let k = 0; k < 3; k++) {
      const v = idx[t + k] * 3;
      minX = Math.min(minX, P[v]); maxX = Math.max(maxX, P[v]);
      minY = Math.min(minY, P[v + 1]); maxY = Math.max(maxY, P[v + 1]);
      minZ = Math.min(minZ, P[v + 2]); maxZ = Math.max(maxZ, P[v + 2]);
    }
    for (let x = Math.floor(minX / CELL); x <= Math.floor(maxX / CELL); x++)
      for (let y = Math.floor(minY / CELL); y <= Math.floor(maxY / CELL); y++)
        for (let z = Math.floor(minZ / CELL); z <= Math.floor(maxZ / CELL); z++) {
          const k = `${x},${y},${z}`;
          let list = grid.get(k);
          if (!list) grid.set(k, (list = []));
          list.push(t);
        }
  }
  const hitsCover = (ox, oy, oz, dx, dy, dz) => {
    // March the cells along the ray; Moller-Trumbore against their triangles.
    const steps = Math.ceil(reach / (CELL * 0.5));
    const seen = new Set();
    for (let s = 0; s <= steps; s++) {
      const d = (s / steps) * reach;
      const k = cellKey(ox + dx * d, oy + dy * d, oz + dz * d);
      if (seen.has(k)) continue;
      seen.add(k);
      const list = grid.get(k);
      if (!list) continue;
      for (const t of list) {
        const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
        const e1x = P[b] - P[a], e1y = P[b + 1] - P[a + 1], e1z = P[b + 2] - P[a + 2];
        const e2x = P[c] - P[a], e2y = P[c + 1] - P[a + 1], e2z = P[c + 2] - P[a + 2];
        const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
        const det = e1x * px + e1y * py + e1z * pz;
        if (Math.abs(det) < 1e-12) continue;
        const inv = 1 / det;
        const tx = ox - P[a], ty = oy - P[a + 1], tz = oz - P[a + 2];
        const u = (tx * px + ty * py + tz * pz) * inv;
        if (u < 0 || u > 1) continue;
        const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
        const v = (dx * qx + dy * qy + dz * qz) * inv;
        if (v < 0 || u + v > 1) continue;
        const dist = (e2x * qx + e2y * qy + e2z * qz) * inv;
        if (dist >= 0 && dist <= reach) return true;
      }
    }
    return false;
  };
  const covered = new Uint8Array(geo.count);
  for (let i = 0; i < geo.count; i++) {
    if (!isBody(i)) continue;
    const o = i * 3;
    covered[i] = hitsCover(P[o] + N[o] * 0.001, P[o + 1] + N[o + 1] * 0.001, P[o + 2] + N[o + 2] * 0.001, N[o], N[o + 1], N[o + 2]) ? 1 : 0;
  }
  const out = [];
  let removed = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    if (isBody(a) && covered[a] && covered[b] && covered[c]) {
      // Centroid too (a triangle spanning a cuff edge stays).
      let cx = 0, cy = 0, cz = 0, nx = 0, ny = 0, nz = 0;
      for (const v of [a, b, c]) {
        cx += P[v * 3] / 3; cy += P[v * 3 + 1] / 3; cz += P[v * 3 + 2] / 3;
        nx += N[v * 3]; ny += N[v * 3 + 1]; nz += N[v * 3 + 2];
      }
      const l = Math.hypot(nx, ny, nz) || 1;
      if (hitsCover(cx + (nx / l) * 0.001, cy + (ny / l) * 0.001, cz + (nz / l) * 0.001, nx / l, ny / l, nz / l)) {
        removed++;
        continue;
      }
    }
    out.push(a, b, c);
  }
  return { index: Uint32Array.from(out), removed };
}
