// Mixamo clip processing: bone rotations + hips translation (meters), root motion measured
// and removed for loops, locomotion cycles phase-aligned (left foot down at t = 0), and IK
// hand targets baked from the source skeleton (rifle hold on any body shape).
import * as THREE from 'three';
import { boneName } from './fbx.mjs';

const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _s = new THREE.Vector3();

/** Bones of an animation FBX by clean name (first of each name). */
export function sourceBones(root) {
  const map = new Map();
  root.traverse((o) => {
    if (o.isBone && !map.has(boneName(o.name))) map.set(boneName(o.name), o);
  });
  return map;
}

/**
 * Samples a Mixamo clip on its own skeleton at a fixed rate.
 * @returns {{ fps, frames, duration, rot: Map<string, Float32Array>, hips: Float32Array, fk: (f) => void }}
 *   rot: per bone, frames x 4 (local quaternion); hips: frames x 3 (meters)
 */
export function sampleClip(root, { unit = 0.01, fps = 30, trim = null } = {}) {
  const clip = root.animations.find((a) => a.tracks.length > 0);
  if (!clip) throw new Error('no animation');
  const bones = sourceBones(root);
  const interps = [];
  let hipsTrack = null;
  for (const tr of clip.tracks) {
    const [node, prop] = tr.name.split('.');
    const name = boneName(node);
    if (!bones.has(name)) continue;
    if (prop === 'quaternion') interps.push({ name, it: tr.createInterpolant() });
    if (prop === 'position' && name === 'Hips') hipsTrack = tr.createInterpolant();
  }
  let t0 = 0;
  let t1 = clip.duration;
  if (trim) [t0, t1] = [trim[0] ?? 0, Math.min(clip.duration, trim[1] ?? clip.duration)];
  const frames = Math.max(2, Math.round((t1 - t0) * fps) + 1);
  const rot = new Map(interps.map(({ name }) => [name, new Float32Array(frames * 4)]));
  const hips = new Float32Array(frames * 3);
  const hipsRest = bones.get('Hips').position.clone();
  for (let f = 0; f < frames; f++) {
    const t = Math.min(t1, t0 + f / fps);
    for (const { name, it } of interps) {
      const v = it.evaluate(t);
      _q.set(v[0], v[1], v[2], v[3]).normalize();
      // Keep neighboring keys in the same hemisphere (clean interpolation).
      const arr = rot.get(name);
      if (f > 0) {
        const o = (f - 1) * 4;
        if (arr[o] * _q.x + arr[o + 1] * _q.y + arr[o + 2] * _q.z + arr[o + 3] * _q.w < 0) _q.set(-_q.x, -_q.y, -_q.z, -_q.w);
      }
      arr.set([_q.x, _q.y, _q.z, _q.w], f * 4);
    }
    const hv = hipsTrack ? hipsTrack.evaluate(t) : hipsRest.toArray();
    hips.set([hv[0] * unit, hv[1] * unit, hv[2] * unit], f * 3);
  }
  const fk = (f, out = bones) => {
    for (const [name, arr] of rot) out.get(name).quaternion.fromArray(arr, f * 4);
    out.get('Hips').position.set(hips[f * 3] / unit, hips[f * 3 + 1] / unit, hips[f * 3 + 2] / unit);
    root.updateMatrixWorld(true);
  };
  return { fps, frames, duration: (frames - 1) / fps, rot, hips, fk, bones, unit };
}

/** World position (meters) of a bone after fk(). */
export function worldPos(s, name, out = new THREE.Vector3()) {
  return s.bones.get(name).getWorldPosition(out).multiplyScalar(s.unit);
}

/**
 * When each foot is planted in a locomotion cycle (with its root motion still in: a planted
 * foot doesn't move): the longest run of frames where the foot is slower than `speed` (m/s),
 * as a [start, end] fraction of the cycle (it may wrap past 1). Stair clips use these so the
 * game pins planted feet onto the steps.
 */
export function footContacts(s, speed = 0.3) {
  const n = s.frames - 1;
  const out = {};
  const prev = new THREE.Vector3();
  const cur = new THREE.Vector3();
  for (const [key, bone] of [['l', 'LeftFoot'], ['r', 'RightFoot']]) {
    const slow = new Uint8Array(n);
    s.fk(n - 1);
    worldPos(s, bone, prev);
    for (let f = 0; f < n; f++) {
      s.fk(f);
      worldPos(s, bone, cur);
      slow[f] = cur.distanceTo(prev) * s.fps < speed ? 1 : 0;
      prev.copy(cur);
    }
    // Longest cyclic run of slow frames.
    let best = [0, 0];
    let bestLen = 0;
    for (let start = 0; start < n; start++) {
      if (!slow[start] || slow[(start + n - 1) % n]) continue;
      let len = 0;
      while (len < n && slow[(start + len) % n]) len++;
      if (len > bestLen) {
        bestLen = len;
        best = [start, start + len];
      }
    }
    out[key] = [+(best[0] / n).toFixed(3), +((best[1] / n) % 1.0001).toFixed(3)];
  }
  return out;
}

/** Shift a cyclic clip so `offset` frames becomes frame 0 (the last frame repeats the first). */
function cycleShift(s, offset) {
  if (!offset) return;
  const n = s.frames - 1; // unique frames in the loop
  const shift = (arr, size) => {
    const src = arr.slice();
    for (let f = 0; f <= n; f++) {
      const g = (f + offset) % n;
      for (let k = 0; k < size; k++) arr[f * size + k] = src[g * size + k];
    }
  };
  for (const arr of s.rot.values()) shift(arr, 4);
  shift(s.hips, 3);
}

/**
 * Root motion: measure the average horizontal hips velocity over the clip, then subtract
 * it so the clip plays in place (keeping the natural sway). Returns { vx, vz } (m/s).
 */
export function removeDrift(s, { vertical = false } = {}) {
  const n = s.frames - 1;
  const vx = (s.hips[n * 3] - s.hips[0]) / s.duration;
  const vy = vertical ? (s.hips[n * 3 + 1] - s.hips[1]) / s.duration : 0; // stairs: the climb
  const vz = (s.hips[n * 3 + 2] - s.hips[2]) / s.duration;
  for (let f = 0; f <= n; f++) {
    const t = f / s.fps;
    s.hips[f * 3] -= vx * t;
    s.hips[f * 3 + 1] -= vy * t;
    s.hips[f * 3 + 2] -= vz * t;
  }
  return { vx, vy, vz };
}

/**
 * Locomotion cycle prep: phase 0 = the left foot at its lowest while planted. Computed
 * on the in-place clip. Returns the frame offset used.
 */
export function alignFootPhase(s) {
  const n = s.frames - 1;
  let best = 0;
  let bestY = Infinity;
  const p = new THREE.Vector3();
  for (let f = 0; f < n; f++) {
    s.fk(f);
    const y = worldPos(s, 'LeftFoot', p).y;
    if (y < bestY - 1e-4) {
      bestY = y;
      best = f;
    }
  }
  cycleShift(s, best);
  return best;
}

/** Seamless loop: the last frame repeats the first (Mixamo cycles already nearly match). */
export function closeLoop(s) {
  const n = s.frames - 1;
  for (const arr of s.rot.values()) arr.copyWithin(n * 4, 0, 4);
  s.hips.copyWithin(n * 3, 0, 3);
}

/**
 * Shortens a long idle into a `length`-second loop: the clip is sampled for length + blend
 * seconds, and its first `blend` seconds crossfade from the frames after the loop point, so
 * the wrap is seamless.
 */
export function crossfadeLoop(s, length) {
  const n = Math.round(length * s.fps); // frames in the loop (frame n repeats frame 0)
  const b = s.frames - 1 - n; // crossfade frames available after the loop point
  if (b <= 0) return closeLoop(s);
  const qa = new THREE.Quaternion();
  const qb = new THREE.Quaternion();
  for (let x = 0; x <= b; x++) {
    const w = x / b; // 0: the frame after the loop point, 1: the original frame
    for (const arr of s.rot.values()) {
      qa.fromArray(arr, (n + x) * 4);
      qb.fromArray(arr, x * 4);
      qa.slerp(qb, w).toArray(arr, x * 4);
    }
    for (let k = 0; k < 3; k++) s.hips[x * 3 + k] = s.hips[(n + x) * 3 + k] * (1 - w) + s.hips[x * 3 + k] * w;
  }
  const trim = (arr, size) => arr.slice(0, (n + 1) * size);
  for (const [name, arr] of s.rot) s.rot.set(name, trim(arr, 4));
  s.hips = trim(s.hips, 3);
  s.frames = n + 1;
  s.duration = n / s.fps;
  closeLoop(s);
}

/**
 * IK targets on the source skeleton, per frame: the right hand relative to Spine2 and the
 * left hand relative to the right hand (position in meters + rotation).
 */
export function handTargets(s) {
  const R = { t: new Float32Array(s.frames * 3), q: new Float32Array(s.frames * 4) };
  const L = { t: new Float32Array(s.frames * 3), q: new Float32Array(s.frames * 4) };
  const spine = s.bones.get('Spine2');
  const rh = s.bones.get('RightHand');
  const lh = s.bones.get('LeftHand');
  for (let f = 0; f < s.frames; f++) {
    s.fk(f);
    _m.copy(spine.matrixWorld).invert().multiply(rh.matrixWorld);
    _m.decompose(_p, _q, _s);
    R.t.set([_p.x * s.unit, _p.y * s.unit, _p.z * s.unit], f * 3);
    R.q.set([_q.x, _q.y, _q.z, _q.w], f * 4);
    _m2.copy(rh.matrixWorld).invert().multiply(lh.matrixWorld);
    _m2.decompose(_p, _q, _s);
    L.t.set([_p.x * s.unit, _p.y * s.unit, _p.z * s.unit], f * 3);
    L.q.set([_q.x, _q.y, _q.z, _q.w], f * 4);
  }
  return { R, L };
}

/** Time of the peak forward (+Z) speed of a bone, e.g. the right hand's throw release. */
export function peakSpeedTime(s, bone) {
  const p = new THREE.Vector3();
  const prev = new THREE.Vector3();
  let best = 0;
  let bestV = -Infinity;
  for (let f = 0; f < s.frames; f++) {
    s.fk(f);
    worldPos(s, bone, p);
    if (f > 0) {
      const v = (p.z - prev.z) * s.fps + Math.max(0, p.y - prev.y) * s.fps * 0.3;
      if (v > bestV) {
        bestV = v;
        best = f;
      }
    }
    prev.copy(p);
  }
  return best / s.fps;
}
