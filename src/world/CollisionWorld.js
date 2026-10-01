import { Ray, Triangle, Vector3 } from 'three';
import { capsuleTriangleContact } from './capsuleContact.js';

const PAD = 1e-3; // triangle bounds padding so faces lying exactly on cell borders are never lost

const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();
const _hit = new Vector3();

/**
 * Static collision geometry: every triangle of the collider meshes, bucketed in a
 * uniform grid over the XZ plane. Our levels are wide and fairly flat (a plaza),
 * which suits a 2D grid well, and it is robust for axis-aligned greybox geometry.
 *
 * All queries reuse internal buffers and never allocate.
 */
export class CollisionWorld {
  constructor({ cellSize = 2 } = {}) {
    this.cellSize = cellSize;
    this.triangles = [];
    this.normals = [];
    this.bounds = new Float64Array(0); // per triangle: minX, minY, minZ, maxX, maxY, maxZ
    this.cells = [];
    this.nx = 0;
    this.nz = 0;
    this.originX = 0;
    this.originZ = 0;

    this._stamps = new Uint32Array(0);
    this._stamp = 0;
    this._near = [];
    this._ray = new Ray();
    this.contact = { normal: new Vector3(), point: new Vector3(), depth: 0 };
  }

  /**
   * Collects all meshes under the given root(s), with their world transforms, and
   * builds the grid. Meshes with `userData.noCollision` are skipped.
   */
  build(roots) {
    const tris = [];
    this._surfaceOf = [];
    for (const root of Array.isArray(roots) ? roots : [roots]) this._collect(root, tris);
    this._index(tris);
    // Surface per triangle (mesh.userData.surface, e.g. 'wood'; default 'stone'): what a
    // ray hit is made of (footsteps). 0 = stone.
    this.surfaceNames = ['stone', ...new Set(this._surfaceOf.filter(Boolean))];
    this.surfaces = Uint8Array.from(this._surfaceOf, (s) => (s ? this.surfaceNames.indexOf(s) : 0));
    this._surfaceOf = null;
    return this;
  }

  _collect(root, tris) {
    root.updateWorldMatrix(true, true);
    root.traverse((obj) => {
      if (!obj.isMesh || obj.userData.noCollision) return;
      const geo = obj.geometry;
      const pos = geo.getAttribute('position');
      const index = geo.getIndex();
      const count = index ? index.count : pos.count;
      for (let i = 0; i < count; i += 3) {
        const ia = index ? index.getX(i) : i;
        const ib = index ? index.getX(i + 1) : i + 1;
        const ic = index ? index.getX(i + 2) : i + 2;
        _a.fromBufferAttribute(pos, ia).applyMatrix4(obj.matrixWorld);
        _b.fromBufferAttribute(pos, ib).applyMatrix4(obj.matrixWorld);
        _c.fromBufferAttribute(pos, ic).applyMatrix4(obj.matrixWorld);
        const tri = new Triangle(_a.clone(), _b.clone(), _c.clone());
        if (tri.getArea() > 1e-8) {
          tris.push(tri);
          this._surfaceOf.push(obj.userData.surface ?? null);
        }
      }
    });
  }

  _index(tris) {
    const n = tris.length;
    this.triangles = tris;
    this.normals = tris.map((t) => t.getNormal(new Vector3()));
    this.bounds = new Float64Array(n * 6);
    this._stamps = new Uint32Array(n);

    let minX = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < n; i++) {
      const { a, b, c } = tris[i];
      const o = i * 6;
      this.bounds[o] = Math.min(a.x, b.x, c.x) - PAD;
      this.bounds[o + 1] = Math.min(a.y, b.y, c.y) - PAD;
      this.bounds[o + 2] = Math.min(a.z, b.z, c.z) - PAD;
      this.bounds[o + 3] = Math.max(a.x, b.x, c.x) + PAD;
      this.bounds[o + 4] = Math.max(a.y, b.y, c.y) + PAD;
      this.bounds[o + 5] = Math.max(a.z, b.z, c.z) + PAD;
      minX = Math.min(minX, this.bounds[o]);
      minZ = Math.min(minZ, this.bounds[o + 2]);
      maxX = Math.max(maxX, this.bounds[o + 3]);
      maxZ = Math.max(maxZ, this.bounds[o + 5]);
    }
    if (n === 0) minX = minZ = maxX = maxZ = 0;

    const s = this.cellSize;
    this.originX = minX;
    this.originZ = minZ;
    this.nx = Math.max(1, Math.ceil((maxX - minX) / s));
    this.nz = Math.max(1, Math.ceil((maxZ - minZ) / s));
    this.cells = Array.from({ length: this.nx * this.nz }, () => []);

    for (let i = 0; i < n; i++) {
      const o = i * 6;
      const x0 = this._cellX(this.bounds[o]);
      const x1 = this._cellX(this.bounds[o + 3]);
      const z0 = this._cellZ(this.bounds[o + 2]);
      const z1 = this._cellZ(this.bounds[o + 5]);
      for (let cz = z0; cz <= z1; cz++) {
        for (let cx = x0; cx <= x1; cx++) this.cells[cz * this.nx + cx].push(i);
      }
    }
  }

  _cellX(x) {
    return Math.min(this.nx - 1, Math.max(0, Math.floor((x - this.originX) / this.cellSize)));
  }

  _cellZ(z) {
    return Math.min(this.nz - 1, Math.max(0, Math.floor((z - this.originZ) / this.cellSize)));
  }

  _nextStamp() {
    this._stamp = (this._stamp + 1) >>> 0;
    if (this._stamp === 0) {
      this._stamps.fill(0);
      this._stamp = 1;
    }
    return this._stamp;
  }

  /**
   * Triangles whose bounds overlap the capsule's bounds.
   * Returns an internal array that is reused by the next call.
   */
  trianglesNear(capsule) {
    const out = this._near;
    out.length = 0;
    const r = capsule.radius;
    const s = capsule.start;
    const e = capsule.end;
    const minX = Math.min(s.x, e.x) - r;
    const minY = Math.min(s.y, e.y) - r;
    const minZ = Math.min(s.z, e.z) - r;
    const maxX = Math.max(s.x, e.x) + r;
    const maxY = Math.max(s.y, e.y) + r;
    const maxZ = Math.max(s.z, e.z) + r;
    if (maxX < this.originX || maxZ < this.originZ) return out;
    if (minX > this.originX + this.nx * this.cellSize || minZ > this.originZ + this.nz * this.cellSize) return out;

    const stamp = this._nextStamp();
    const b = this.bounds;
    const x0 = this._cellX(minX);
    const x1 = this._cellX(maxX);
    const z0 = this._cellZ(minZ);
    const z1 = this._cellZ(maxZ);
    for (let cz = z0; cz <= z1; cz++) {
      for (let cx = x0; cx <= x1; cx++) {
        const cell = this.cells[cz * this.nx + cx];
        for (let k = 0; k < cell.length; k++) {
          const i = cell[k];
          if (this._stamps[i] === stamp) continue;
          this._stamps[i] = stamp;
          const o = i * 6;
          if (b[o] > maxX || b[o + 3] < minX || b[o + 1] > maxY || b[o + 4] < minY || b[o + 2] > maxZ || b[o + 5] < minZ) {
            continue;
          }
          out.push(this.triangles[i]);
        }
      }
    }
    return out;
  }

  /**
   * Penetration test of a capsule against one triangle. On a hit, the shared
   * `this.contact` object is filled and returned (valid until the next call).
   */
  capsuleContact(capsule, tri) {
    return capsuleTriangleContact(capsule, tri, this.contact) ? this.contact : null;
  }

  /**
   * Nearest front-facing triangle hit along a ray (direction must be normalized),
   * up to `maxDistance`. Walks the grid cells the ray crosses (2D DDA).
   * Fills `out` ({ point, normal, distance }) and returns it, or null on a miss.
   */
  raycast(origin, direction, maxDistance, out) {
    if (this.triangles.length === 0) return null;
    const ray = this._ray;
    ray.origin.copy(origin);
    ray.direction.copy(direction);
    const stamp = this._nextStamp();
    const s = this.cellSize;

    let best = maxDistance;
    let bestIndex = -1;

    // Clip the ray's XZ path to the grid, then step through cells in order.
    const dx = direction.x;
    const dz = direction.z;
    const gx0 = this.originX;
    const gz0 = this.originZ;
    const gx1 = gx0 + this.nx * s;
    const gz1 = gz0 + this.nz * s;
    let tEnter = 0;
    let tExit = maxDistance;
    if (Math.abs(dx) < 1e-12) {
      if (origin.x < gx0 || origin.x > gx1) return null;
    } else {
      const t0 = (gx0 - origin.x) / dx;
      const t1 = (gx1 - origin.x) / dx;
      tEnter = Math.max(tEnter, Math.min(t0, t1));
      tExit = Math.min(tExit, Math.max(t0, t1));
    }
    if (Math.abs(dz) < 1e-12) {
      if (origin.z < gz0 || origin.z > gz1) return null;
    } else {
      const t0 = (gz0 - origin.z) / dz;
      const t1 = (gz1 - origin.z) / dz;
      tEnter = Math.max(tEnter, Math.min(t0, t1));
      tExit = Math.min(tExit, Math.max(t0, t1));
    }
    if (tEnter > tExit) return null;

    const px = origin.x + dx * tEnter;
    const pz = origin.z + dz * tEnter;
    let cx = this._cellX(px);
    let cz = this._cellZ(pz);
    const stepX = dx > 0 ? 1 : -1;
    const stepZ = dz > 0 ? 1 : -1;
    const tDeltaX = Math.abs(dx) > 1e-12 ? s / Math.abs(dx) : Infinity;
    const tDeltaZ = Math.abs(dz) > 1e-12 ? s / Math.abs(dz) : Infinity;
    let tMaxX = Math.abs(dx) > 1e-12 ? (gx0 + (cx + (dx > 0 ? 1 : 0)) * s - origin.x) / dx : Infinity;
    let tMaxZ = Math.abs(dz) > 1e-12 ? (gz0 + (cz + (dz > 0 ? 1 : 0)) * s - origin.z) / dz : Infinity;

    for (;;) {
      const cell = this.cells[cz * this.nx + cx];
      for (let k = 0; k < cell.length; k++) {
        const i = cell[k];
        if (this._stamps[i] === stamp) continue;
        this._stamps[i] = stamp;
        const tri = this.triangles[i];
        if (ray.intersectTriangle(tri.a, tri.b, tri.c, true, _hit) === null) continue;
        const d = _hit.distanceTo(origin);
        if (d <= best) {
          best = d;
          bestIndex = i;
          out.point.copy(_hit);
        }
      }
      // Done once the best hit is closer than where the ray leaves this cell.
      const tCellExit = Math.min(tMaxX, tMaxZ);
      if (best <= tCellExit || tCellExit > tExit) break;
      if (tMaxX < tMaxZ) {
        cx += stepX;
        tMaxX += tDeltaX;
      } else {
        cz += stepZ;
        tMaxZ += tDeltaZ;
      }
      if (cx < 0 || cz < 0 || cx >= this.nx || cz >= this.nz) break;
    }

    if (bestIndex < 0) return null;
    out.normal.copy(this.normals[bestIndex]);
    out.distance = best;
    out.surface = this.surfaces ? this.surfaceNames[this.surfaces[bestIndex]] : 'stone';
    return out;
  }
}
