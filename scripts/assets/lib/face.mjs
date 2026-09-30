// A face rig for talking and blinking (Mixamo characters have no face bones), built from the
// head mesh itself:
// - the lip line from the face's profile (the dip between the two lips),
// - `mouthOpen`: a morph that drops the jaw (the lower face turns about a hinge in front of
//   the ears; the lips part in a lens shape, the corners stay closed, the cheeks stretch),
// - a thin mouth-opening strip on the lip line (zero height when closed, so invisible): it
//   opens with the jaw and shows teeth and a dark mouth (its own atlas tile),
// - `blink`: the upper eyelids slide down over the eyes, found by the whites of the eyes in
//   the atlas.
// Everything in the Head bone's rest frame (+Y up, +Z the face, +X the left ear).
import * as THREE from 'three';
import sharp from 'sharp';

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export const JAW_OPEN = 0.17; // rad at full mouthOpen

function dominantBone(geo, i) {
  let best = 0;
  for (let k = 1; k < 4; k++) if (geo.weights[i * 4 + k] > geo.weights[i * 4 + best]) best = k;
  return geo.weights[i * 4 + best] >= 0.5 ? geo.joints[i * 4 + best] : -1;
}

/**
 * @param {object} geo final geometry (lod.mjs: position, normal, uvAtlas, joints, weights, part)
 * @param {Uint32Array} lod0 LOD0 triangles
 * @param {object} skeleton rig.mjs skeleton
 * @param {object} head headInfo (chinY, eyeY, topY, front, ring)
 * @param {{ color: Buffer, W: number, H: number }} atlas the color atlas (sclera detection)
 * @param {number} PART_FIXED part id of bare skin
 * @returns {{ lipY: number, mouthHalfWidth: number, eyes: object[], morphs: { name: string, delta: Float32Array }[], strip: object } | null}
 */
export function faceRig(geo, lod0, skeleton, head, atlas, PART_FIXED, { lipY: lipOverride = null } = {}) {
  const hb = skeleton.bones.findIndex((b) => b.name === 'Head');
  const tb = skeleton.bones.findIndex((b) => b.name === 'HeadTop_End');
  if (hb < 0 || !head) return null;
  const world = skeleton.bones[hb].world;
  const inv = world.clone().invert();
  const toWorldDir = new THREE.Matrix3().setFromMatrix4(world);
  const used = new Uint8Array(geo.count);
  for (const i of lod0) used[i] = 1;
  // Head skin in the Head frame.
  const ids = [];
  const P = [];
  const v = new THREE.Vector3();
  for (let i = 0; i < geo.count; i++) {
    if (!used[i] || geo.part[i] !== PART_FIXED) continue;
    const b = dominantBone(geo, i);
    if (b !== hb && b !== tb) continue;
    v.fromArray(geo.position, i * 3).applyMatrix4(inv);
    ids.push(i);
    P.push(v.x, v.y, v.z);
  }
  if (ids.length < 100) return null;
  const n = ids.length;

  // --- The lip line: the face's midline profile (frontmost z per 1 mm of height).
  const y0 = head.chinY - 0.01;
  const y1 = head.eyeY;
  const bins = Math.ceil((y1 - y0) / 0.001);
  const prof = new Float32Array(bins).fill(-Infinity);
  for (let k = 0; k < n; k++) {
    if (Math.abs(P[k * 3]) > 0.006) continue;
    const b = Math.floor((P[k * 3 + 1] - y0) / 0.001);
    if (b >= 0 && b < bins) prof[b] = Math.max(prof[b], P[k * 3 + 2]);
  }
  for (let b = 1; b < bins; b++) if (prof[b] === -Infinity) prof[b] = prof[b - 1];
  for (let b = bins - 2; b >= 0; b--) if (prof[b] === -Infinity) prof[b] = prof[b + 1];
  const zAt = (y) => prof[Math.min(bins - 1, Math.max(0, Math.round((y - y0) / 0.001)))];
  const hw = Math.max(0.02, Math.min(0.03, head.ring.rx * 0.31)); // mouth half-width
  const { color, W, H } = atlas;
  const texel = (i) => {
    const u = Math.min(W - 1, Math.max(0, Math.floor(geo.uvAtlas[i * 2] * W)));
    const t = Math.min(H - 1, Math.max(0, Math.floor(geo.uvAtlas[i * 2 + 1] * H)));
    const o = (t * W + u) * 4;
    return [color[o], color[o + 1], color[o + 2]];
  };
  const slot = new Int32Array(geo.count).fill(-1);
  ids.forEach((i, k) => (slot[i] = k));
  // The nose tip: the frontmost point of the face below the eyes' level (robust landmark).
  let noseY = null;
  let noseZ = -Infinity;
  for (let k = 0; k < n; k++) {
    const y = P[k * 3 + 1];
    if (Math.abs(P[k * 3]) > 0.01 || y < head.chinY || y > head.eyeY) continue;
    const [r, g, b] = texel(ids[k]);
    if (!(r > g && g >= b * 0.8 && r - b > 18)) continue; // skin, not a helmet or goggles
    if (P[k * 3 + 2] > noseZ) {
      noseZ = P[k * 3 + 2];
      noseY = y;
    }
  }
  let lipY = null;
  let slitY = null;
  let how = '';
  // 1. An open lip slit: open edges (by position) along a line that crosses the middle of the
  //    face and spans a mouth's width, below the nose (nostrils and eyes are small or off-center).
  {
    const key = (k) => `${Math.round(P[k * 3] * 1e4)},${Math.round(P[k * 3 + 1] * 1e4)},${Math.round(P[k * 3 + 2] * 1e4)}`;
    const edges = new Map();
    for (let t = 0; t < lod0.length; t += 3) {
      const tri = [slot[lod0[t]], slot[lod0[t + 1]], slot[lod0[t + 2]]];
      if (tri.some((k) => k < 0)) continue;
      for (let e = 0; e < 3; e++) {
        const a = key(tri[e]);
        const b = key(tri[(e + 1) % 3]);
        const id = a < b ? a + '|' + b : b + '|' + a;
        const rec = edges.get(id);
        if (rec) rec.n++;
        else edges.set(id, { n: 1, k: tri[e] });
      }
    }
    const bins = new Map(); // 3 mm bands of height -> open-edge vertices
    for (const { n: count, k } of edges.values()) {
      if (count !== 1) continue;
      const y = P[k * 3 + 1];
      if (P[k * 3 + 2] < head.front - 0.06 || (noseY !== null && y > noseY - 0.008)) continue;
      const b = Math.round(y / 0.003);
      if (!bins.has(b)) bins.set(b, []);
      bins.get(b).push(k);
    }
    let best = 0;
    for (const [b, ks] of bins) {
      const all = [...ks, ...(bins.get(b - 1) ?? []), ...(bins.get(b + 1) ?? [])];
      const xs = all.map((k) => P[k * 3]);
      const lo = Math.min(...xs);
      const hi = Math.max(...xs);
      const middle = xs.some((x) => Math.abs(x) < 0.006);
      if (!middle || lo > -0.012 || hi < 0.012 || hi - lo > 0.075) continue;
      const score = all.length * (hi - lo);
      if (score > best) {
        best = score;
        const ys = all.map((k) => P[k * 3 + 1]).sort((p, q) => p - q);
        slitY = ys[Math.floor(ys.length / 2)];
        how = `slit(${all.length})`;
      }
    }
  }
  // A measured lip line (config) wins; else the slit.
  if (lipOverride !== null) {
    lipY = lipOverride;
    how = 'set';
  } else lipY = slitY;
  // 2. The groove between the lips in the face's profile, some 2.5-5 cm below the nose tip.
  if (lipY === null && noseY !== null) {
    let best = Infinity;
    for (let y = noseY - 0.05; y <= noseY - 0.022; y += 0.0005) {
      const up = Math.max(...[0.002, 0.0035, 0.005].map((dd) => zAt(y + dd)));
      const down = Math.max(...[0.002, 0.0035, 0.005].map((dd) => zAt(y - dd)));
      const groove = zAt(y) - Math.min(up, down); // negative in a groove
      const score = groove + Math.abs(y - (noseY - 0.034)) * 0.12;
      if (score < best) {
        best = score;
        lipY = y;
      }
    }
    how = 'profile';
  }
  if (lipY === null) {
    lipY = head.chinY + 0.33 * (head.eyeY - head.chinY);
    how = 'guess';
  }
  const lipZ = zAt(lipY);
  const pivot = new THREE.Vector3(0, lipY + 0.03, head.ring.cz - 0.005); // the jaw hinge
  // Which lip a vertex on the line belongs to: the side its triangles lie on (a slit mesh has
  // separate upper / lower edge vertices at the same height; a closed one gets 0 = stretch).
  const side = new Float32Array(n);
  const sideN = new Float32Array(n);
  for (let t = 0; t < lod0.length; t += 3) {
    const a = slot[lod0[t]];
    const b = slot[lod0[t + 1]];
    const c = slot[lod0[t + 2]];
    if (a < 0 || b < 0 || c < 0) continue;
    const cy = (P[a * 3 + 1] + P[b * 3 + 1] + P[c * 3 + 1]) / 3 - lipY;
    const sgn = cy > 0.0003 ? 1 : cy < -0.0003 ? -1 : 0;
    for (const k of [a, b, c]) {
      side[k] += sgn;
      sideN[k]++;
    }
  }
  const dyOf = (k) => {
    const dy = P[k * 3 + 1] - lipY;
    if (Math.abs(dy) > 0.0015 || !sideN[k]) return dy;
    return (side[k] / sideN[k]) * 0.002;
  };

  // --- mouthOpen: the jaw turns about the hinge; the lips part in a lens shape.
  const rot = new THREE.Matrix4().makeRotationX(JAW_OPEN);
  const mouth = new Float32Array(geo.count * 3);
  const lens = (x) => {
    const a = Math.abs(x) / hw;
    return a < 1 ? Math.sqrt(1 - a * a) : 0;
  };
  const p = new THREE.Vector3();
  const q = new THREE.Vector3();
  const jawDelta = (x, y, z, out) => {
    p.set(x, y, z).sub(pivot);
    q.copy(p).applyMatrix4(rot);
    return out.copy(q).sub(p);
  };
  const d = new THREE.Vector3();
  for (let k = 0; k < n; k++) {
    const x = P[k * 3];
    const y = P[k * 3 + 1];
    const z = P[k * 3 + 2];
    if (z < pivot.z - 0.02) continue; // behind the hinge: the back of the head
    const dy = dyOf(k);
    const beyond = Math.max(0, Math.abs(x) / hw - 1); // past the mouth corners (cheeks)
    const band = 0.02 * Math.min(1, beyond * 1.5);
    const down = smooth(0.0012 + band, -0.0012 - band, dy); // 0 above the line .. 1 below
    const deep = smooth(-0.004, -0.02, dy); // near the line: lens; lower: the whole jaw
    const neck = smooth(head.chinY - 0.045, head.chinY - 0.004, y);
    let w = down * (lens(x) * (1 - deep) + deep) * neck;
    let lift = 0;
    if (dy > 0) lift = 0.0025 * lens(x) * smooth(0.012, 0.0015, dy); // the upper lip rises a little
    if (w <= 0 && lift <= 0) continue;
    jawDelta(x, y, z, d).multiplyScalar(w);
    d.y += lift;
    d.applyMatrix3(toWorldDir); // back into the model's frame
    mouth.set([d.x, d.y, d.z], ids[k] * 3);
  }

  // --- The inside of the mouth: a strip on the lip line. With a lip slit it sits behind the
  // lips (they part and reveal it; the teeth follow the lip edges); without one it sits a
  // hair in front of the closed lips with no height, opening between them.
  // The mouth strip goes behind the lips only where the mesh really has a slit on that line.
  const slit = slitY !== null && Math.abs(slitY - lipY) < 0.004;
  const cols = 15;
  // Four rows (the tile's bands sit between them: teeth / mouth / teeth). Behind a slit: the
  // upper teeth hang 1.5 mm below the lip line (with the head), the lower ones start at the
  // line (with the jaw), the rest hidden behind the lips. In front: all on the line.
  const rowY = slit ? [0.006, -0.0015, 0.0005, -0.007] : [0, 0, 0, 0];
  const rowJaw = slit ? [0, 0, 1, 1] : [0, 0.2, 0.8, 1];
  const rows = rowY.map(() => []);
  const deltas = rowY.map(() => []);
  for (let c = 0; c < cols; c++) {
    const x = -hw + (2 * hw * c) / (cols - 1);
    // The lip surface there (frontmost skin near the line).
    let zs = -Infinity;
    for (let k = 0; k < n; k++) {
      if (Math.abs(P[k * 3] - x) < 0.003 && Math.abs(P[k * 3 + 1] - lipY) < 0.0025) zs = Math.max(zs, P[k * 3 + 2]);
    }
    if (zs === -Infinity) zs = lipZ - 0.004 * (x / hw) ** 2;
    const z = slit ? zs - 0.0045 : zs + 0.0012;
    const jaw = jawDelta(x, lipY, z, new THREE.Vector3()).multiplyScalar(lens(x));
    const lift = new THREE.Vector3(0, 0.0025 * lens(x), 0);
    for (let r = 0; r < rowY.length; r++) {
      rows[r].push(new THREE.Vector3(x, lipY + rowY[r], z).applyMatrix4(world));
      deltas[r].push(lift.clone().lerp(jaw, rowJaw[r]).applyMatrix3(toWorldDir));
    }
  }

  // --- Eyes: the whites (greyish texels) on the front of the face (measured from the nose
  // tip: a helmet or goggles can stick out further than the face).
  const faceFront = noseY !== null ? noseZ : head.front;
  const eyes = [];
  const blink = new Float32Array(geo.count * 3);
  const region = [];
  for (const side of [1, -1]) {
    const pts = [];
    for (let k = 0; k < n; k++) {
      const x = P[k * 3] * side;
      const y = P[k * 3 + 1];
      const z = P[k * 3 + 2];
      if (x < 0.012 || x > 0.055 || y < lipY + 0.035 || y > lipY + 0.11 || z < faceFront - 0.06) continue;
      const [r, g, b] = texel(ids[k]);
      // The white of the eye: greyish (little spread between channels), not reddish like skin.
      if (Math.max(r, g, b) - Math.min(r, g, b) < 42 && Math.min(r, g, b) > 75 && r - b < 35) pts.push(k);
      region.push(k);
    }
    if (pts.length < 5) {
      // No whites (a painted or tinted eye): the eyeball maps to a tiny patch of the texture,
      // so its vertices share one color: the largest compact cluster of one color.
      const byColor = new Map();
      for (const k of region) {
        const c = texel(ids[k]).map((v) => v >> 3).join(',');
        if (!byColor.has(c)) byColor.set(c, []);
        byColor.get(c).push(k);
      }
      let best = [];
      for (const ks of byColor.values()) {
        if (ks.length < 8 || ks.length <= best.length) continue;
        const xs = ks.map((k) => P[k * 3]);
        const ys = ks.map((k) => P[k * 3 + 1]);
        if (Math.max(...xs) - Math.min(...xs) < 0.035 && Math.max(...ys) - Math.min(...ys) < 0.018) best = ks;
      }
      pts.push(...best);
    }
    region.length = 0;
    if (pts.length < 5) continue;
    const xs = pts.map((k) => P[k * 3]);
    const ys = pts.map((k) => P[k * 3 + 1]);
    const zs = pts.map((k) => P[k * 3 + 2]);
    // The whites cover the whole eyeball (also under the lids): the opening is between the
    // nearest lid skin above and below the eye's center.
    const cxw = xs.reduce((a, b) => a + b, 0) / xs.length;
    const cyw = ys.reduce((a, b) => a + b, 0) / ys.length;
    const white0 = new Set(pts);
    let up = Infinity;
    let low = -Infinity;
    const zEye = Math.max(...zs);
    for (let k = 0; k < n; k++) {
      if (white0.has(k)) continue;
      const x = P[k * 3];
      const y = P[k * 3 + 1];
      if (Math.abs(x - cxw) > 0.004 || P[k * 3 + 2] < zEye - 0.012) continue;
      if (y > cyw && y < up) up = y;
      if (y < cyw && y > low) low = y;
    }
    // Measured lids when plausible, else a typical ~9 mm opening around the eyeball's center.
    if (!(up > cyw + 0.003 && up < cyw + 0.008)) up = cyw + 0.0048;
    if (!(low < cyw - 0.002 && low > cyw - 0.007)) low = cyw - 0.0042;
    const eye = {
      x0: Math.min(...xs) - 0.002,
      x1: Math.max(...xs) + 0.002,
      y0: low,
      y1: up,
      z: zEye,
    };
    // Sanity: an eye is ~1-4 cm wide.
    if (eye.x1 - eye.x0 < 0.009 || eye.x1 - eye.x0 > 0.045) continue;
    eyes.push(eye);
    const cx = (eye.x0 + eye.x1) / 2;
    const half = (eye.x1 - eye.x0) / 2 + 0.004;
    const closeY = eye.y0 + 0.25 * (eye.y1 - eye.y0);
    const white = new Set(pts);
    // The front of the eye (the cornea bulges past the whites): the closed lid goes over it.
    let front = eye.z;
    for (let k = 0; k < n; k++) {
      if (Math.abs(P[k * 3] - cx) < half - 0.004 && P[k * 3 + 1] > eye.y0 && P[k * 3 + 1] < eye.y1) front = Math.max(front, P[k * 3 + 2]);
    }
    for (let k = 0; k < n; k++) {
      const x = P[k * 3];
      const y = P[k * 3 + 1];
      const z = P[k * 3 + 2];
      const ax = Math.abs(x - cx) / half;
      if (ax >= 1 || z < eye.z - 0.02) continue;
      const [r, g, b] = texel(ids[k]);
      if (white.has(k) || (Math.max(r, g, b) < 90 && Math.abs(x - cx) < 0.007 && Math.abs(y - (eye.y0 + eye.y1) / 2) < 0.007 && z > eye.z - 0.006)) {
        // The eyeball (white, iris, pupil) sinks back while the lids close over it.
        d.set(0, 0, -0.006);
        d.applyMatrix3(toWorldDir);
        blink.set([d.x, d.y, d.z], ids[k] * 3);
        continue;
      }
      const across = Math.sqrt(1 - ax * ax);
      if (y >= (eye.y0 + eye.y1) / 2 && y <= eye.y1 + 0.009) {
        // Upper lid: the rim slides all the way down, over the eye; the skin above less and
        // less (the brows stay put).
        const f = smooth(eye.y1 + 0.009, eye.y1 + 0.001, y) * across;
        const over = Math.max(0, front + 0.0012 - z) * across;
        d.set(0, (closeY - Math.min(y, eye.y1)) * f, over * smooth(eye.y1 + 0.006, eye.y1, y) + 0.001 * f);
      } else if (y < (eye.y0 + eye.y1) / 2 && y >= eye.y0 - 0.005) {
        // Lower lid: rises a little to meet it.
        const f = smooth(eye.y0 - 0.005, eye.y0, y) * across;
        d.set(0, (closeY - Math.max(y, eye.y0)) * f, 0.0008 * f);
      } else continue;
      d.applyMatrix3(toWorldDir);
      blink.set([d.x, d.y, d.z], ids[k] * 3);
    }
  }

  return {
    how,
    lipY: +lipY.toFixed(4),
    mouthHalfWidth: +hw.toFixed(4),
    eyes: eyes.map((e) => ({ x: +((e.x0 + e.x1) / 2).toFixed(4), y: +((e.y0 + e.y1) / 2).toFixed(4), w: +(e.x1 - e.x0).toFixed(4), h: +(e.y1 - e.y0).toFixed(4) })),
    morphs: [
      { name: 'mouthOpen', delta: mouth },
      { name: 'blink', delta: blink },
    ],
    strip: {
      bone: hb,
      rows,
      deltas,
      normal: new THREE.Vector3(0, 0, 1).applyMatrix3(toWorldDir).normalize(),
    },
  };
}

/**
 * Appends the mouth strip to the geometry (after the LODs: LOD0 only) with its UVs in the
 * mouth tile's atlas cell, and extends the morph deltas to the new vertices.
 * @returns {Uint32Array} triangles to add to LOD0
 */
export function appendMouthStrip(geo, rig, cell, W, H, gutter, PART_FIXED) {
  const { strip } = rig;
  const R = strip.rows.length;
  const cols = strip.rows[0].length;
  const first = geo.count;
  const count = first + cols * R;
  const grow = (arr, size) => {
    const out = new arr.constructor(count * size);
    out.set(arr);
    return out;
  };
  geo.position = grow(geo.position, 3);
  geo.normal = grow(geo.normal, 3);
  geo.uvAtlas = grow(geo.uvAtlas, 2);
  geo.joints = grow(geo.joints, 4);
  geo.weights = grow(geo.weights, 4);
  geo.part = grow(geo.part, 1);
  for (const m of rig.morphs) m.delta = grow(m.delta, 3);
  const mouth = rig.morphs.find((m) => m.name === 'mouthOpen').delta;
  const uv = (u, v) => [(cell.x + gutter + u * (cell.size - 2 * gutter)) / W, (cell.y + gutter + v * (cell.size - 2 * gutter)) / H];
  // The tile's bands (upper teeth / mouth / lower teeth) end exactly on these rows.
  const V = [0, 0.2, 0.8, 1];
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < cols; c++) {
      const i = first + r * cols + c;
      const pt = strip.rows[r][c];
      geo.position.set([pt.x, pt.y, pt.z], i * 3);
      geo.normal.set([strip.normal.x, strip.normal.y, strip.normal.z], i * 3);
      geo.uvAtlas.set(uv(c / (cols - 1), V[r]), i * 2);
      geo.joints.set([strip.bone, strip.bone, strip.bone, strip.bone], i * 4);
      geo.weights.set([1, 0, 0, 0], i * 4);
      geo.part[i] = PART_FIXED;
      const dd = strip.deltas[r][c];
      mouth.set([dd.x, dd.y, dd.z], i * 3);
    }
  }
  geo.count = count;
  const tris = [];
  for (let r = 0; r < R - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = first + r * cols + c;
      const b = a + 1;
      const e = a + cols;
      const f = e + 1;
      // Facing the front (+Z in the head frame): left to right is +X, rows go down.
      tris.push(a, e, b, b, e, f);
    }
  }
  return Uint32Array.from(tris);
}

/** The mouth tile: upper teeth, the dark of the mouth, lower teeth (top to bottom). PNG bytes. */
export async function mouthTile(size = 32) {
  const color = Buffer.alloc(size * size * 4);
  const normal = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    const t = y / (size - 1);
    let c;
    if (t < 0.2) c = [214, 206, 190]; // upper teeth
    else if (t > 0.8) c = [176, 166, 150]; // lower teeth, in shadow
    else c = [34 + 34 * Math.sin(((t - 0.2) / 0.6) * Math.PI), 10, 12]; // the mouth (tongue-dark in the middle)
    for (let x = 0; x < size; x++) {
      const o = (y * size + x) * 4;
      // Teeth gaps: faint vertical lines.
      const gap = (t < 0.2 || t > 0.8) && x % 6 === 0 ? 0.85 : 1;
      color[o] = c[0] * gap;
      color[o + 1] = c[1] * gap;
      color[o + 2] = c[2] * gap;
      color[o + 3] = 255;
      normal[o] = 128;
      normal[o + 1] = 128;
      normal[o + 2] = 255;
      normal[o + 3] = 255;
    }
  }
  const png = (raw) => sharp(raw, { raw: { width: size, height: size, channels: 4 } }).png().toBuffer();
  return { color: new Uint8Array(await png(color)), normal: new Uint8Array(await png(normal)) };
}
