import { Vector3 } from 'three';

const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const _o = new Vector3();
const _d = new Vector3();
const _t = new Vector3();

export const COVER = {
  crouchChest: 0.75, // an obstacle here hides a crouched body (concrete blocks are 0.85 m)
  standHead: 1.55, // clear here = low cover you can peek over by standing
  probe: 0.9, // how close the obstacle must be
  standoff: 0.45, // stand this far from it
  peekStep: 0.8, // sidestep to peek around high cover
  spacing: 1.5, // thin out points closer than this (per direction)
};

/**
 * Cover points generated automatically from the level: walkable nav nodes with an
 * obstacle right next to them at crouched-chest height. Low cover (fences, barriers,
 * wash stations) is peeked over by standing up; high cover (bookcases, piers, pillars)
 * is peeked around the side, so it needs an open side to sidestep to.
 */
export class CoverPoints {
  constructor(world, nav, config = COVER) {
    this.world = world;
    this.nav = nav;
    this.cfg = config;
    /** @type {{ x: number, y: number, z: number, dx: number, dz: number, low: boolean,
     *   peekX: number, peekZ: number, owner: object | null }[]} */
    this.points = [];
    this._hit = { point: new Vector3(), normal: new Vector3(), distance: 0 };
  }

  generate() {
    const { nav, cfg } = this;
    const taken = new Set();
    for (let i = 0; i < nav.nodeCount; i++) {
      if (!nav.active[i]) continue;
      const x = nav.nodeX(i);
      const y = nav.y[i];
      const z = nav.nodeZ(i);
      for (const [dx, dz] of DIRS) {
        const lo = this._ray(x, y + cfg.crouchChest, z, dx, dz, cfg.probe);
        if (lo < 0) continue;
        const hi = this._ray(x, y + cfg.standHead, z, dx, dz, cfg.probe + 0.3);
        const low = hi < 0;
        let peekX = x;
        let peekZ = z;
        if (!low) {
          // Find an open side: sidestep perpendicular and look past the obstacle.
          let found = false;
          for (const s of [1, -1]) {
            const px = x - dz * s * cfg.peekStep;
            const pz = z + dx * s * cfg.peekStep;
            const n = nav.nearestNode(px, y, pz, 1);
            if (n < 0 || Math.abs(nav.y[n] - y) > 0.3) continue;
            if (this._ray(px, y + cfg.standHead, pz, dx, dz, cfg.probe + 1.0) >= 0) continue;
            peekX = px;
            peekZ = pz;
            found = true;
            break;
          }
          if (!found) continue; // a plain wall: you can hide but never shoot from it
        }
        const key = `${Math.round(x / cfg.spacing)},${Math.round(z / cfg.spacing)},${Math.round(y)},${dx},${dz}`;
        if (taken.has(key)) continue;
        taken.add(key);
        const back = lo - cfg.standoff;
        this.points.push({
          x: x + dx * back,
          y,
          z: z + dz * back,
          dx,
          dz,
          low,
          peekX: peekX + dx * back,
          peekZ: peekZ + dz * back,
          owner: null,
        });
      }
    }
    return this;
  }

  /** Distance to the first obstacle along a horizontal ray, or -1. */
  _ray(x, y, z, dx, dz, len) {
    _o.set(x, y, z);
    _d.set(dx, 0, dz);
    const hit = this.world.raycast(_o, _d, len, this._hit);
    return hit ? hit.distance : -1;
  }

  /**
   * Does the obstacle protect a crouched body at this point from a shooter at `from`?
   * (Faces the right way and something blocks the line at crouched-chest height.)
   */
  protects(p, from) {
    const tx = from.x - p.x;
    const tz = from.z - p.z;
    const dist = Math.hypot(tx, tz);
    if (dist < 1) return false;
    if ((tx * p.dx + tz * p.dz) / dist < 0.35) return false;
    _o.set(p.x, p.y + this.cfg.crouchChest, p.z);
    _t.set(from.x, from.y, from.z).sub(_o);
    const len = _t.length();
    _d.copy(_t).divideScalar(len);
    const hit = this.world.raycast(_o, _d, Math.min(len, 2.5), this._hit);
    return hit !== null;
  }

  /** Line of sight from the peek position (standing eye) to `target`. */
  canSee(p, target, eyeHeight) {
    _o.set(p.peekX, p.y + eyeHeight, p.peekZ);
    _t.copy(target).sub(_o);
    const len = _t.length();
    _d.copy(_t).divideScalar(len);
    return this.world.raycast(_o, _d, len - 0.3, this._hit) === null;
  }
}
