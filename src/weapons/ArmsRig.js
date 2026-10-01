import { Matrix4, Quaternion, Vector3 } from 'three';

// First-person arms (public/assets/weapons/arms.glb): the hands are placed where the weapon
// wants them and the arms follow with two-bone IK; the fingers curl around grips. The rig's
// hands hang off their own control bones (not the forearms), so a hand can be put anywhere
// and the forearm only has to reach its wrist. Everything here works in the space of the
// arms' scene object (kept at identity inside the viewmodel scene, i.e. view space).

const FINGERS = ['index', 'middle', 'ring', 'pinky'];
const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();
const _d = new Vector3();
const _e = new Vector3();
const _u = new Vector3();
const _x = new Vector3();
const _y = new Vector3();
const _z = new Vector3();
const _q = new Quaternion();
const _q2 = new Quaternion();
const _qp = new Quaternion();
const _bx = new Vector3();
const _by = new Vector3();
const _bz = new Vector3();
const _wp = new Vector3();
const _m0 = new Matrix4();
const _m1 = new Matrix4();
const _m2 = new Matrix4();
const _s = new Vector3();

function worldPos(o, out) {
  return out.setFromMatrixPosition(o.matrixWorld);
}

function worldQuat(o, out) {
  o.matrixWorld.decompose(_wp, out, _s);
  return out;
}

function basis(a, b, m) {
  _bx.copy(a).normalize();
  _by.copy(b).addScaledVector(_bx, -b.dot(_bx));
  if (_by.lengthSq() < 1e-12) _by.set(_bx.y, -_bx.x, 0.1);
  _by.normalize();
  _bz.crossVectors(_bx, _by);
  return m.makeBasis(_bx, _by, _bz);
}

/** The rotation taking direction a0 to a1 exactly and b0 as close to b1 as it can. */
export function frameRotation(a0, b0, a1, b1, out) {
  basis(a0, b0, _m0).transpose();
  basis(a1, b1, _m1).multiply(_m0);
  return out.setFromRotationMatrix(_m1);
}

/** Sets a bone's rotation so its world rotation becomes q (its parent's world matrix is current). */
function setWorldQuat(bone, q) {
  worldQuat(bone.parent, _qp).invert();
  bone.quaternion.copy(_qp).multiply(q);
  bone.updateMatrixWorld(true);
}

export class ArmsRig {
  /** @param {import('three').Object3D} scene the loaded arms.glb scene */
  constructor(scene) {
    this.object = scene;
    scene.updateMatrixWorld(true);
    let mesh = null;
    scene.traverse((o) => {
      if (o.isSkinnedMesh) mesh = o;
    });
    this.mesh = mesh;
    mesh.frustumCulled = false;
    const sk = mesh.skeleton;
    const bone = (n) => sk.getBoneByName(n);
    this.rootBone = bone('caucasian_male_1');
    this.rootRest = this.rootBone.position.clone();
    this.sides = {};
    for (const S of ['R', 'L']) {
      const d = {
        clavicle: bone(`clavicle${S}`),
        upper: bone(`upper_arm${S}`),
        fore: bone(`forearm${S}`),
        end: bone(`forearm${S}_end`),
        control: bone(`hand${S}control`),
        hand: bone(`hand${S}`),
        handQ: new Quaternion(),
        handP: new Vector3(),
        reach: 0, // how far past full extension the last target was (m; > 0 = too far)
      };
      d.clavRest = d.clavicle.position.clone();
      d.S0 = worldPos(d.upper, new Vector3());
      d.E0 = worldPos(d.fore, new Vector3());
      d.W0 = worldPos(d.end, new Vector3());
      d.L1 = d.S0.distanceTo(d.E0);
      d.L2 = d.E0.distanceTo(d.W0);
      d.upperQ0 = worldQuat(d.upper, new Quaternion());
      d.foreQ0 = worldQuat(d.fore, new Quaternion());
      d.handQ0 = worldQuat(d.hand, new Quaternion());
      d.d10 = d.E0.clone().sub(d.S0).normalize();
      d.d20 = d.W0.clone().sub(d.E0).normalize();
      d.n0 = new Vector3().crossVectors(d.d10, d.d20).normalize();
      // The plane normal as the hand saw it at rest (the forearm's twist follows the hand).
      d.nHand = d.n0.clone().applyQuaternion(d.handQ0.clone().invert());
      // Hand frame at rest: fingers (wrist -> knuckles) and the palm's facing.
      const H = worldPos(d.hand, new Vector3());
      const idx = worldPos(bone(`f_index01${S}`), new Vector3());
      const pky = worldPos(bone(`f_pinky01${S}`), new Vector3());
      const knuckles = idx.clone().add(pky).multiplyScalar(0.5);
      d.f0 = knuckles.clone().sub(H).normalize();
      const across = idx.clone().sub(pky).normalize();
      d.p0 = (S === 'R' ? across.clone().cross(d.f0) : d.f0.clone().cross(across)).normalize();
      // Palm center (on the palm's skin) relative to the hand bone, in the hand's frame.
      const palm = H.clone().lerp(knuckles, 0.55).addScaledVector(d.p0, 0.016);
      d.palmLocal = palm.sub(H).applyQuaternion(d.handQ0.clone().invert());
      d.handLocal = d.hand.matrix.clone(); // hand relative to its control bone
      d.handLocalInv = d.handLocal.clone().invert();
      // Fingers: rest rotations and the curl axis of each joint in the bone's own frame.
      d.fingers = {};
      for (const f of [...FINGERS, 'thumb']) {
        const names = f === 'thumb' ? [`thumb01${S}`, `thumb02${S}`, `thumb03${S}`] : [`f_${f}01${S}`, `f_${f}02${S}`, `f_${f}03${S}`];
        const tip = f === 'thumb' ? `thumb03${S}_end` : `f_${f}03${S}_end`;
        const bones = names.map(bone);
        const joints = bones.map((b, i) => {
          const p = worldPos(b, new Vector3());
          const next = worldPos(i < 2 ? bones[i + 1] : bone(tip), new Vector3());
          const dir = next.sub(p).normalize();
          // Curl toward the palm's side: axis = dir x palm normal (see frameRotation's sign).
          const axis = new Vector3().crossVectors(dir, d.p0).normalize();
          // Thumb: also a swing about the palm normal (toward / away from the fingers).
          const swing = d.p0.clone();
          const inv = worldQuat(b, new Quaternion()).invert();
          return { bone: b, q0: b.quaternion.clone(), axis: axis.applyQuaternion(inv), swing: swing.applyQuaternion(inv) };
        });
        d.fingers[f] = joints;
      }
      this.sides[S] = d;
    }
  }

  /** Moves the shoulders (the rig's root bone) by an offset from rest, in rig space. */
  setShoulders(x, y, z) {
    this.rootBone.position.set(this.rootRest.x + x, this.rootRest.y + y, this.rootRest.z + z);
    this.rootBone.updateMatrixWorld(true);
  }

  /**
   * Hand target: the palm's center at `palm`, fingers (wrist -> knuckles) along `fingers`,
   * the palm facing `normal` (rig space).
   */
  placeHand(S, palm, fingers, normal) {
    const d = this.sides[S];
    frameRotation(d.f0, d.p0, fingers, normal, _q);
    d.handQ.copy(_q).multiply(d.handQ0);
    d.handP.copy(d.palmLocal).applyQuaternion(d.handQ).negate().add(palm);
  }

  /** Curls a finger: angles (radians) per joint from the rest pose; thumb: also a swing. */
  curl(S, finger, a, b, c, swing = 0) {
    const j = this.sides[S].fingers[finger];
    const angles = [a, b, c];
    for (let i = 0; i < 3; i++) {
      const J = j[i];
      _q.setFromAxisAngle(J.axis, angles[i]);
      J.bone.quaternion.copy(J.q0).multiply(_q);
      if (i === 0 && swing) J.bone.quaternion.multiply(_q2.setFromAxisAngle(J.swing, swing));
    }
  }

  /**
   * Solves both arms for the placed hands. `pole`: per side, where the elbow should point
   * (rig space direction). twist: share of the hand's roll the forearm takes (wrist wrap).
   */
  solve(poleR, poleL, twist = 0.55) {
    this.rootBone.updateMatrixWorld(true);
    this._arm(this.sides.R, poleR, twist);
    this._arm(this.sides.L, poleL, twist);
  }

  _arm(d, pole, twist) {
    // Hand first: its control bone so the hand lands on target.
    _m2.compose(d.handP, d.handQ, _s.set(1, 1, 1)).multiply(d.handLocalInv);
    _m1.copy(d.control.parent.matrixWorld).invert().multiply(_m2);
    _m1.decompose(d.control.position, d.control.quaternion, _s);
    d.control.updateMatrixWorld(true);

    // Out of reach: the shoulder comes forward (the clavicle slides toward the hand) rather
    // than leave a gap at the wrist.
    d.clavicle.position.copy(d.clavRest);
    d.clavicle.updateMatrixWorld(true);
    let S = worldPos(d.upper, _a);
    const W = d.handP;
    const over = S.distanceTo(W) - (d.L1 + d.L2) * 0.995;
    if (over > 0) {
      _u.copy(W).sub(S).normalize().multiplyScalar(Math.min(over, 0.14));
      // Into the clavicle's parent space (directions only).
      worldQuat(d.clavicle.parent, _qp).invert();
      _u.applyQuaternion(_qp);
      d.clavicle.position.add(_u);
      d.clavicle.updateMatrixWorld(true);
      S = worldPos(d.upper, _a);
    }
    _u.copy(W).sub(S);
    let dist = _u.length();
    _u.divideScalar(dist || 1);
    const max = (d.L1 + d.L2) * 0.9995;
    const min = Math.abs(d.L1 - d.L2) * 1.05 + 1e-4;
    d.reach = dist - max;
    dist = Math.min(max, Math.max(min, dist));
    const along = (d.L1 * d.L1 - d.L2 * d.L2 + dist * dist) / (2 * dist);
    const h = Math.sqrt(Math.max(0, d.L1 * d.L1 - along * along));
    _b.copy(pole).addScaledVector(_u, -pole.dot(_u));
    if (_b.lengthSq() < 1e-10) _b.set(0, -1, 0).addScaledVector(_u, _u.y);
    _b.normalize();
    const E = _c.copy(S).addScaledVector(_u, along).addScaledVector(_b, h);
    const d1 = _d.copy(E).sub(S).normalize();
    const d2 = _e.copy(W).sub(E).normalize();
    // Bend-plane normal (d1 x d2), the same handedness as at rest.
    _x.crossVectors(d1, d2);
    if (_x.lengthSq() < 1e-10) _x.crossVectors(_b, _u);
    const n = _y.copy(_x).normalize();
    const nKeep = _z.copy(n);

    frameRotation(d.d10, d.n0, d1, nKeep, _q);
    _q.multiply(d.upperQ0);
    setWorldQuat(d.upper, _q);

    // Forearm along E -> W, then twisted toward the hand's roll.
    const d2c = _b.copy(W).sub(worldPos(d.fore, _c)).normalize();
    frameRotation(d.d20, d.n0, d2c, nKeep, _q);
    _q.multiply(d.foreQ0);
    if (twist) {
      const hn = _a.copy(d.nHand).applyQuaternion(d.handQ);
      hn.addScaledVector(d2c, -hn.dot(d2c));
      if (hn.lengthSq() > 1e-10) {
        hn.normalize();
        const phi = Math.atan2(_d.crossVectors(nKeep, hn).dot(d2c), nKeep.dot(hn));
        _q2.setFromAxisAngle(d2c, phi * twist);
        _q.premultiply(_q2);
      }
    }
    setWorldQuat(d.fore, _q);
  }
}
