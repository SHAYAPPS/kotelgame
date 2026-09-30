import { Vector3 } from 'three';

// Exact capsule-vs-triangle contact, based on closest points between the
// capsule's core segment and the triangle (Ericson, "Real-Time Collision
// Detection", 5.1.9 and 5.1.10). All scratch objects are module-level so the
// hot path never allocates.

const EPS = 1e-9;

const _d1 = new Vector3();
const _d2 = new Vector3();
const _r = new Vector3();
const _n = new Vector3();
const _x = new Vector3();
const _c = new Vector3();
const _s = new Vector3();
const _t = new Vector3();
const _bary = new Vector3();

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Closest points between segments [p1, q1] and [p2, q2].
 * Writes them into c1 / c2 and returns the squared distance.
 */
export function closestSegmentSegment(p1, q1, p2, q2, c1, c2) {
  _d1.subVectors(q1, p1);
  _d2.subVectors(q2, p2);
  _r.subVectors(p1, p2);
  const a = _d1.dot(_d1);
  const e = _d2.dot(_d2);
  const f = _d2.dot(_r);
  let s;
  let t;

  if (a <= EPS && e <= EPS) {
    s = 0;
    t = 0;
  } else if (a <= EPS) {
    s = 0;
    t = clamp01(f / e);
  } else {
    const c = _d1.dot(_r);
    if (e <= EPS) {
      t = 0;
      s = clamp01(-c / a);
    } else {
      const b = _d1.dot(_d2);
      const denom = a * e - b * b;
      s = denom > EPS ? clamp01((b * f - c * e) / denom) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp01(-c / a);
      } else if (t > 1) {
        t = 1;
        s = clamp01((b - c) / a);
      }
    }
  }

  c1.copy(p1).addScaledVector(_d1, s);
  c2.copy(p2).addScaledVector(_d2, t);
  return c1.distanceToSquared(c2);
}

/**
 * Closest points between segment [p, q] and a THREE.Triangle.
 * Writes them into outSeg / outTri and returns the squared distance
 * (0 when the segment pierces the triangle).
 */
export function closestSegmentTriangle(p, q, tri, outSeg, outTri) {
  tri.getNormal(_n);
  const dp = _n.dot(_x.subVectors(p, tri.a));
  const dq = _n.dot(_x.subVectors(q, tri.a));

  // Segment crosses the triangle's plane: check whether it pierces the triangle.
  if ((dp <= 0 && dq >= 0) || (dp >= 0 && dq <= 0)) {
    const denom = dp - dq;
    if (Math.abs(denom) > EPS) {
      _x.lerpVectors(p, q, dp / denom);
      if (tri.containsPoint(_x)) {
        outSeg.copy(_x);
        outTri.copy(_x);
        return 0;
      }
    }
  }

  // Otherwise the minimum is between an endpoint and the triangle,
  // or between the segment and one of the triangle's edges.
  let best = Infinity;

  tri.closestPointToPoint(p, _c);
  let d = p.distanceToSquared(_c);
  if (d < best) {
    best = d;
    outSeg.copy(p);
    outTri.copy(_c);
  }

  tri.closestPointToPoint(q, _c);
  d = q.distanceToSquared(_c);
  if (d < best) {
    best = d;
    outSeg.copy(q);
    outTri.copy(_c);
  }

  d = closestSegmentSegment(p, q, tri.a, tri.b, _s, _t);
  if (d < best) {
    best = d;
    outSeg.copy(_s);
    outTri.copy(_t);
  }
  d = closestSegmentSegment(p, q, tri.b, tri.c, _s, _t);
  if (d < best) {
    best = d;
    outSeg.copy(_s);
    outTri.copy(_t);
  }
  d = closestSegmentSegment(p, q, tri.c, tri.a, _s, _t);
  if (d < best) {
    best = d;
    outSeg.copy(_s);
    outTri.copy(_t);
  }

  return best;
}

const _ps = new Vector3();
const _pt = new Vector3();
const _faceN = new Vector3();

/**
 * Penetration of a capsule into a single triangle.
 *
 * Triangles are treated as one-sided (world meshes are closed with outward
 * normals): a contact whose closest point lies on an edge seen from behind is
 * ignored, because the neighbouring face owns it. If the capsule's core is
 * behind the face's interior (deep penetration), it is pushed back out to the
 * front side instead of being pulled through.
 *
 * @param {import('three/addons/math/Capsule.js').Capsule} capsule
 * @param {import('three').Triangle} tri
 * @param {{ normal: Vector3, point: Vector3, depth: number }} out
 *   normal: push-out direction, point: contact point on the triangle,
 *   depth: push distance along normal.
 * @returns {boolean} true when penetrating.
 */
export function capsuleTriangleContact(capsule, tri, out) {
  const r = capsule.radius;
  const d2 = closestSegmentTriangle(capsule.start, capsule.end, tri, _ps, _pt);
  if (d2 >= r * r) return false;

  tri.getNormal(_faceN);
  const dist = Math.sqrt(d2);
  const side = _faceN.dot(_x.subVectors(_ps, tri.a));

  if (dist > 1e-6 && side >= -1e-6) {
    // Regular contact from the front side (face, edge or vertex).
    out.normal.subVectors(_ps, _pt).divideScalar(dist);
    out.depth = r - dist;
  } else {
    // The core segment touches the triangle or lies behind it.
    if (dist > 1e-6) {
      tri.getBarycoord(_pt, _bary);
      const interior = _bary.x > 1e-4 && _bary.y > 1e-4 && _bary.z > 1e-4;
      if (!interior) return false; // behind an edge: the adjacent face handles it
    }
    const ds = _faceN.dot(_x.subVectors(capsule.start, tri.a));
    const de = _faceN.dot(_x.subVectors(capsule.end, tri.a));
    out.normal.copy(_faceN);
    out.depth = r - Math.min(ds, de);
  }

  out.point.copy(_pt);
  return out.depth > 0;
}
