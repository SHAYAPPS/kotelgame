// Clothing the converter adds to or separates on the civilians:
// - arm and leg skin as their own parts, so the game can dress it per person (long sleeves,
//   long trousers, tights) or leave it bare;
// - a long skirt for the women: a flared tube from the waistband to above the ankles, sized
//   from the body at every height and skinned to the hips and thighs so it swings with the
//   legs, with a fabric tile (folds) of its own in the atlas.
import sharp from 'sharp';
import { addClothBone } from './cloth.mjs';

const ARM = /^(Left|Right)(Arm|ForeArm)$/;
const LEG = /^(Left|Right)(UpLeg|Leg)$/;

function dominant(geo, i) {
  let best = 0;
  for (let k = 1; k < 4; k++) if (geo.weights[i * 4 + k] > geo.weights[i * 4 + best]) best = k;
  return geo.joints[i * 4 + best];
}

/**
 * Appends vertices to the merged geometry (rig.mjs layout). `verts[i]` = { p, n, uv, j, w,
 * part, mat, mesh } or { src, part } (a copy of vertex `src` with another part).
 * @returns {number} the id of the first new vertex
 */
export function appendVertices(geo, verts) {
  const first = geo.count;
  const n = first + verts.length;
  const grow = (arr, size) => {
    const out = new arr.constructor(n * size);
    out.set(arr.subarray(0, first * size));
    return out;
  };
  const position = grow(geo.position, 3);
  const normal = grow(geo.normal, 3);
  const uv = grow(geo.uv, 2);
  const joints = grow(geo.joints, 4);
  const weights = grow(geo.weights, 4);
  const part = grow(geo.part, 1);
  const mat = grow(geo.mat, 1);
  verts.forEach((v, k) => {
    const i = first + k;
    if (v.src !== undefined) {
      const s = v.src;
      position.set(geo.position.subarray(s * 3, s * 3 + 3), i * 3);
      normal.set(geo.normal.subarray(s * 3, s * 3 + 3), i * 3);
      uv.set(geo.uv.subarray(s * 2, s * 2 + 2), i * 2);
      joints.set(geo.joints.subarray(s * 4, s * 4 + 4), i * 4);
      weights.set(geo.weights.subarray(s * 4, s * 4 + 4), i * 4);
      part[i] = v.part;
      mat[i] = geo.mat[s];
      geo.meshName.push(geo.meshName[s]);
    } else {
      position.set(v.p, i * 3);
      normal.set(v.n, i * 3);
      uv.set(v.uv, i * 2);
      joints.set(v.j, i * 4);
      weights.set(v.w, i * 4);
      part[i] = v.part;
      mat[i] = v.mat;
      geo.meshName.push(v.mesh);
    }
  });
  Object.assign(geo, { position, normal, uv, joints, weights, part, mat, count: n });
  return first;
}

/**
 * Visible skin dominated by the upper / lower arm bones becomes part `PART.arms`, by the
 * thigh / shin bones `PART.legs` (hands and feet stay skin). The part is a vertex attribute,
 * so vertices on a border are split: every triangle ends up with one part.
 * @returns {{ index: Uint32Array, arms: number, legs: number }}
 */
export function skinParts(geo, index, skeleton, isBody, PART) {
  const names = skeleton.bones.map((b) => b.name);
  const tris = index.length / 3;
  const triPart = new Uint8Array(tris);
  let arms = 0;
  let legs = 0;
  for (let t = 0; t < tris; t++) {
    const a = index[t * 3];
    triPart[t] = geo.part[a];
    if (!isBody(a) || geo.part[a] !== PART.fixed) continue;
    let na = 0;
    let nl = 0;
    for (let k = 0; k < 3; k++) {
      const name = names[dominant(geo, index[t * 3 + k])];
      if (ARM.test(name)) na++;
      else if (LEG.test(name)) nl++;
    }
    if (na >= 2) {
      triPart[t] = PART.arms;
      arms++;
    } else if (nl >= 2) {
      triPart[t] = PART.legs;
      legs++;
    }
  }
  // A vertex takes the part of the first triangle that uses it; other parts get copies.
  const owner = new Int16Array(geo.count).fill(-1);
  const copies = new Map();
  const extra = [];
  const out = Uint32Array.from(index);
  for (let t = 0; t < tris; t++) {
    const p = triPart[t];
    for (let k = 0; k < 3; k++) {
      const v = index[t * 3 + k];
      if (owner[v] === -1) {
        owner[v] = p;
        geo.part[v] = p;
        continue;
      }
      if (owner[v] === p) continue;
      const key = v * 16 + p;
      let nv = copies.get(key);
      if (nv === undefined) {
        nv = geo.count + extra.length;
        copies.set(key, nv);
        extra.push({ src: v, part: p });
      }
      out[t * 3 + k] = nv;
    }
  }
  if (extra.length) appendVertices(geo, extra);
  return { index: out, arms, legs };
}

const smooth01 = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * A long skirt around the legs. Rings from `top` (the waistband, m) down to `hem`; each
 * ring's radius per direction is the body's extent there (points picked by `include`) plus a
 * margin, never narrower than the ring above plus the flare (an A-line), at least `hemRadius`
 * at the bottom. Sits on the hips down to `pivotDrop` below the waist; below that it hangs on
 * cloth bones (chains around it, added to `skeleton`). Outer surface, lining and a lip at
 * the waist.
 * @returns {{ tris: Uint32Array, chains: object[] }} the skirt's triangles (its vertices are
 *   appended to `geo`) and its cloth chains (bone names, tip offset) for the manifest
 */
export function addSkirt(geo, index, skeleton, opts) {
  const { part, mat, top, hem, knee, center, include, seg = 36, rings = 13, flare = 0.2, hemRadius = 0.32, chains = 24, pivotDrop = 0 } = opts;
  const bone = (n) => skeleton.bones.findIndex((b) => b.name === n);
  const hips = bone('Hips');
  const [cx, cz] = center;
  const ys = Array.from({ length: rings }, (_, k) => top - (top - hem) * Math.pow(k / (rings - 1), 1.15));
  const slab = Math.max(0.025, ((top - hem) / (rings - 1)) * 0.6);
  // Body extent per ring and direction (0 = front, +X = the left side).
  const measured = ys.map(() => new Float32Array(seg));
  const used = new Uint8Array(geo.count);
  for (const i of index) used[i] = 1;
  for (let i = 0; i < geo.count; i++) {
    if (!used[i] || !include(i)) continue;
    const x = geo.position[i * 3] - cx;
    const y = geo.position[i * 3 + 1];
    const z = geo.position[i * 3 + 2] - cz;
    if (y > top + slab || y < hem - slab) continue;
    const r = Math.hypot(x, z);
    const j = Math.floor((((Math.atan2(x, z) / (Math.PI * 2)) % 1) + 1) % 1 * seg) % seg;
    for (let k = 0; k < rings; k++) {
      if (Math.abs(y - ys[k]) > slab) continue;
      if (r > measured[k][j]) measured[k][j] = r;
    }
  }
  const radius = ys.map(() => new Float32Array(seg));
  const need = ys.map(() => new Float32Array(seg));
  for (let k = 0; k < rings; k++) {
    const t = k / (rings - 1);
    const margin = 0.007 + 0.03 * smooth01(0, 0.35, t);
    for (let j = 0; j < seg; j++) {
      // Conservative: the widest of the neighboring directions.
      const m = Math.max(measured[k][j], measured[k][(j + 1) % seg], measured[k][(j + seg - 1) % seg]);
      need[k][j] = m > 0 ? m + margin : 0;
      const front = Math.abs(Math.cos((j / seg) * Math.PI * 2));
      const minR = hemRadius * (0.88 + 0.12 * front) * smooth01(0.3, 1, t);
      radius[k][j] = Math.max(need[k][j], minR);
      if (k > 0) radius[k][j] = Math.max(radius[k][j], radius[k - 1][j] + flare * (ys[k - 1] - ys[k]));
    }
  }
  // Round off the per-direction maxima (a few passes), never inside the body again.
  for (let pass = 0; pass < 3; pass++) {
    for (let k = 0; k < rings; k++) {
      const r = radius[k].slice();
      for (let j = 0; j < seg; j++) radius[k][j] = Math.max(need[k][j], (r[(j + seg - 1) % seg] + 2 * r[j] + r[(j + 1) % seg]) / 4);
      if (k > 0) for (let j = 0; j < seg; j++) radius[k][j] = Math.max(radius[k][j], radius[k - 1][j] + flare * 0.5 * (ys[k - 1] - ys[k]));
    }
  }

  // Rings above the measured body (a waistband above the trousers, under a top) take the size
  // of the ring below, a little narrower: no cone into the body (and the chains pivot there).
  for (let k = rings - 2; k >= 0; k--) for (let j = 0; j < seg; j++) if (radius[k][j] < 0.06) radius[k][j] = radius[k + 1][j] * 0.97;

  const pos = (k, j) => {
    const a = (j / seg) * Math.PI * 2;
    const r = radius[k][j % seg];
    return [cx + Math.sin(a) * r, ys[k], cz + Math.cos(a) * r];
  };
  const verts = [];
  // Cloth bones: `chains` chains around the skirt, two bones each: from the hip line down to
  // the knee line, then to the hem (the game swings them and the legs push them out of the
  // way: ClothSim.js). Above the hip line the skirt sits on the hips. Between two chains a
  // vertex blends both; the top four influences are kept.
  const tOf = (k) => (top - ys[k]) / (top - hem);
  let kHip = 0;
  while (kHip < rings - 3 && top - ys[kHip] < pivotDrop) kHip++;
  let kKnee = kHip + 1;
  for (let k = kHip + 1; k < rings - 1; k++) if (Math.abs(ys[k] - knee) < Math.abs(ys[kKnee] - knee)) kKnee = k;
  const tHip = tOf(kHip);
  const tKneeRing = tOf(kKnee);
  const per = seg / chains;
  const chainBones = [];
  const chainInfo = [];
  for (let c = 0; c < chains; c++) {
    const j = Math.round(c * per);
    const head = pos(kHip, j);
    const mid = pos(kKnee, j);
    const tip = pos(rings - 1, j);
    const a = addClothBone(skeleton, `ClothSkirt${c}a`, hips, head);
    const b = addClothBone(skeleton, `ClothSkirt${c}b`, a, mid);
    chainBones.push([a, b]);
    chainInfo.push({ kind: 'skirt', bones: [`ClothSkirt${c}a`, `ClothSkirt${c}b`], tip: tip.map((v, i) => +(v - mid[i]).toFixed(4)) });
  }
  const skin = (k, j) => {
    const t = tOf(k);
    const hipsW = 1 - smooth01(tHip - 0.07, tHip + 0.03, t);
    const lower = smooth01(tKneeRing - 0.07, tKneeRing + 0.07, t);
    const f = (j % seg) / per;
    const c0 = Math.floor(f) % chains;
    const c1 = (c0 + 1) % chains;
    const s1 = f - Math.floor(f);
    const rest = 1 - hipsW;
    const inf = [
      [hips, hipsW],
      [chainBones[c0][0], rest * (1 - lower) * (1 - s1)],
      [chainBones[c1][0], rest * (1 - lower) * s1],
      [chainBones[c0][1], rest * lower * (1 - s1)],
      [chainBones[c1][1], rest * lower * s1],
    ]
      .sort((x, y) => y[1] - x[1])
      .slice(0, 4);
    const sum = inf.reduce((sm, x) => sm + x[1], 0);
    return { j: inf.map((x) => x[0]), w: inf.map((x) => x[1] / sum) };
  };
  const ring = (k) => Array.from({ length: seg + 1 }, (_, j) => pos(k, j));
  const P = ys.map((_, k) => ring(k));
  const normalAt = (k, j) => {
    const a = P[k][(j + 1) % (seg + 1) || 1];
    const b = P[k][j === 0 ? seg - 1 : j - 1];
    const c = P[Math.min(rings - 1, k + 1)][j];
    const d = P[Math.max(0, k - 1)][j];
    const around = [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const down = [c[0] - d[0], c[1] - d[1], c[2] - d[2]];
    // outward = around x down (rings go counterclockwise seen from above: +Z toward +X)
    let n = [around[1] * down[2] - around[2] * down[1], around[2] * down[0] - around[0] * down[2], around[0] * down[1] - around[1] * down[0]];
    const out = [P[k][j][0] - cx, 0, P[k][j][2] - cz];
    if (n[0] * out[0] + n[2] * out[2] < 0) n = n.map((x) => -x);
    const l = Math.hypot(...n) || 1;
    return n.map((x) => x / l);
  };
  const base = geo.count;
  const layers = [
    { inset: 0, flip: false },
    { inset: 0.004, flip: true },
  ];
  for (const layer of layers) {
    for (let k = 0; k < rings; k++) {
      const t = k / (rings - 1);
      for (let j = 0; j <= seg; j++) {
        const n = normalAt(k, j);
        const p = P[k][j];
        const s = skin(k, j % seg);
        verts.push({
          p: [p[0] - n[0] * layer.inset, p[1], p[2] - n[2] * layer.inset],
          n: layer.flip ? n.map((x) => -x) : n,
          uv: [j / seg, 1 - t],
          j: s.j,
          w: s.w,
          part,
          mat,
          mesh: layer.flip ? 'SkirtLining' : 'Skirt', // the lining is left out of the far LODs
        });
      }
    }
  }
  // Waist lip: from the top ring inward (closes the gap to the body, seen from above).
  const lipStart = verts.length;
  for (let j = 0; j <= seg; j++) {
    const p = P[0][j];
    const s = skin(0, j % seg);
    const inward = 0.028;
    const dx = p[0] - cx;
    const dz = p[2] - cz;
    const l = Math.hypot(dx, dz) || 1;
    verts.push({ p: [p[0] - (dx / l) * inward, p[1] - 0.004, p[2] - (dz / l) * inward], n: [0, 1, 0], uv: [j / seg, 1], j: s.j, w: s.w, part, mat, mesh: 'Skirt' });
    verts.push({ p: [p[0], p[1], p[2]], n: [0, 1, 0], uv: [j / seg, 1], j: s.j, w: s.w, part, mat, mesh: 'Skirt' });
  }
  appendVertices(geo, verts);

  const tris = [];
  const row = seg + 1;
  for (const [li, layer] of layers.entries()) {
    const o = base + li * rings * row;
    for (let k = 0; k < rings - 1; k++) {
      for (let j = 0; j < seg; j++) {
        const a = o + k * row + j;
        const b = a + 1;
        const c = a + row;
        const d = c + 1;
        // Outer faces wind counterclockwise seen from outside.
        if (!layer.flip) tris.push(a, c, b, b, c, d);
        else tris.push(a, b, c, b, d, c);
      }
    }
  }
  for (let j = 0; j < seg; j++) {
    const a = base + lipStart + j * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    tris.push(a, b, c, c, b, d);
  }
  // Fix the lip's winding so it faces up (counterclockwise seen from above).
  for (let t = tris.length - seg * 6; t < tris.length; t += 3) {
    const [i0, i1, i2] = [tris[t], tris[t + 1], tris[t + 2]];
    const p0 = geo.position.subarray(i0 * 3, i0 * 3 + 3);
    const p1 = geo.position.subarray(i1 * 3, i1 * 3 + 3);
    const p2 = geo.position.subarray(i2 * 3, i2 * 3 + 3);
    const ny = (p1[2] - p0[2]) * (p2[0] - p0[0]) - (p1[0] - p0[0]) * (p2[2] - p0[2]);
    if (ny < 0) {
      tris[t + 1] = i2;
      tris[t + 2] = i1;
    }
  }
  return { tris: Uint32Array.from(tris), chains: chainInfo };
}

/**
 * The skirt's fabric tile: mid-grey cloth with soft vertical folds that deepen toward the hem
 * (the game tints it per person), and the matching normal map. PNG bytes for the atlas.
 */
export async function fabricTile(size = 128, folds = 18) {
  const color = Buffer.alloc(size * size * 4);
  const normal = Buffer.alloc(size * size * 4);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
  for (let y = 0; y < size; y++) {
    const depth = 0.35 + 0.65 * (y / (size - 1));
    for (let x = 0; x < size; x++) {
      const a = (x / size) * Math.PI * 2 * folds;
      const wobble = Math.sin((x / size) * Math.PI * 2 * 3 + y * 0.03) * 0.6;
      const l = 150 * (1 + 0.09 * depth * Math.sin(a + wobble)) + rnd() * 6;
      const o = (y * size + x) * 4;
      color[o] = color[o + 1] = color[o + 2] = Math.max(0, Math.min(255, Math.round(l)));
      color[o + 3] = 255;
      const nx = -0.45 * depth * Math.cos(a + wobble);
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx));
      normal[o] = Math.round((nx * 0.5 + 0.5) * 255);
      normal[o + 1] = 128;
      normal[o + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      normal[o + 3] = 255;
    }
  }
  const png = (raw) => sharp(raw, { raw: { width: size, height: size, channels: 4 } }).png().toBuffer();
  return { color: new Uint8Array(await png(color)), normal: new Uint8Array(await png(normal)) };
}

export { ARM, LEG };
