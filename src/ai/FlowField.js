// Flow fields on the navmesh grid (pure): the walking distance from every node to the nearest
// of some target nodes (Dijkstra, the same step costs as NavGrid's A*), so a whole crowd can
// head for the nearest exit or shelter by stepping downhill: no path search per person, and
// bottlenecks (doorways, the stairs) fill up on their own.

const SQRT2 = Math.SQRT2;

/** A min-heap of node indices keyed by a float array (lazy decrease-key: stale entries skipped). */
class Heap {
  constructor(cap) {
    this.n = new Int32Array(cap);
    this.k = new Float32Array(cap);
    this.size = 0;
  }

  push(node, key) {
    if (this.size >= this.n.length) {
      const n = new Int32Array(this.n.length * 2);
      const k = new Float32Array(this.k.length * 2);
      n.set(this.n);
      k.set(this.k);
      this.n = n;
      this.k = k;
    }
    let i = this.size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.k[p] <= key) break;
      this.n[i] = this.n[p];
      this.k[i] = this.k[p];
      i = p;
    }
    this.n[i] = node;
    this.k[i] = key;
  }

  pop() {
    const top = this.n[0];
    const last = --this.size;
    const node = this.n[last];
    const key = this.k[last];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= last) break;
      if (c + 1 < last && this.k[c + 1] < this.k[c]) c++;
      if (this.k[c] >= key) break;
      this.n[i] = this.n[c];
      this.k[i] = this.k[c];
      i = c;
    }
    this.n[i] = node;
    this.k[i] = key;
    return top;
  }
}

/**
 * Distance (m) from every node to the nearest seed node (Infinity where unreachable).
 * @param {import('./NavGrid.js').NavGrid} nav
 * @param {number[]} seeds node indices
 */
export function flowField(nav, seeds) {
  const n = nav.nodeCount;
  const dist = new Float32Array(n).fill(Infinity);
  const heap = new Heap(Math.max(1024, n));
  for (const s of seeds) {
    if (s < 0 || !nav.active[s]) continue;
    dist[s] = 0;
    heap.push(s, 0);
  }
  const cell = nav.cell;
  while (heap.size) {
    const i = heap.pop();
    const d = dist[i];
    for (let k = 0; k < 8; k++) {
      const j = nav.neighbors[i * 8 + k];
      if (j < 0 || !nav.active[j]) continue;
      const step = (k % 2 ? SQRT2 : 1) * cell * (1 + nav.wallPenalty[j] * 0.5) + Math.abs(nav.y[j] - nav.y[i]);
      const nd = d + step;
      if (nd < dist[j]) {
        dist[j] = nd;
        heap.push(j, nd);
      }
    }
  }
  return dist;
}

/**
 * The way down the field from (x, z): a unit direction toward the neighbor closest to a
 * seed (out.x, out.z), and out.d the distance left (Infinity off the field). Blends the two
 * best neighbors so people don't zigzag along the grid.
 */
export function flowStep(nav, dist, x, z, out) {
  const i = nav.nodeAt(x, z);
  out.x = 0;
  out.z = 0;
  out.d = i >= 0 ? dist[i] : Infinity;
  if (i < 0 || !Number.isFinite(out.d)) return out;
  let best = -1;
  let bestD = dist[i];
  let second = -1;
  let secondD = Infinity;
  for (let k = 0; k < 8; k++) {
    const j = nav.neighbors[i * 8 + k];
    if (j < 0) continue;
    const dj = dist[j];
    if (dj < bestD) {
      second = best;
      secondD = bestD;
      best = j;
      bestD = dj;
    } else if (dj < secondD) {
      second = j;
      secondD = dj;
    }
  }
  if (best < 0) return out;
  let dx = nav.nodeX(best) - x;
  let dz = nav.nodeZ(best) - z;
  if (second >= 0 && secondD < dist[i]) {
    // Weighted toward the better one.
    const w = (dist[i] - secondD) / Math.max(1e-3, dist[i] - bestD + (dist[i] - secondD));
    dx = dx * (1 - w * 0.5) + (nav.nodeX(second) - x) * w * 0.5;
    dz = dz * (1 - w * 0.5) + (nav.nodeZ(second) - z) * w * 0.5;
  }
  const l = Math.hypot(dx, dz) || 1;
  out.x = dx / l;
  out.z = dz / l;
  return out;
}
