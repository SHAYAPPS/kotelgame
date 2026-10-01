import { Matrix4, Quaternion, Vector3 } from 'three';

// Loose clothes in motion: the converter's cloth chains (scripts/assets/lib/cloth.mjs). A long
// skirt hangs on chains of two bones (hip line -> knee line -> hem), the lower part of a loose
// top on one bone per chain. Each bone's tail is a particle pulled by a damped spring toward
// where the bone would point at rest, so the cloth lags behind the body, overshoots and
// settles (inertia), hangs down when the hips tilt (gravity), is pushed out of the legs
// (capsules on the thigh and shin bones: a knee lifts the skirt, a stride kicks it) and never
// sinks into the body. The bones are then turned to follow their particles.
//
// Modes: 2 = dynamics (up close), 1 = only the legs push it (no swing; mid distance),
// 0 = rest (the cloth moves rigidly with the hips; far away).

const UP = new Vector3(0, 1, 0);
const MAX_SPEED = 5; // m/s, a particle relative to the body (cloth flapping in a run)
const INNER_COS = Math.cos(0.7); // a leg within 40 degrees of a chain's direction is in front of it
const _hipsPos = new Vector3();
const _hipsQ = new Quaternion();
const _bodyQ = new Quaternion();
const _delta = new Quaternion();
const _twist = new Quaternion();
const _swing = new Quaternion();
const _swingInv = new Quaternion();
const _uprightQ = new Quaternion();
const _parentQ = new Quaternion();
const _restQ = new Quaternion();
const _worldQ = new Quaternion();
const _inv = new Quaternion();
const _turn = new Quaternion();
const _axis = new Vector3();
const _head = new Vector3();
const _restDir = new Vector3();
const _upright = new Vector3();
const _target = new Vector3();
const _dir = new Vector3();
const _a = new Vector3();
const _prev = new Vector3();
const _c1 = new Vector3();
const _c2 = new Vector3();
const _d1 = new Vector3();
const _d2 = new Vector3();
const _r = new Vector3();
const _n = new Vector3();
const _m = new Matrix4();
const _s = new Vector3();
const _m3 = new Vector3();
const _bc = new Vector3();
const _m4 = new Vector3();

/**
 * Closest points between segments p1-q1 and p2-q2 (Ericson, Real-Time Collision Detection):
 * sets _c1 / _c2, returns the parameter along the first segment.
 */
function closestSegments(p1, q1, p2, q2) {
  _d1.subVectors(q1, p1);
  _d2.subVectors(q2, p2);
  _r.subVectors(p1, p2);
  const a = _d1.dot(_d1);
  const e = _d2.dot(_d2);
  const f = _d2.dot(_r);
  let s = 0;
  let t = 0;
  if (a > 1e-9 || e > 1e-9) {
    if (a <= 1e-9) t = Math.min(1, Math.max(0, f / e));
    else {
      const c = _d1.dot(_r);
      if (e <= 1e-9) s = Math.min(1, Math.max(0, -c / a));
      else {
        const b = _d1.dot(_d2);
        const denom = a * e - b * b;
        s = denom > 1e-12 ? Math.min(1, Math.max(0, (b * f - c * e) / denom)) : 0;
        t = (b * s + f) / e;
        if (t < 0) {
          t = 0;
          s = Math.min(1, Math.max(0, -c / a));
        } else if (t > 1) {
          t = 1;
          s = Math.min(1, Math.max(0, (b - c) / a));
        }
      }
    }
  }
  _c1.copy(p1).addScaledVector(_d1, s);
  _c2.copy(p2).addScaledVector(_d2, t);
  return s;
}

export class ClothSim {
  /**
   * @param {{ bones: Map<string, import('three').Bone>, body: import('three').Object3D,
   *   skeleton?: import('three').Skeleton }} model the bones by name, the model's root object
   * @param {{ chains: { kind: string, bones: string[], tip: number[] }[],
   *   colliders: { a: string, b: string, r: number }[] }} info from the manifest
   * @param {object} tuning per kind: frequency (rad/s), damping (ratio), air (1/s), gravity
   *   (0..1: how much a tilted pelvis still hangs straight), clearance (m), inward (share of
   *   the rest distance from the body axis it may lose), maxAngle (rad from rest)
   */
  constructor(model, info, tuning) {
    this.body = model.body;
    this.hips = model.bones.get('Hips');
    this.tuning = tuning;
    this.mode = 0;
    this.ready = false;
    // The hips' rotation in the bind pose (model space): the tilt is measured against it.
    this.hipsBind = new Quaternion();
    const sk = model.skeleton;
    const bindOf = (bone) => {
      const i = sk ? sk.bones.indexOf(bone) : -1;
      return i >= 0 ? _m.copy(sk.boneInverses[i]).invert() : bone.matrixWorld;
    };
    if (this.hips) bindOf(this.hips).decompose(_a, this.hipsBind, _s);
    const hipsBindPos = this.hips ? new Vector3().setFromMatrixPosition(bindOf(this.hips)) : new Vector3();

    // Legs as tapered capsules from `from` of the way along bone a to bone b: radius r at the
    // upper end, r2 at bone b.
    this.colliders = (info.colliders ?? [])
      .map((c) => ({ a: model.bones.get(c.a), b: model.bones.get(c.b), r: c.r, r2: c.r2 ?? c.r, rMax: Math.max(c.r, c.r2 ?? c.r), from: c.from ?? 0, pa: new Vector3(), pb: new Vector3(), mid: new Vector3(), half: 0 }))
      .filter((c) => c.a && c.b);
    this.chains = [];
    for (const c of info.chains ?? []) {
      const bones = c.bones.map((n) => model.bones.get(n));
      if (bones.some((b) => !b) || bones[0].parent !== this.hips) continue;
      const tune = tuning[c.kind] ?? tuning.hem;
      const n = bones.length;
      const dir = [];
      const len = [];
      for (let j = 0; j < n; j++) {
        const off = j < n - 1 ? bones[j + 1].position : new Vector3().fromArray(c.tip);
        len.push(off.length());
        dir.push(off.clone().normalize());
      }
      // Rest distance of each tail from the body's vertical axis (bind pose, model space; cloth
      // bones have no bind rotation, so the tip offset is in model space too).
      const restRadial = [];
      for (let j = 0; j < n; j++) {
        const tail = new Vector3().setFromMatrixPosition(bindOf(bones[Math.min(j + 1, n - 1)]));
        if (j === n - 1) tail.add(new Vector3().fromArray(c.tip));
        restRadial.push(Math.hypot(tail.x - hipsBindPos.x, tail.z - hipsBindPos.z));
      }
      this.chains.push({
        tune,
        bones,
        bind: bones.map((b) => b.quaternion.clone()),
        dir,
        len,
        restRadial,
        p: bones.map(() => new Vector3()),
        v: bones.map(() => new Vector3()),
        tPrev: bones.map(() => new Vector3()),
        tgt: bones.map(() => new Vector3()), // this frame's target and head per bone
        head: bones.map(() => new Vector3()),
        radial: new Vector3(), // outward from the body through the chain's head (per update)
        kind: c.kind,
      });
    }
    this._lastHips = new Vector3();
    // Chains around the body in order (the converter lists each garment's chains by angle):
    // neighbors pull each other along (_smooth).
    this.rings = ['skirt', 'hem'].map((k) => this.chains.filter((c) => c.kind === k)).filter((r) => r.length > 2);
    this._disp = Array.from({ length: Math.max(0, ...this.rings.map((r) => r.length)) }, () => new Vector3());
    this._fitColliders();
  }

  /**
   * In the bind pose nothing touches: where a leg capsule reaches a chain bone there (the skirt
   * hugs the hips, a capsule has one radius per end), that pair gets a smaller radius, so the
   * cloth hangs as modeled until a leg actually moves into it. Per chain bone and leg.
   */
  _fitColliders() {
    if (!this.hips) return;
    this.body.updateMatrixWorld(true);
    for (const col of this.colliders) {
      col.pb.setFromMatrixPosition(col.b.matrixWorld);
      col.pa.setFromMatrixPosition(col.a.matrixWorld).lerp(col.pb, col.from);
    }
    for (const c of this.chains) {
      const clear = c.tune.clearance + 0.005;
      c.cap = c.bones.map(() => new Float32Array(this.colliders.length).fill(Infinity));
      _head.setFromMatrixPosition(c.bones[0].matrixWorld);
      for (let j = 0; j < c.bones.length; j++) {
        if (j < c.bones.length - 1) _target.setFromMatrixPosition(c.bones[j + 1].matrixWorld);
        else _target.copy(c.dir[j]).multiplyScalar(c.len[j]).applyMatrix4(c.bones[j].matrixWorld);
        this.colliders.forEach((col, ci) => {
          const s = closestSegments(_head, _target, col.pa, col.pb);
          if (s < 0.08) return;
          const t = _r.subVectors(_c2, col.pa).dot(_d2) / Math.max(1e-9, _d2.lengthSq());
          const R = col.r + (col.r2 - col.r) * t;
          const room = _c1.distanceTo(_c2) - clear;
          if (room < R) c.cap[j][ci] = Math.max(0.6 * R, room) - R; // a negative offset
        });
        _head.copy(_target);
      }
    }
  }

  /** Back to the bind pose (the cloth moves rigidly with the hips). */
  rest() {
    for (const c of this.chains) c.bones.forEach((b, j) => b.quaternion.copy(c.bind[j]));
    this.ready = false;
  }

  /**
   * @param {number} dt seconds since the last update
   * @param {number} mode 2 dynamics, 1 legs only, 0 rest
   */
  update(dt, mode) {
    if (!this.hips || !this.chains.length) return;
    if (mode === 0) {
      if (this.mode !== 0) this.rest();
      this.mode = 0;
      return;
    }
    if (this.mode === 0) this.ready = false;
    this.mode = mode;
    // The pelvis: where it is, and its tilt (the swing part of its rotation away from the
    // bind pose, without the turn about the vertical).
    this.hips.matrixWorld.decompose(_hipsPos, _hipsQ, _s);
    this.body.matrixWorld.decompose(_a, _bodyQ, _s);
    _delta.copy(_bodyQ).multiply(this.hipsBind).invert().premultiply(_hipsQ);
    _twist.set(0, _delta.y, 0, _delta.w);
    if (_twist.lengthSq() < 1e-10) _twist.identity();
    else _twist.normalize();
    _swing.copy(_delta).multiply(_inv.copy(_twist).invert());
    _swingInv.copy(_swing).invert();
    _uprightQ.copy(_twist).multiply(_bodyQ); // the body upright, turned with the pelvis
    _axis.copy(UP).applyQuaternion(_swing); // the body's axis through the pelvis
    if (this.ready && _hipsPos.distanceToSquared(this._lastHips) > 1.5 * 1.5) this.ready = false; // teleported
    this._lastHips.copy(_hipsPos);
    for (const col of this.colliders) {
      col.pb.setFromMatrixPosition(col.b.matrixWorld);
      col.pa.setFromMatrixPosition(col.a.matrixWorld).lerp(col.pb, col.from);
      col.mid.addVectors(col.pa, col.pb).multiplyScalar(0.5);
      col.half = col.pa.distanceTo(col.pb) * 0.5;
    }
    // At most four small steps a frame: a long frame (a hitch, a throttled far update) only
    // simulates its last few hundredths of a second (the cloth follows the body through the
    // rest), so a big time step can't blow it up.
    const dynamic = mode === 2 && this.ready && dt > 0;
    const maxStep = this.tuning.maxStep ?? 1 / 90;
    const simDt = Math.min(dt, 4 * maxStep);
    const steps = dynamic ? Math.min(4, Math.max(1, Math.ceil(simDt / maxStep))) : 0;
    const h = steps ? simDt / steps : 0;
    for (const c of this.chains) this._chain(c, dt, steps, h);
    for (const ring of this.rings) {
      this._smooth(ring);
      for (const c of ring) this._pose(c);
    }
    this.ready = true;
  }

  /**
   * Cloth is one piece: where a leg pushes a chain out (a tent over a knee), its neighbors come
   * most of the way (each at least `spread` of its more displaced neighbor, outward only), so
   * the fabric lifts as one broad tent and the knee doesn't poke through a fold between two
   * chains. Level by level down the chains, then out of the legs again.
   */
  _smooth(ring) {
    const n = ring.length;
    const D = this._disp;
    const levels = ring[0].bones.length;
    const spread = ring[0].tune.spread ?? 0.7;
    for (let j = 0; j < levels; j++) {
      for (let pass = 0; pass < 3; pass++) {
        for (let i = 0; i < n; i++) D[i].subVectors(ring[i].p[j], ring[i].tgt[j]);
        for (let i = 0; i < n; i++) {
          const c = ring[i];
          const l = D[(i + n - 1) % n];
          const r = D[(i + 1) % n];
          const big = l.lengthSq() > r.lengthSq() ? l : r;
          if (big.lengthSq() * spread * spread <= D[i].lengthSq() + 1e-6) continue;
          _prev.copy(c.p[j]);
          c.p[j].copy(c.tgt[j]).addScaledVector(big, spread);
          // Keep the bone's length from its head; lower bones come along.
          _head.copy(c.head[j]);
          this._collide(c, j, c.p[j], c.len[j], c.tune);
          _n.subVectors(c.p[j], _prev);
          for (let k = j + 1; k < levels; k++) {
            c.p[k].add(_n);
            c.tgt[k].add(_n);
            c.head[k].add(_n);
          }
        }
      }
    }
  }

  /** Turns the chain's bones toward their particles (after smoothing). */
  _pose(c) {
    _parentQ.copy(_hipsQ);
    for (let j = 0; j < c.bones.length; j++) {
      _restQ.copy(_parentQ).multiply(c.bind[j]);
      _restDir.copy(c.dir[j]).applyQuaternion(_restQ);
      const headJ = j ? c.p[j - 1] : c.head[0];
      _n.subVectors(c.p[j], headJ);
      const l = _n.length();
      if (l < 1e-6) continue;
      _n.divideScalar(l);
      _turn.setFromUnitVectors(_restDir, _n);
      _worldQ.copy(_turn).multiply(_restQ);
      c.bones[j].quaternion.copy(_inv.copy(_parentQ).invert()).multiply(_worldQ);
      _parentQ.copy(_worldQ);
    }
  }

  _chain(c, dt, steps, h) {
    const T = c.tune;
    _parentQ.copy(_hipsQ);
    _head.copy(c.bones[0].position).applyMatrix4(this.hips.matrixWorld);
    // The chain's outward direction (from the body's axis through its head, level).
    c.radial.subVectors(_head, _hipsPos);
    c.radial.addScaledVector(_axis, -c.radial.dot(_axis));
    if (c.radial.lengthSq() > 1e-10) c.radial.normalize();
    const w = T.frequency;
    const k = w * w;
    const damp = 2 * T.damping * w;
    for (let j = 0; j < c.bones.length; j++) {
      const bone = c.bones[j];
      const L = c.len[j];
      _restQ.copy(_parentQ).multiply(c.bind[j]);
      _restDir.copy(c.dir[j]).applyQuaternion(_restQ);
      // Gravity: each bone hangs (partly) as it would on a body standing upright, however the
      // pelvis tilts or the bone above it swings (below a knee pushing it forward the skirt
      // drops back down instead of carrying on into a sail).
      const g = j ? T.gravityLower ?? 0 : T.gravity;
      if (g > 0) {
        _upright.copy(c.dir[j]).applyQuaternion(_uprightQ);
        _dir.copy(_restDir).lerp(_upright, g).normalize();
      } else _dir.copy(_restDir);
      _target.copy(_head).addScaledVector(_dir, L);
      const p = c.p[j];
      const v = c.v[j];
      if (!steps) {
        // Placed at the target (first frame, legs-only mode), then out of the legs (two
        // passes: each push is undone a little by keeping the bone's length).
        p.copy(_target);
        v.set(0, 0, 0);
        for (let it = 0; it < 2; it++) this._collide(c, j, p, L, T);
      } else {
        // Damped spring toward the target, relative to the target's own motion (walking along
        // doesn't drag the cloth back), plus a little air drag.
        _a.subVectors(_target, c.tPrev[j]).divideScalar(dt); // the target's velocity
        // The part of a long frame that isn't simulated: the cloth moves along with the body.
        p.addScaledVector(_a, dt - h * steps);
        for (let s = 0; s < steps; s++) {
          _prev.copy(p);
          _n.subVectors(_target, p).multiplyScalar(k);
          _n.addScaledVector(_r.subVectors(v, _a), -damp);
          _n.addScaledVector(v, -T.air);
          v.addScaledVector(_n, h);
          p.addScaledVector(v, h);
          // The bone's length: the velocity follows (it swings around its head).
          _n.subVectors(p, _head);
          const l = _n.length();
          if (l > 1e-6) p.copy(_head).addScaledVector(_n, L / l);
          v.subVectors(p, _prev).divideScalar(h);
          // Out of the legs: cloth doesn't bounce, only a little of a push becomes motion
          // (else a leg's push would fling it), and never faster than it could flap.
          _prev.copy(p);
          this._collide(c, j, p, L, T);
          v.addScaledVector(_n.subVectors(p, _prev), (T.pushVelocity ?? 0.15) / h);
          _n.subVectors(v, _a); // relative to the body: never faster than it could flap
          const sp = _n.length();
          if (sp > MAX_SPEED) v.copy(_a).addScaledVector(_n, MAX_SPEED / sp);
        }
      }
      c.tPrev[j].copy(_target);
      c.tgt[j].copy(_target);
      c.head[j].copy(_head);
      // No wild swings: at most maxAngle away from the target direction (the lower bone of a
      // chain may go farther: a knee kicked up under a skirt).
      const maxAngle = j ? T.maxAngleLower ?? T.maxAngle : T.maxAngle;
      _n.subVectors(p, _head).normalize();
      const cos = _n.dot(_dir);
      if (cos < Math.cos(maxAngle)) {
        _turn.setFromUnitVectors(_dir, _n);
        _turn.slerp(_inv.identity(), 1 - maxAngle / Math.acos(Math.max(-1, cos)));
        _n.copy(_dir).applyQuaternion(_turn);
        p.copy(_head).addScaledVector(_n, L);
      }
      // Turn the bone toward its particle.
      _turn.setFromUnitVectors(_restDir, _n);
      _worldQ.copy(_turn).multiply(_restQ);
      bone.quaternion.copy(_inv.copy(_parentQ).invert()).multiply(_worldQ);
      _parentQ.copy(_worldQ);
      _head.copy(p);
    }
  }

  /** Keeps the tail `p` of chain bone j out of the legs and the body; keeps its length. */
  _collide(c, j, p, L, T) {
    const caps = c.cap?.[j];
    // Bone segment (head -> tail) as a sphere, for a quick reject.
    _bc.addVectors(_head, p).multiplyScalar(0.5);
    const bRad = L * 0.5;
    for (let ci = 0; ci < this.colliders.length; ci++) {
      const col = this.colliders[ci];
      const reach = bRad + col.half + col.rMax + T.clearance;
      if (_bc.distanceToSquared(col.mid) > reach * reach) continue;
      const s = closestSegments(_head, p, col.pa, col.pb);
      const t = _d2.lengthSq() > 1e-9 ? _r.subVectors(_c2, col.pa).dot(_d2) / _d2.lengthSq() : 0;
      const off = caps && caps[ci] < 0 ? caps[ci] : 0;
      const R = col.r + (col.r2 - col.r) * t + T.clearance + off;
      const d2 = _c1.distanceToSquared(_c2);
      if (d2 >= R * R || s < 0.08) continue;
      // Cloth stays outside the legs: a point caught between the body and a leg that is
      // straight out in its own direction (a knee lifted forward into the front of a skirt) goes
      // out past the leg along that direction, not under it; anywhere else it is pushed straight
      // away from the leg.
      _m3.subVectors(_c2, _hipsPos);
      _m3.addScaledVector(_axis, -_m3.dot(_axis)); // the leg point's radial offset
      const legR = _m3.length();
      _m4.subVectors(_c1, _hipsPos);
      const along = _m4.dot(_axis);
      _m4.addScaledVector(_axis, -along); // the cloth point's radial offset
      const clothR = _m4.length();
      if (legR > 1e-6 && clothR < legR && _m3.dot(c.radial) > INNER_COS * legR) {
        // Out along the chain's own direction to just past the leg.
        _m4.copy(c.radial).multiplyScalar(legR + R).addScaledVector(_axis, along).add(_hipsPos).sub(_c1);
        const need = _m4.length();
        if (need > 1e-6) p.addScaledVector(_m4, Math.min(1 / s, 0.3 / need));
        continue;
      }
      _n.subVectors(_c1, _c2);
      if (_n.lengthSq() > 1e-12) _n.normalize();
      else if (legR > 1e-6) _n.copy(_m3).divideScalar(legR);
      else continue;
      // Where the closest point has to go, and the tail's share of that (it moves s times less).
      _m4.copy(_c2).addScaledVector(_n, R).sub(_c1);
      const need = _m4.length();
      if (need > 1e-6) p.addScaledVector(_m4, Math.min(1 / s, 0.3 / need));
    }
    // Not into the body: no closer to the body's axis than (1 - inward) of its rest distance.
    const minR = c.restRadial[j] * (1 - T.inward);
    _n.subVectors(p, _hipsPos);
    const along = _n.dot(_axis);
    _n.addScaledVector(_axis, -along); // radial offset
    const r = _n.length();
    if (r < minR && r > 1e-6) p.addScaledVector(_n, minR / r - 1);
    // Keep the bone's length.
    _n.subVectors(p, _head);
    const l = _n.length();
    if (l > 1e-6) p.copy(_head).addScaledVector(_n, L / l);
  }
}
