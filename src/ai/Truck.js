import { Vector3 } from 'three';

const _to = new Vector3();
const _dir = new Vector3();
const _o = new Vector3();
const _d = new Vector3();
const _right = new Vector3();
const _up = new Vector3();
const UP = new Vector3(0, 1, 0);
const DOWN = new Vector3(0, -1, 0);

function wrapAngle(a) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

function rangeRand(rand, [lo, hi]) {
  return lo + (hi - lo) * rand();
}

// Truck body in its own frame (origin on the ground at the center, forward = -Z):
// the body/bed box plus the cab on top of the front.
const HALF_W = 1.0;
const HALF_L = 2.6;
const BOXES = [
  { x0: -HALF_W, x1: HALF_W, y0: 0.3, y1: 1.55, z0: -HALF_L, z1: HALF_L },
  { x0: -0.95, x1: 0.95, y0: 1.55, y1: 2.1, z0: -HALF_L, z1: -0.9 },
];
export const TRUCK_GUN = { x: 0, y: 2.35, z: 0.9 }; // pintle mount on the bed

/**
 * An armed pickup (pure logic): drives in along a path, then parks; a mounted machine
 * gun traverses toward its target and fires long bursts, and keeps hosing the spot
 * where you ducked for a few seconds (pinning you down). Bullets barely hurt it.
 * It plugs into EnemyManager like an Enemy (faction, target, raycast, takeHit/Damage).
 */
export class Truck {
  /**
   * @param {{ world, config, path: Vector3[], rand?: () => number, onFire?: (shot) => void }} deps
   *   config: DIFFICULTY.truck
   */
  constructor({ world, config, path, rand = Math.random, onFire = null }) {
    this.world = world;
    this.tcfg = config;
    this.g = config.gun;
    // What EnemyManager / DebugDraw read from an agent.
    this.cfg = { visionRange: config.gun.range, health: config.health };
    this.isVehicle = true;
    this.faction = 'hostile';
    this.state = 'combat';
    this.mode = 'vehicle';
    this.rand = rand;
    this.onFire = onFire;
    /** () => void, set by EnemyManager */
    this.onDestroyed = null;

    this.path = path.map((p) => p.clone());
    this.pathIndex = 1;
    this.position = this.path[0].clone();
    this.facing = Math.atan2(-(this.path[1].x - this.position.x), -(this.path[1].z - this.position.z));
    this.turretYaw = this.facing;
    this.driving = true;
    this.speed = 0;
    this.health = config.health;
    this.time = 0;
    this.deadTime = 0;

    this.target = null;
    this.canSeePlayer = false;
    this.lastKnown = new Vector3();
    this.hasLastKnown = false;
    this.sinceSeen = Infinity;
    this.reaction = config.gun.reactionTime;
    this.burstLeft = 0;
    this.fireCooldown = 1;
    this.shotsFired = 0;
    this.lastShotTime = -Infinity;
    this._losTimer = 0;
    this._hit = { point: new Vector3(), normal: new Vector3(), distance: 0 };

    this.eye = new Vector3(); // the gun (LOS checks start here)
    this.muzzle = new Vector3();
    const self = this;
    this.asTarget = {
      agent: this,
      position: this.position,
      head: new Vector3(),
      chest: new Vector3(),
      zone: 'vehicle',
      crouched: false,
      get alive() {
        return self.alive;
      },
      get speed() {
        return self.speed;
      },
      get firing() {
        return self.time - self.lastShotTime < 0.3;
      },
      hitTest(origin, dir, maxDist) {
        const h = self.raycast(origin, dir, maxDist);
        return h ? h.distance : -1;
      },
    };
    this._ground();
    this._updatePoints();
  }

  get alive() {
    return this.state !== 'dead';
  }

  get crouched() {
    return false;
  }

  get moving() {
    return this.driving;
  }

  hearGunshot() {}

  setTarget(t) {
    if (t === this.target) return;
    this.target = t;
    this.reaction = Math.max(this.reaction, this.g.reactionTime * 0.5);
  }

  engage(pos) {
    this.lastKnown.copy(pos);
    this.hasLastKnown = true;
  }

  /** Local (truck frame) -> world, into out. */
  _toWorld(lx, ly, lz, out) {
    const c = Math.cos(this.facing);
    const s = Math.sin(this.facing);
    return out.set(this.position.x + lx * c + lz * s, this.position.y + ly, this.position.z - lx * s + lz * c);
  }

  _updatePoints() {
    this._toWorld(TRUCK_GUN.x, TRUCK_GUN.y, TRUCK_GUN.z, this.eye);
    this.muzzle.set(this.eye.x - Math.sin(this.turretYaw) * 0.9, this.eye.y, this.eye.z - Math.cos(this.turretYaw) * 0.9);
    this._toWorld(0, 1.2, 0, this.asTarget.chest);
    this.asTarget.head.copy(this.eye);
  }

  _ground() {
    const h = this.world.raycast(_o.set(this.position.x, this.position.y + 3, this.position.z), DOWN, 8, this._hit);
    if (h) this.position.y = h.point.y;
  }

  update(dt, player) {
    this.time += dt;
    if (!this.alive) {
      this.deadTime += dt;
      this.speed = 0;
      return;
    }
    if (this.driving) this._drive(dt);
    const t = this.target && this.target.alive ? this.target : player;
    this._gun(dt, t);
    this._updatePoints();
  }

  _drive(dt) {
    const wp = this.path[this.pathIndex];
    const dx = wp.x - this.position.x;
    const dz = wp.z - this.position.z;
    const d = Math.hypot(dx, dz);
    const last = this.pathIndex === this.path.length - 1;
    // Slow down into the last waypoint and stop.
    const want = last ? Math.min(this.tcfg.speed, d * 1.2) : this.tcfg.speed;
    this.speed += Math.max(-8 * dt, Math.min(6 * dt, want - this.speed));
    if (d < (last ? 0.3 : 2.5)) {
      if (last) {
        this.driving = false;
        this.speed = 0;
        return;
      }
      this.pathIndex++;
      return;
    }
    const yaw = Math.atan2(-dx, -dz);
    this.facing = wrapAngle(this.facing + Math.max(-1.2 * dt, Math.min(1.2 * dt, wrapAngle(yaw - this.facing))));
    const step = Math.min(d, this.speed * dt);
    this.position.x -= Math.sin(this.facing) * step;
    this.position.z -= Math.cos(this.facing) * step;
    this._ground();
  }

  _los(p) {
    _to.subVectors(p, this.eye);
    const len = _to.length();
    _dir.copy(_to).divideScalar(len);
    return this.world.raycast(this.eye, _dir, len - 0.1, this._hit) === null;
  }

  _gun(dt, t) {
    const g = this.g;
    this._losTimer -= dt;
    if (this._losTimer <= 0) {
      this._losTimer = 0.15;
      this.canSeePlayer = !!t && t.alive && this.eye.distanceTo(t.chest) < g.range && (this._los(t.chest) || this._los(t.head));
    }
    if (this.canSeePlayer) {
      this.lastKnown.copy(t.position);
      this.hasLastKnown = true;
      this.sinceSeen = 0;
      this.reaction = Math.max(0, this.reaction - dt);
    } else {
      this.sinceSeen += dt;
      if (this.sinceSeen > 0.5) this.reaction = Math.max(this.reaction, g.reactionTime * 0.6);
    }
    // Traverse toward the target (or where it was).
    const aimAt = this.canSeePlayer ? t.chest : this.hasLastKnown ? _o.set(this.lastKnown.x, this.lastKnown.y + 1.1, this.lastKnown.z) : null;
    if (!aimAt) return;
    const yaw = Math.atan2(-(aimAt.x - this.eye.x), -(aimAt.z - this.eye.z));
    const err = wrapAngle(yaw - this.turretYaw);
    this.turretYaw = wrapAngle(this.turretYaw + Math.max(-g.turnRate * dt, Math.min(g.turnRate * dt, err)));

    this.fireCooldown -= dt;
    const suppressing = !this.canSeePlayer && this.sinceSeen < g.suppressTime;
    if (Math.abs(err) > 0.12 || this.fireCooldown > 0) return;
    if (!this.canSeePlayer && !suppressing) return;
    if (this.canSeePlayer && this.reaction > 0) return;
    if (this.burstLeft <= 0) {
      this.burstLeft = Math.round(rangeRand(this.rand, g.burst));
      this.fireCooldown = rangeRand(this.rand, g.burstPause);
      return;
    }
    this._fire(aimAt, t, suppressing ? g.spread * 1.8 : g.spread);
    this.burstLeft--;
    this.fireCooldown = this.burstLeft > 0 ? g.fireInterval : rangeRand(this.rand, g.burstPause);
  }

  _fire(aim, t, spread) {
    const g = this.g;
    _dir.subVectors(aim, this.muzzle).normalize();
    const r = spread * Math.sqrt(this.rand());
    const a = this.rand() * Math.PI * 2;
    _right.crossVectors(_dir, UP).normalize();
    _up.crossVectors(_right, _dir);
    _dir.addScaledVector(_right, Math.cos(a) * r).addScaledVector(_up, Math.sin(a) * r).normalize();
    const wallHit = this.world.raycast(this.muzzle, _dir, g.range, this._hit);
    const wallDist = wallHit ? wallHit.distance : g.range;
    const tHit = t.hitTest(this.muzzle, _dir, wallDist);
    const hitTarget = tHit >= 0;
    const dist = hitTarget ? tHit : wallDist;
    this.shotsFired++;
    this.lastShotTime = this.time;
    if (!this.onFire) return;
    this.onFire({
      origin: this.muzzle.clone(),
      dir: _dir.clone(),
      distance: dist,
      hitPlayer: hitTarget,
      hitWorld: !hitTarget && wallHit !== null,
      point: this.muzzle.clone().addScaledVector(_dir, dist),
      normal: wallHit && !hitTarget ? wallHit.normal.clone() : null,
      damage: hitTarget ? g.damage : 0,
      shooter: this,
      target: t,
      zone: hitTarget ? t.zone ?? 'body' : null,
    });
  }

  // ---------------------------------------------------------------------------
  // Damage

  /** Ray vs the truck's boxes: { distance, zone: 'vehicle' } or null. */
  raycast(origin, dir, maxDist) {
    // Into the truck frame.
    const c = Math.cos(this.facing);
    const s = Math.sin(this.facing);
    const ox = origin.x - this.position.x;
    const oz = origin.z - this.position.z;
    const lo = _o.set(ox * c - oz * s, origin.y - this.position.y, ox * s + oz * c);
    const ld = _d.set(dir.x * c - dir.z * s, dir.y, dir.x * s + dir.z * c);
    let best = Infinity;
    for (const b of BOXES) {
      let t0 = 0;
      let t1 = maxDist;
      let ok = true;
      for (const [o, d, lo0, hi0] of [
        [lo.x, ld.x, b.x0, b.x1],
        [lo.y, ld.y, b.y0, b.y1],
        [lo.z, ld.z, b.z0, b.z1],
      ]) {
        if (Math.abs(d) < 1e-9) {
          if (o < lo0 || o > hi0) {
            ok = false;
            break;
          }
          continue;
        }
        let a = (lo0 - o) / d;
        let bb = (hi0 - o) / d;
        if (a > bb) [a, bb] = [bb, a];
        t0 = Math.max(t0, a);
        t1 = Math.min(t1, bb);
        if (t0 > t1) {
          ok = false;
          break;
        }
      }
      if (ok && t0 < best) best = t0;
    }
    return best <= maxDist ? { distance: best, zone: 'vehicle' } : null;
  }

  takeHit(zone, dir, attacker) {
    return this.takeDamage(this.tcfg.bulletDamage, dir, attacker);
  }

  takeDamage(amount, dir, attacker = null) {
    if (!this.alive) return false;
    this.health -= amount;
    // The gunner swings toward whoever is shooting at him.
    if (attacker && attacker.hitTest && attacker !== this.target && this.rand() < 0.3) this.setTarget(attacker);
    if (this.health > 0) return false;
    this.health = 0;
    this.state = 'dead';
    this.driving = false;
    if (this.onDestroyed) this.onDestroyed(this);
    return true;
  }

  /** Keep a body (feet position, radius) out of the truck's footprint. */
  pushOut(pos, radius) {
    if (Math.abs(pos.y - this.position.y) > 2) return;
    const c = Math.cos(this.facing);
    const s = Math.sin(this.facing);
    const dx = pos.x - this.position.x;
    const dz = pos.z - this.position.z;
    const lx = dx * c - dz * s;
    const lz = dx * s + dz * c;
    const hx = HALF_W + radius;
    const hz = HALF_L + radius;
    if (Math.abs(lx) >= hx || Math.abs(lz) >= hz) return;
    let nx = lx;
    let nz = lz;
    if (hx - Math.abs(lx) < hz - Math.abs(lz)) nx = Math.sign(lx || 1) * hx;
    else nz = Math.sign(lz || 1) * hz;
    pos.x = this.position.x + nx * c + nz * s;
    pos.z = this.position.z - nx * s + nz * c;
  }
}
