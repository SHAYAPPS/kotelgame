// Fitting head wear to a model's real head (pure, tested in tests/headwear.test.js). The input
// is the rest-pose surface around the head: every vertex that follows the Head bone (skin,
// hair, a hood or a cap), in the Head bone's frame (+Y up the head, +Z the face, +X the left
// ear; meters: CharacterType.headSurface). Head wear built on these radii sits on the hair or
// the hood where it really is, instead of on a scaled ellipsoid (which floats over flat hair
// and sinks into big hair).

/** q-quantile of the first n values of `a` (sorts them). */
function quantile(a, n, q) {
  const v = a.subarray(0, n).sort();
  return v[Math.min(n - 1, Math.max(0, Math.round((n - 1) * q)))];
}

/** Circular smoothing of radii around a ring: a median of 5 (drops spikes), then a mean of 3. */
function smoothRing(r) {
  const n = r.length;
  const med = new Float32Array(n);
  const w = new Float32Array(5);
  for (let i = 0; i < n; i++) {
    for (let k = -2; k <= 2; k++) w[k + 2] = r[(i + k + n) % n];
    med[i] = w.slice().sort()[2];
  }
  for (let i = 0; i < n; i++) r[i] = (med[(i + n - 1) % n] + med[i] * 2 + med[(i + 1) % n]) / 4;
  return r;
}

/**
 * The head's outer surface around a horizontal ring: at each of `n` angles (0 = the front,
 * +Z; increasing toward +X), the q-quantile distance from the ring's axis (x = 0, z = cz) of
 * the surface points within `half` m of the ring's height there and `cone` rad of the angle.
 * The ring sits at height y in front and `tilt` m lower at the back (a band settles down over
 * the back of the head). Angles with no points get the neighbors' radius.
 * @param {Float32Array} pts x, y, z triples
 * @returns {Float32Array} radii (meters)
 */
export function fitRing(pts, { y, cz, tilt = 0, n = 40, half = 0.018, q = 0.85, cone = 0.14 }) {
  const out = new Float32Array(n);
  const step = (Math.PI * 2) / n;
  const span = Math.ceil(cone / step);
  const bins = Array.from({ length: n }, () => []);
  const ys = new Float32Array(n);
  for (let i = 0; i < n; i++) ys[i] = y - (tilt * (1 - Math.cos(i * step))) / 2;
  // Each point into the angles it is near (one pass over the points).
  for (let p = 0; p < pts.length; p += 3) {
    const py = pts[p + 1];
    if (py < y - tilt - half || py > y + half) continue;
    const dx = pts[p];
    const dz = pts[p + 2] - cz;
    const ang = Math.atan2(dx, dz);
    const k0 = Math.round(ang / step);
    for (let k = k0 - span; k <= k0 + span; k++) {
      const i = ((k % n) + n) % n;
      let d = ang - i * step;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      if (Math.abs(d) > cone || Math.abs(py - ys[i]) > half) continue;
      bins[i].push(Math.hypot(dx, dz));
    }
  }
  for (let i = 0; i < n; i++) {
    const b = bins[i];
    out[i] = b.length >= 3 ? quantile(Float32Array.from(b), b.length, q) : NaN;
  }
  // Holes (no points there): from the nearest neighbors.
  for (let pass = 0; pass < n; pass++) {
    let holes = false;
    for (let i = 0; i < n; i++) {
      if (!Number.isNaN(out[i])) continue;
      const l = out[(i + n - 1) % n];
      const r = out[(i + 1) % n];
      if (!Number.isNaN(l) || !Number.isNaN(r)) out[i] = Number.isNaN(l) ? r : Number.isNaN(r) ? l : (l + r) / 2;
      else holes = true;
    }
    if (!holes) break;
  }
  for (let i = 0; i < n; i++) if (Number.isNaN(out[i])) out[i] = 0.09;
  return smoothRing(out);
}

/**
 * The head's outer surface over a cap (kippah): a grid of directions from `center` around
 * `axis`, `rings` + 1 rings out to `maxAngle` rad and `segs` around; at each, the quantile
 * (q at the center easing to qRim at the rim) distance from the center of the surface points
 * within `cone` rad of that direction. Smoothed over the grid, unless `raw` (then NaN where
 * fewer than 3 points, nothing smoothed).
 * @returns {{ dirs: Float32Array, radii: Float32Array, rings: number, segs: number }}
 */
export function fitCap(pts, { center, axis, maxAngle, rings = 6, segs = 28, q = 0.95, qRim = 0.82, cone = 0.13, raw = false }) {
  const [ax, ay, az] = axis;
  // A frame around the axis: u toward +X (the left ear), v = axis x u.
  let ux = 1 - ax * ax;
  let uy = -ax * ay;
  let uz = -ax * az;
  const ul = Math.hypot(ux, uy, uz) || 1;
  ux /= ul;
  uy /= ul;
  uz /= ul;
  const vx = ay * uz - az * uy;
  const vy = az * ux - ax * uz;
  const vz = ax * uy - ay * ux;
  const count = (rings + 1) * segs;
  const dirs = new Float32Array(count * 3);
  const radii = new Float32Array(count);
  const n = pts.length / 3;
  const dist = new Float32Array(n);
  const unit = new Float32Array(n * 3);
  for (let p = 0; p < n; p++) {
    const x = pts[p * 3] - center[0];
    const y = pts[p * 3 + 1] - center[1];
    const z = pts[p * 3 + 2] - center[2];
    const d = Math.hypot(x, y, z) || 1;
    dist[p] = d;
    unit[p * 3] = x / d;
    unit[p * 3 + 1] = y / d;
    unit[p * 3 + 2] = z / d;
  }
  // Only the points around the cap matter.
  const near = [];
  const cosReach = Math.cos(Math.min(Math.PI, maxAngle + cone));
  for (let p = 0; p < n; p++) if (unit[p * 3] * ax + unit[p * 3 + 1] * ay + unit[p * 3 + 2] * az >= cosReach) near.push(p);
  const tmp = new Float32Array(near.length);
  const cosCone = Math.cos(cone);
  for (let j = 0; j <= rings; j++) {
    const th = (j / rings) * maxAngle;
    const qq = q + (qRim - q) * (j / rings);
    for (let k = 0; k < segs; k++) {
      const ph = (k / segs) * Math.PI * 2;
      const s = Math.sin(th);
      const c = Math.cos(th);
      const dx = ax * c + (ux * Math.cos(ph) + vx * Math.sin(ph)) * s;
      const dy = ay * c + (uy * Math.cos(ph) + vy * Math.sin(ph)) * s;
      const dz = az * c + (uz * Math.cos(ph) + vz * Math.sin(ph)) * s;
      const i = j * segs + k;
      dirs[i * 3] = dx;
      dirs[i * 3 + 1] = dy;
      dirs[i * 3 + 2] = dz;
      let m = 0;
      for (const p of near) {
        if (unit[p * 3] * dx + unit[p * 3 + 1] * dy + unit[p * 3 + 2] * dz >= cosCone) tmp[m++] = dist[p];
      }
      radii[i] = m >= 3 ? quantile(tmp, m, qq) : NaN;
    }
  }
  if (raw) return { dirs, radii, rings, segs };
  // Fill holes from the ring's mean, then smooth: each ring around, and between rings.
  for (let j = 0; j <= rings; j++) {
    let sum = 0;
    let cnt = 0;
    for (let k = 0; k < segs; k++) {
      const r = radii[j * segs + k];
      if (!Number.isNaN(r)) {
        sum += r;
        cnt++;
      }
    }
    const mean = cnt ? sum / cnt : 0.09;
    for (let k = 0; k < segs; k++) if (Number.isNaN(radii[j * segs + k])) radii[j * segs + k] = mean;
    smoothRing(radii.subarray(j * segs, (j + 1) * segs));
  }
  // The center ring is one point: everyone's mean.
  let c0 = 0;
  for (let k = 0; k < segs; k++) c0 += radii[k] / segs;
  for (let k = 0; k < segs; k++) radii[k] = c0;
  const src = radii.slice();
  for (let j = 1; j < rings; j++) {
    for (let k = 0; k < segs; k++) radii[j * segs + k] = (src[(j - 1) * segs + k] + 2 * src[j * segs + k] + src[(j + 1) * segs + k]) / 4;
  }
  return { dirs, radii, rings, segs };
}

/** The q-quantile height of the surface points within `r` m of the head's vertical axis. */
export function topHeight(pts, { cz, r = 0.05, q = 0.95 }) {
  const tmp = new Float32Array(pts.length / 3);
  let m = 0;
  for (let p = 0; p < pts.length; p += 3) if (Math.hypot(pts[p], pts[p + 2] - cz) < r) tmp[m++] = pts[p + 1];
  return m ? quantile(tmp, m, q) : NaN;
}

/**
 * A body seen from the front (side = 1, +Z) or the back (side = -1), as a height field over
 * x and y: per `cell`-sized cell, the q-quantile of how far out (z * side) the points on that
 * side of `cz` are. Cells with no points take their neighbors'; smoothed once. `at(x, y)`
 * reads it anywhere (bilinear, clamped to the grid).
 * @returns {{ at: (x: number, y: number) => number }} z in meters
 */
export function surfaceGrid(pts, { x0, x1, y0, y1, cell = 0.01, cz = 0, side = 1, q = 0.95 }) {
  const nx = Math.max(2, Math.round((x1 - x0) / cell) + 1);
  const ny = Math.max(2, Math.round((y1 - y0) / cell) + 1);
  const bins = Array.from({ length: nx * ny }, () => []);
  for (let p = 0; p < pts.length; p += 3) {
    const out = (pts[p + 2] - cz) * side;
    if (out <= 0) continue;
    const i = Math.round((pts[p] - x0) / cell);
    const j = Math.round((pts[p + 1] - y0) / cell);
    if (i < 0 || j < 0 || i >= nx || j >= ny) continue;
    bins[j * nx + i].push(out);
  }
  let v = new Float32Array(nx * ny).fill(NaN);
  for (let k = 0; k < v.length; k++) if (bins[k].length >= 2) v[k] = quantile(Float32Array.from(bins[k]), bins[k].length, q);
  // Fill the holes from the neighbors, a ring at a time.
  for (let pass = 0; pass < nx + ny; pass++) {
    let holes = 0;
    const src = v.slice();
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        if (!Number.isNaN(src[j * nx + i])) continue;
        let sum = 0;
        let n = 0;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ii = i + di;
          const jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= nx || jj >= ny || Number.isNaN(src[jj * nx + ii])) continue;
          sum += src[jj * nx + ii];
          n++;
        }
        if (n) v[j * nx + i] = sum / n;
        else holes++;
      }
    }
    if (!holes) break;
  }
  for (let k = 0; k < v.length; k++) if (Number.isNaN(v[k])) v[k] = 0;
  // Smooth (3 x 3), never pulling a cell inward: the surface stays outside the points.
  const src = v;
  v = new Float32Array(src.length);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      let sum = 0;
      let n = 0;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const ii = i + di;
          const jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
          sum += src[jj * nx + ii];
          n++;
        }
      }
      v[j * nx + i] = Math.max(src[j * nx + i], sum / n);
    }
  }
  return {
    at(x, y) {
      const fx = Math.min(nx - 1, Math.max(0, (x - x0) / cell));
      const fy = Math.min(ny - 1, Math.max(0, (y - y0) / cell));
      const i0 = Math.min(nx - 2, Math.floor(fx));
      const j0 = Math.min(ny - 2, Math.floor(fy));
      const u = fx - i0;
      const w = fy - j0;
      const a = v[j0 * nx + i0] * (1 - u) + v[j0 * nx + i0 + 1] * u;
      const b = v[(j0 + 1) * nx + i0] * (1 - u) + v[(j0 + 1) * nx + i0 + 1] * u;
      return cz + side * (a * (1 - w) + b * w);
    },
  };
}
