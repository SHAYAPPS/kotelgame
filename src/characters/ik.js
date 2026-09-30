import { Quaternion, Vector3 } from 'three';

const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();
const _ab = new Vector3();
const _bc = new Vector3();
const _at = new Vector3();
const _pole = new Vector3();
const _elbow = new Vector3();
const _x = new Vector3();
const _y = new Vector3();
const _q = new Quaternion();
const _pq = new Quaternion();
const _wq = new Quaternion();

/**
 * Rotate `bone` (in world space) so its child direction `from` turns to `to` (unit vectors,
 * world). Updates the bone's local quaternion; the caller refreshes world matrices.
 */
export function rotateBoneToward(bone, from, to) {
  _q.setFromUnitVectors(from, to);
  bone.getWorldQuaternion(_wq);
  bone.parent.getWorldQuaternion(_pq);
  // local' = parent^-1 * delta * world
  bone.quaternion.copy(_pq.invert().multiply(_q).multiply(_wq));
}

/** Set a bone's world rotation (local = parent^-1 * world). */
export function setWorldQuaternion(bone, world) {
  bone.parent.getWorldQuaternion(_pq);
  bone.quaternion.copy(_pq.invert().multiply(world));
}

/**
 * Two-bone IK (shoulder - elbow - wrist). Moves the chain so the wrist reaches `target`,
 * keeping the elbow on the side it bent toward in the animation (its pose is the pole).
 * @param {import('three').Bone} upper @param {import('three').Bone} lower @param {import('three').Bone} end
 * @param {Vector3} target world position for `end`
 * @param {number} weight 0..1
 */
export function solveTwoBone(upper, lower, end, target, weight = 1) {
  if (weight <= 0) return;
  upper.getWorldPosition(_a);
  lower.getWorldPosition(_b);
  end.getWorldPosition(_c);
  const l1 = _ab.subVectors(_b, _a).length();
  const l2 = _bc.subVectors(_c, _b).length();
  _at.subVectors(target, _a);
  let d = _at.length();
  if (d < 1e-5 || l1 < 1e-5 || l2 < 1e-5) return;
  if (weight < 1) {
    // Partial weight: aim at a point between the animated wrist and the target.
    _at.lerpVectors(_c, target, weight).sub(_a);
    d = _at.length();
  }
  d = Math.min(d, (l1 + l2) * 0.9999);
  d = Math.max(d, Math.abs(l1 - l2) + 1e-4);
  const dir = _x.copy(_at).normalize();
  // Pole: the animated elbow's offset from the shoulder-wrist line.
  _pole.subVectors(_b, _a);
  _pole.addScaledVector(dir, -_pole.dot(dir));
  if (_pole.lengthSq() < 1e-8) _pole.set(0, -1, 0).addScaledVector(dir, dir.y);
  _pole.normalize();
  // Law of cosines: distance along dir and height of the new elbow.
  const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  _elbow.copy(_a).addScaledVector(dir, along).addScaledVector(_pole, h);

  // Upper bone: old elbow direction -> new elbow direction.
  _y.copy(_ab).normalize();
  _elbow.sub(_a).normalize();
  rotateBoneToward(upper, _y, _elbow);
  upper.updateMatrixWorld(true);
  // Lower bone: its (new) wrist direction -> the target.
  lower.getWorldPosition(_b);
  end.getWorldPosition(_c);
  _y.subVectors(_c, _b).normalize();
  _at.copy(_a).addScaledVector(dir, d).sub(_b).normalize();
  rotateBoneToward(lower, _y, _at);
  lower.updateMatrixWorld(true);
}
