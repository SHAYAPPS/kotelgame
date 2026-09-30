import { Vector3 } from 'three';
import { closestSegmentSegment } from '../world/capsuleContact.js';

const _oc = new Vector3();
const _end = new Vector3();
const _c1 = new Vector3();
const _c2 = new Vector3();

/** Distance along a (unit) ray to a sphere, or -1. */
export function raySphere(origin, dir, center, radius, maxDist) {
  _oc.subVectors(origin, center);
  const b = _oc.dot(dir);
  const c = _oc.lengthSq() - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return -1;
  const t = -b - Math.sqrt(disc);
  return t >= 0 && t <= maxDist ? t : -1;
}

/**
 * Distance along a (unit) ray to a capsule (segment a-b, radius), or -1.
 * Uses the closest points between the ray segment and the capsule axis, then backs
 * off to the surface; accurate enough for hit detection.
 */
export function rayCapsule(origin, dir, a, b, radius, maxDist) {
  _end.copy(origin).addScaledVector(dir, maxDist);
  const d2 = closestSegmentSegment(origin, _end, a, b, _c1, _c2);
  if (d2 > radius * radius) return -1;
  const along = _c1.distanceTo(origin);
  const back = Math.sqrt(Math.max(0, radius * radius - d2));
  return Math.max(0, along - back);
}
