import { Vector3 } from 'three';
import { NAV } from './config.js';

// 8 neighbor directions: E, SE, S, SW, W, NW, N, NE (dx, dz in cells).
const DIRS = [
  [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
];
const SQRT2 = Math.SQRT2;

const _o = new Vector3();
const _d = new Vector3();
const DOWN = new Vector3(0, -1, 0);
const UP = new Vector3(0, 1, 0);

/**
 * Walkable navigation grid baked from the collision world (a grid-based navmesh).
 *
 * Every cell column is probed from the top down for walkable floors (so stacked
 * levels like a bridge over the plaza work), each floor needs standing headroom, and
 * neighbor cells connect when the height change is a step or slope and no obstacle
 * sits between them at knee or chest height. Only the largest connected region is kept
 * (roofs, the top of the wall and furniture tops become unreachable islands).
 */
export class NavGrid {
  /**
   * @param {import('../world/CollisionWorld.js').CollisionWorld} world
   * @param {{ minX: number, maxX: number, minZ: number, maxZ: number }} bounds
   */
  constructor(world, bounds, config = NAV) {
    this.world = world;
    this.cfg = config;
    this.cell = config.cell;
    this.minX = bounds.minX;
    this.minZ = bounds.minZ;
    this.nx = Math.ceil((bounds.maxX - bounds.minX) / this.cell);
    this.nz = Math.ceil((bounds.maxZ - bounds.minZ) / this.cell);
    this._hit = { point: new Vector3(), normal: new Vector3(), distance: 0 };
  }

  /** Probes the world and builds the graph. Returns this. */
  build() {
    const c = this.cfg;
    const cols = this.nx * this.nz;
    const colStart = new Int32Array(cols + 1);
    const ys = [];
    const colOf = [];
    for (let iz = 0; iz < this.nz; iz++) {
      for (let ix = 0; ix < this.nx; ix++) {
        const col = iz * this.nx + ix;
        colStart[col] = ys.length;
        const x = this.minX + (ix + 0.5) * this.cell;
        const z = this.minZ + (iz + 0.5) * this.cell;
        let top = c.topY;
        for (let layer = 0; layer < c.maxLayers; layer++) {
          _o.set(x, top, z);
          const hit = this.world.raycast(_o, DOWN, top + 5, this._hit);
          if (!hit) break;
          const fy = hit.point.y;
          if (fy < c.minY) break; // below every walkable floor (hidden collision planes)
          if (hit.normal.y >= c.minWalkNormalY && this._headroom(x, fy, z)) {
            ys.push(fy);
            colOf.push(col);
          }
          top = fy - 0.05; // keep looking below (the ray passes through the slab from inside)
        }
      }
    }
    colStart[cols] = ys.length;
    const n = ys.length;
    this.colStart = colStart;
    this.y = Float32Array.from(ys);
    this.col = Int32Array.from(colOf);
    this.neighbors = new Int32Array(n * 8).fill(-1);
    this.wallPenalty = new Float32Array(n);

    // Orthogonal connections first (E and S; mirrored), then diagonals.
    for (let i = 0; i < n; i++) {
      for (const dirIndex of [0, 2]) this._connect(i, dirIndex);
    }
    for (let i = 0; i < n; i++) {
      for (const dirIndex of [1, 3]) this._connectDiagonal(i, dirIndex);
    }
    // Nodes next to missing connections cost more, so paths keep off walls.
    for (let i = 0; i < n; i++) {
      let missing = 0;
      for (let k = 0; k < 8; k += 2) if (this.neighbors[i * 8 + k] < 0) missing++;
      this.wallPenalty[i] = missing * 0.6;
    }
    this._keepLargestRegion();
    this._open = new BinaryHeap(n * 8); // lazy decrease-key pushes duplicates
    this._g = new Float32Array(n);
    this._from = new Int32Array(n);
    this._seen = new Uint32Array(n);
    this._stamp = 0;
    return this;
  }

  get nodeCount() {
    return this.y.length;
  }

  nodeX(i) {
    return this.minX + ((this.col[i] % this.nx) + 0.5) * this.cell;
  }

  nodeZ(i) {
    return this.minZ + (Math.floor(this.col[i] / this.nx) + 0.5) * this.cell;
  }

  nodePosition(i, out) {
    return out.set(this.nodeX(i), this.y[i], this.nodeZ(i));
  }

  _headroom(x, fy, z) {
    const c = this.cfg;
    // Something above within reach (a chair seat, a table top, a low beam's top)...
    _o.set(x, fy + c.clearance, z);
    if (this.world.raycast(_o, DOWN, c.clearance - 0.05, this._hit)) return false;
    // ...or a ceiling (its underside faces down).
    _o.set(x, fy + 0.05, z);
    return !this.world.raycast(_o, UP, c.clearance - 0.05, this._hit);
  }

  _nodeInColumn(ix, iz, y) {
    if (ix < 0 || iz < 0 || ix >= this.nx || iz >= this.nz) return -1;
    const col = iz * this.nx + ix;
    let best = -1;
    let bestDy = this.cfg.stepHeight;
    for (let j = this.colStart[col]; j < this.colStart[col + 1]; j++) {
      const dy = Math.abs(this.y[j] - y);
      if (dy <= bestDy) {
        bestDy = dy;
        best = j;
      }
    }
    return best;
  }

  _clearBetween(ax, ay, az, bx, by, bz) {
    const c = this.cfg;
    const base = Math.max(ay, by);
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz);
    _d.set(dx / len, 0, dz / len);
    for (const h of [c.kneeHeight, c.chestHeight]) {
      // Both directions: obstacles are closed boxes and rays ignore back faces.
      _o.set(ax, base + h, az);
      if (this.world.raycast(_o, _d, len, this._hit)) return false;
      _o.set(bx, base + h, bz);
      _d.negate();
      const blocked = this.world.raycast(_o, _d, len, this._hit);
      _d.negate();
      if (blocked) return false;
    }
    return true;
  }

  _connect(i, dirIndex) {
    const [dx, dz] = DIRS[dirIndex];
    const col = this.col[i];
    const ix = col % this.nx;
    const iz = Math.floor(col / this.nx);
    const j = this._nodeInColumn(ix + dx, iz + dz, this.y[i]);
    if (j < 0) return;
    if (!this._clearBetween(this.nodeX(i), this.y[i], this.nodeZ(i), this.nodeX(j), this.y[j], this.nodeZ(j))) return;
    this.neighbors[i * 8 + dirIndex] = j;
    this.neighbors[j * 8 + ((dirIndex + 4) % 8)] = i;
  }

  _connectDiagonal(i, dirIndex) {
    // Diagonal only if both orthogonal routes around the corner are open.
    const a = this.neighbors[i * 8 + ((dirIndex + 7) % 8)];
    const b = this.neighbors[i * 8 + ((dirIndex + 1) % 8)];
    if (a < 0 || b < 0) return;
    const j1 = this.neighbors[a * 8 + ((dirIndex + 1) % 8)];
    const j2 = this.neighbors[b * 8 + ((dirIndex + 7) % 8)];
    if (j1 < 0 || j1 !== j2) return;
    this.neighbors[i * 8 + dirIndex] = j1;
    this.neighbors[j1 * 8 + ((dirIndex + 4) % 8)] = i;
  }

  _keepLargestRegion() {
    const n = this.nodeCount;
    const region = new Int32Array(n).fill(-1);
    const stack = [];
    let best = -1;
    let bestSize = 0;
    let r = 0;
    for (let s = 0; s < n; s++) {
      if (region[s] >= 0) continue;
      let size = 0;
      stack.push(s);
      region[s] = r;
      while (stack.length) {
        const i = stack.pop();
        size++;
        for (let k = 0; k < 8; k++) {
          const j = this.neighbors[i * 8 + k];
          if (j >= 0 && region[j] < 0) {
            region[j] = r;
            stack.push(j);
          }
        }
      }
      if (size > bestSize) {
        bestSize = size;
        best = r;
      }
      r++;
    }
    this.active = new Uint8Array(n);
    for (let i = 0; i < n; i++) this.active[i] = region[i] === best ? 1 : 0;
    this.activeCount = bestSize;
  }

  /** Nearest active node to a world position (searches the column and nearby cells). */
  nearestNode(x, y, z, searchCells = 4) {
    const ix0 = Math.floor((x - this.minX) / this.cell);
    const iz0 = Math.floor((z - this.minZ) / this.cell);
    let best = -1;
    let bestD = Infinity;
    for (let r = 0; r <= searchCells; r++) {
      for (let iz = iz0 - r; iz <= iz0 + r; iz++) {
        for (let ix = ix0 - r; ix <= ix0 + r; ix++) {
          if (Math.max(Math.abs(ix - ix0), Math.abs(iz - iz0)) !== r) continue;
          if (ix < 0 || iz < 0 || ix >= this.nx || iz >= this.nz) continue;
          const col = iz * this.nx + ix;
          for (let j = this.colStart[col]; j < this.colStart[col + 1]; j++) {
            if (!this.active[j]) continue;
            const dy = Math.abs(this.y[j] - y);
            if (dy > 1.5) continue;
            const d = Math.hypot(this.nodeX(j) - x, this.nodeZ(j) - z) + dy * 2;
            if (d < bestD) {
              bestD = d;
              best = j;
            }
          }
        }
      }
      if (best >= 0 && r >= 1) break;
    }
    return best;
  }

  /**
   * A* from world position `from` to `to`. Returns an array of Vector3 waypoints
   * (smoothed), or null when unreachable.
   */
  findPath(from, to, maxNodes = 250000) {
    const s = this.nearestNode(from.x, from.y, from.z);
    const t = this.nearestNode(to.x, to.y, to.z);
    if (s < 0 || t < 0) return null;
    const nodes = this._astar(s, t, maxNodes);
    if (!nodes) return null;
    return this._smooth(nodes);
  }

  _astar(s, t, maxNodes) {
    const stamp = ++this._stamp;
    const open = this._open;
    open.clear();
    const tx = this.nodeX(t);
    const tz = this.nodeZ(t);
    const h = (i) => {
      const dx = Math.abs(this.nodeX(i) - tx);
      const dz = Math.abs(this.nodeZ(i) - tz);
      return Math.max(dx, dz) + (SQRT2 - 1) * Math.min(dx, dz);
    };
    this._seen[s] = stamp;
    this._g[s] = 0;
    this._from[s] = -1;
    open.push(s, h(s));
    let expanded = 0;
    while (open.size > 0) {
      const i = open.pop();
      if (i === t) break;
      if (++expanded > maxNodes) return null;
      for (let k = 0; k < 8; k++) {
        const j = this.neighbors[i * 8 + k];
        if (j < 0 || !this.active[j]) continue;
        const step = (k % 2 ? SQRT2 : 1) * this.cell * (1 + this.wallPenalty[j] * 0.5) + Math.abs(this.y[j] - this.y[i]);
        const g = this._g[i] + step;
        if (this._seen[j] === stamp && g >= this._g[j]) continue;
        this._seen[j] = stamp;
        this._g[j] = g;
        this._from[j] = i;
        open.push(j, g + h(j));
      }
    }
    if (this._seen[t] !== stamp) return null;
    const nodes = [];
    for (let i = t; i >= 0; i = this._from[i]) nodes.push(i);
    return nodes.reverse();
  }

  /** Walkable straight line between two nodes (the grid is connected along it)? */
  walkable(a, b) {
    const ax = this.nodeX(a);
    const az = this.nodeZ(a);
    const bx = this.nodeX(b);
    const bz = this.nodeZ(b);
    const len = Math.hypot(bx - ax, bz - az);
    const steps = Math.ceil(len / (this.cell * 0.5));
    let cur = a;
    for (let k = 1; k <= steps; k++) {
      const f = k / steps;
      const x = ax + (bx - ax) * f;
      const z = az + (bz - az) * f;
      const ix = Math.floor((x - this.minX) / this.cell);
      const iz = Math.floor((z - this.minZ) / this.cell);
      const col = cur >= 0 ? this.col[cur] : -1;
      if (iz * this.nx + ix === col) continue;
      // Step into the next cell only through an existing connection (and away from walls).
      let next = -1;
      for (let d = 0; d < 8; d++) {
        const j = this.neighbors[cur * 8 + d];
        if (j >= 0 && this.col[j] === iz * this.nx + ix) next = j;
      }
      if (next < 0 || this.wallPenalty[next] > 0) return false;
      cur = next;
    }
    return true;
  }

  _smooth(nodes) {
    const out = [];
    let anchor = 0;
    out.push(this.nodePosition(nodes[0], new Vector3()));
    while (anchor < nodes.length - 1) {
      let far = anchor + 1;
      for (let k = nodes.length - 1; k > anchor + 1; k--) {
        if (this.walkable(nodes[anchor], nodes[k])) {
          far = k;
          break;
        }
      }
      out.push(this.nodePosition(nodes[far], new Vector3()));
      anchor = far;
    }
    return out;
  }

  /** Random active node, optionally filtered. */
  randomNode(rand = Math.random, filter = null, tries = 400) {
    for (let t = 0; t < tries; t++) {
      const i = Math.floor(rand() * this.nodeCount);
      if (this.active[i] && (!filter || filter(i))) return i;
    }
    return -1;
  }
}

/** Min-heap of node indices keyed by float priority. */
class BinaryHeap {
  constructor(capacity) {
    this.items = new Int32Array(capacity + 1);
    this.keys = new Float32Array(capacity + 1);
    this.size = 0;
  }

  clear() {
    this.size = 0;
  }

  push(item, key) {
    if (this.size >= this.items.length) return;
    let i = this.size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p] <= key) break;
      this.items[i] = this.items[p];
      this.keys[i] = this.keys[p];
      i = p;
    }
    this.items[i] = item;
    this.keys[i] = key;
  }

  pop() {
    const top = this.items[0];
    const lastItem = this.items[--this.size];
    const lastKey = this.keys[this.size];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= this.size) break;
      if (c + 1 < this.size && this.keys[c + 1] < this.keys[c]) c++;
      if (this.keys[c] >= lastKey) break;
      this.items[i] = this.items[c];
      this.keys[i] = this.keys[c];
      i = c;
    }
    this.items[i] = lastItem;
    this.keys[i] = lastKey;
    return top;
  }
}
