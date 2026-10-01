// Cloth bones for loose clothes: chains of extra bones the game swings with inertia and
// gravity and pushes out of the legs (src/characters/ClothSim.js). They are added to the
// skeleton in the bind pose with no rotation of their own (world rotation = identity), so a
// bone's rest direction is simply its offset to the next one (or to the chain's tip), and the
// garment's skin weights move onto them. Bind pose, meters, +Z = the character's front.
import * as THREE from 'three';

const _m = new THREE.Matrix4();
const _t = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();

export const smooth01 = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Appends a bone at `position` (world, bind pose) under `parent`; returns its index. */
export function addClothBone(skeleton, name, parent, position) {
  const world = new THREE.Matrix4().makeTranslation(position[0], position[1], position[2]);
  _m.copy(skeleton.bones[parent].world).invert().multiply(world).decompose(_t, _q, _s);
  skeleton.bones.push({ name, parent, world, t: _t.toArray(), q: _q.normalize().toArray() });
  return skeleton.bones.length - 1;
}

const boneIndex = (skeleton, name) => skeleton.bones.findIndex((b) => b.name === name);
const bonePos = (skeleton, name) => new THREE.Vector3().setFromMatrixPosition(skeleton.bones[boneIndex(skeleton, name)].world);

function dominantJoint(geo, i) {
  let best = 0;
  for (let k = 1; k < 4; k++) if (geo.weights[i * 4 + k] > geo.weights[i * 4 + best]) best = k;
  return geo.joints[i * 4 + best];
}

function percentile(values, p) {
  if (!values.length) return 0;
  const s = Float64Array.from(values).sort();
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
}

/** Distance from p to the segment a-b and the position along it (0..1). */
function segmentDistance(p, a, b) {
  const ab = _t.subVectors(b, a);
  const t = Math.max(0, Math.min(1, _s.subVectors(p, a).dot(ab) / ab.lengthSq()));
  return { d: p.distanceTo(_s.copy(a).addScaledVector(ab, t)), t };
}

/**
 * The legs as tapered capsules (thigh: UpLeg to Leg, shin: Leg to Foot) from `from` of the
 * way along the bone: radius `r` at the upper end and `r2` at the lower end, measured from the
 * clothes / skin around each bone near each end (the outer surface: a high percentile).
 * @param {(i: number) => boolean} include vertices that belong to the legs' surface
 */
export function legColliders(geo, skeleton, include) {
  const out = [];
  for (const side of ['Left', 'Right']) {
    for (const [a, b] of [[`${side}UpLeg`, `${side}Leg`], [`${side}Leg`, `${side}Foot`]]) {
      const ia = boneIndex(skeleton, a);
      if (ia < 0 || boneIndex(skeleton, b) < 0) continue;
      const pa = bonePos(skeleton, a);
      const pb = bonePos(skeleton, b);
      const upper = [];
      const lower = [];
      const p = new THREE.Vector3();
      for (let i = 0; i < geo.count; i++) {
        if (!include(i) || dominantJoint(geo, i) !== ia) continue;
        p.fromArray(geo.position, i * 3);
        const s = segmentDistance(p, pa, pb);
        if (s.t > 0.15 && s.t < 0.45) upper.push(s.d);
        else if (s.t > 0.55 && s.t < 0.92) lower.push(s.d);
      }
      // A thigh starts a quarter of the way down: next to the hip joint the cloth rests on the
      // pelvis (the capsule's end there would swallow the waistband).
      if (upper.length > 10 && lower.length > 10) out.push({ a, b, r: +percentile(upper, 0.85).toFixed(3), r2: +percentile(lower, 0.85).toFixed(3), from: a.endsWith('UpLeg') ? 0.25 : 0 });
    }
  }
  return out;
}

/**
 * Hem chains for a top that hangs loose over the hips (shirt, t-shirt, suit jacket): `count`
 * bones around the body (parent Hips) from `drop` above the hem down to it. The garment's
 * lower part blends onto them, more toward the hem. A top that ends above the hips gets none.
 * @param {(i: number) => boolean} isTop the garment's vertices
 * @returns {{ chains: object[], weighted: number } | null}
 */
export function hemChains(geo, skeleton, isTop, { count = 8, drop = 0.15, maxWeight = 0.85, prefix = 'ClothHem' } = {}) {
  const hips = boneIndex(skeleton, 'Hips');
  if (hips < 0) return null;
  const hp = bonePos(skeleton, 'Hips');
  const torso = new Set(['Hips', 'Spine', 'Spine1', 'LeftUpLeg', 'RightUpLeg'].map((n) => boneIndex(skeleton, n)));
  const [cx, cz] = [hp.x, hp.z];
  const angleOf = (x, z) => ((Math.atan2(x - cx, z - cz) / (Math.PI * 2)) % 1 + 1) % 1; // 0 = front, turning to +X
  // Per chain direction: the hem's height there (hems are rarely level) and the garment's
  // radius at the chain's root and at the hem.
  const sector = Array.from({ length: count }, () => []);
  for (let i = 0; i < geo.count; i++) {
    if (!isTop(i) || !torso.has(dominantJoint(geo, i))) continue;
    const c = Math.round(angleOf(geo.position[i * 3], geo.position[i * 3 + 2]) * count) % count;
    sector[c].push(i);
  }
  if (sector.some((v) => v.length < 10)) return null;
  const hemY = sector.map((v) => percentile(v.map((i) => geo.position[i * 3 + 1]), 0.03));
  if (hemY.filter((y) => y > hp.y + 0.05).length > count / 4) return null; // a short top: nothing hangs
  const radiusAt = (c, y, band) => {
    let r = 0;
    for (const i of sector[c]) {
      if (Math.abs(geo.position[i * 3 + 1] - y) > band) continue;
      r = Math.max(r, Math.hypot(geo.position[i * 3] - cx, geo.position[i * 3 + 2] - cz));
    }
    return r;
  };
  const chains = [];
  const bones = [];
  for (let c = 0; c < count; c++) {
    const a = (c / count) * Math.PI * 2;
    const rootY = hemY[c] + drop;
    const rRoot = radiusAt(c, rootY, 0.025);
    const rHem = radiusAt(c, hemY[c] + 0.012, 0.02);
    if (!rRoot || !rHem) return null;
    const head = [cx + Math.sin(a) * rRoot, rootY, cz + Math.cos(a) * rRoot];
    const tip = [cx + Math.sin(a) * rHem - head[0], -drop, cz + Math.cos(a) * rHem - head[2]];
    const name = `${prefix}${c}`;
    bones.push(addClothBone(skeleton, name, hips, head));
    chains.push({ kind: 'hem', bones: [name], tip: tip.map((v) => +v.toFixed(4)) });
  }
  // Weights: below the root, toward the two nearest chains (more toward the hem).
  let weighted = 0;
  for (let i = 0; i < geo.count; i++) {
    if (!isTop(i)) continue;
    const f = angleOf(geo.position[i * 3], geo.position[i * 3 + 2]) * count;
    const c0 = Math.floor(f) % count;
    const c1 = (c0 + 1) % count;
    const k = f - Math.floor(f);
    const hem = hemY[c0] * (1 - k) + hemY[c1] * k;
    const w = maxWeight * smooth01(hem + drop, hem, geo.position[i * 3 + 1]);
    if (w <= 0.01) continue;
    reweight(geo, i, w, [[bones[c0], 1 - k], [bones[c1], k]]);
    weighted++;
  }
  return { chains, weighted };
}

/**
 * Moves `share` of a vertex's skin weight onto `targets` ([bone, fraction] pairs), keeping the
 * four largest influences (renormalized).
 */
export function reweight(geo, i, share, targets) {
  const inf = [];
  for (let k = 0; k < 4; k++) {
    const w = geo.weights[i * 4 + k] * (1 - share);
    if (w > 0) inf.push([geo.joints[i * 4 + k], w]);
  }
  for (const [b, f] of targets) if (f * share > 0) inf.push([b, f * share]);
  // Merge duplicates, keep the top four.
  const merged = new Map();
  for (const [b, w] of inf) merged.set(b, (merged.get(b) ?? 0) + w);
  const top = [...merged].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const sum = top.reduce((s, x) => s + x[1], 0) || 1;
  for (let k = 0; k < 4; k++) {
    geo.joints[i * 4 + k] = top[k]?.[0] ?? top[0][0];
    geo.weights[i * 4 + k] = top[k] ? top[k][1] / sum : 0;
  }
}
