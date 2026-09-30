import { MathUtils, Vector3 } from 'three';
import { PLAYER } from '../player/config.js';
import { PlayerController } from '../player/PlayerController.js';
import { ENEMY } from './config.js';
import { raySphere, rayCapsule } from './hitZones.js';

const _to = new Vector3();
const _dir = new Vector3();
const _o = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
const _right = new Vector3();
const _up = new Vector3();
const UP = new Vector3(0, 1, 0);

function wrapAngle(a) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

function rangeRand(rand, [lo, hi]) {
  return lo + (hi - lo) * rand();
}

/**
 * One enemy soldier: perception (vision cone + line of sight, hearing), a small state
 * machine (idle -> alerted -> combat -> dead), cover use (move, hide, peek, relocate)
 * and hitscan shooting. Pure logic: the view (EnemyView) reads its fields to draw.
 *
 * The body moves with the same kinematic controller as the player, so it handles
 * stairs, slopes and collisions the same way.
 */
export class Enemy {
  /**
   * @param {{ world, nav, cover, rand?: () => number, onFire?: (shot) => void, config?: object }} deps
   * @param {Vector3} position feet
   * @param {number} yaw facing
   */
  constructor({ world, nav, cover, rand = Math.random, onFire = null, config = ENEMY }, position, yaw = 0) {
    this.cfg = config;
    this.world = world;
    this.nav = nav;
    this.cover = cover;
    this.rand = rand;
    this.onFire = onFire;

    this.body = new PlayerController(world, { ...PLAYER, walkSpeed: config.runSpeed, radius: config.radius });
    this.body.setSpawn(position, yaw);
    this.spawn = { position: position.clone(), yaw };

    this.state = 'idle';
    this.health = config.health;
    this.facing = yaw;
    this.baseYaw = yaw;
    this.time = 0;

    this.awareness = 0;
    this.canSeePlayer = false;
    this.lastKnown = new Vector3();
    this.hasLastKnown = false;
    this.sinceSeen = Infinity;
    this.losTime = 0; // continuous line of sight, tightens the aim
    this.reaction = 0; // time left before he may fire
    this.stateTime = 0;

    // Combat / cover
    this.coverPoint = null;
    this.mode = 'none'; // 'moving' | 'hiding' | 'peeking' | 'exposed'
    this.modeTimer = 0;
    this.relocateTimer = 0;
    this.path = null;
    this.pathIndex = 0;
    this.repathTimer = 0;
    this.moveTarget = new Vector3();
    this.moving = false;
    this.stuckTimer = 0;
    this.lastPos = position.clone();

    // Weapon
    this.burstLeft = 0;
    this.fireCooldown = 0;
    this.shotsFired = 0;

    // Death
    this.deathDir = new Vector3(0, 0, 1);
    this.lastHitZone = null;

    this._hit = { point: new Vector3(), normal: new Vector3(), distance: 0 };
    this._controls = { forward: 0, right: 0, jump: false, sprint: false, crouch: false, moveScale: 1 };
    this.eye = new Vector3();
    this.muzzle = new Vector3();
    this._updateEye();
  }

  get position() {
    return this.body.position;
  }

  get alive() {
    return this.state !== 'dead';
  }

  get crouched() {
    return this.body.crouched;
  }

  _updateEye() {
    const c = this.cfg;
    this.eye.copy(this.body.position);
    this.eye.y += this.crouched ? c.crouchEyeHeight : c.eyeHeight;
    // Muzzle: in front of the chest, slightly right.
    const s = Math.sin(this.facing);
    const co = Math.cos(this.facing);
    this.muzzle.copy(this.eye).add(_o.set(-s * 0.55 + co * 0.18, -0.2, -co * 0.55 - s * 0.18));
  }

  // ---------------------------------------------------------------------------
  // Damage

  /**
   * Ray test against this enemy's hit zones. Returns { distance, zone } or null.
   */
  raycast(origin, dir, maxDist) {
    if (!this.alive) return null;
    const c = this.cfg;
    const p = this.body.position;
    const headY = this.crouched ? c.crouchHeadHeight : c.headHeight;
    _a.set(p.x, p.y + headY, p.z);
    const th = raySphere(origin, dir, _a, c.headRadius, maxDist);
    const top = headY - c.headRadius - 0.04;
    _a.set(p.x, p.y + c.radius, p.z);
    _b.set(p.x, p.y + Math.max(top - c.radius, c.radius), p.z);
    const tb = rayCapsule(origin, dir, _a, _b, c.radius, maxDist);
    if (th >= 0 && (tb < 0 || th <= tb + 0.05)) return { distance: th, zone: 'head' };
    if (tb >= 0) return { distance: tb, zone: 'body' };
    return null;
  }

  /** Apply a hit. Returns true if it killed him. */
  takeHit(zone, dir, attacker) {
    if (!this.alive) return false;
    const c = this.cfg;
    this.health -= zone === 'head' ? c.headDamage : c.bodyDamage;
    this.lastHitZone = zone;
    if (attacker) this._notice(attacker, true);
    if (this.health <= 0) {
      this.health = 0;
      this.state = 'dead';
      this.deathDir.set(dir.x, 0, dir.z).normalize();
      if (this.coverPoint) this.coverPoint.owner = null;
      this.coverPoint = null;
      return true;
    }
    // Getting shot: go to combat and get out of the line of fire.
    if (this.state !== 'combat') this._enter('combat');
    else if (this.mode === 'peeking' || this.mode === 'exposed') this.relocateTimer = 0;
    return false;
  }

  // ---------------------------------------------------------------------------
  // Perception

  /** Player shots: heard within hearingRange. */
  hearGunshot(from) {
    if (!this.alive) return;
    const d = from.distanceTo(this.eye);
    if (d > this.cfg.hearingRange) return;
    // Rough position: the farther away, the less precise.
    const err = d * 0.08;
    const guess = _o.copy(from).add(_a.set((this.rand() - 0.5) * err, 0, (this.rand() - 0.5) * err));
    if (this.state === 'idle') {
      this.lastKnown.copy(guess);
      this.hasLastKnown = true;
      this.awareness = Math.max(this.awareness, 0.6);
      this._enter('alerted');
    } else if (this.state === 'alerted') {
      this.lastKnown.copy(guess);
      this.hasLastKnown = true;
      if (d < 20) this._enter('combat');
    }
  }

  _notice(player, instant = false) {
    this.lastKnown.copy(player.position);
    this.hasLastKnown = true;
    this.sinceSeen = 0;
    if (instant) this.awareness = 1;
  }

  /** Line of sight from his eye to a point (true = clear). */
  _los(target) {
    _to.subVectors(target, this.eye);
    const len = _to.length();
    if (len < 1e-3) return true;
    _dir.copy(_to).divideScalar(len);
    return this.world.raycast(this.eye, _dir, len - 0.05, this._hit) === null;
  }

  _perceive(dt, player) {
    const c = this.cfg;
    this.canSeePlayer = false;
    if (!player.alive) return;
    _to.subVectors(player.chest, this.eye);
    const dist = _to.length();
    if (dist > c.visionRange) return;
    const yawTo = Math.atan2(-_to.x, -_to.z);
    const off = Math.abs(wrapAngle(yawTo - this.facing));
    const inCone = off < c.visionFov / 2;
    const inPeriphery = !inCone && off < c.peripheralFov / 2;
    // In combat he tracks you all around; otherwise he needs you in his field of view.
    if (this.state !== 'combat' && !inCone && !inPeriphery) return;
    const visible = this._los(player.head) || this._los(player.chest);
    if (!visible) return;
    this.canSeePlayer = true;

    if (this.state === 'combat') {
      this._notice(player);
      this.awareness = 1;
      return;
    }
    let rate = c.awarenessRate * MathUtils.clamp(10 / Math.max(dist, 2), 0.25, 4);
    if (inPeriphery) rate *= 0.3;
    if (player.crouched) rate *= 0.6;
    if (player.speed > 3) rate *= 1.4;
    if (player.firing) rate *= 2.5;
    this.awareness = Math.min(1, this.awareness + rate * dt);
    if (this.awareness > 0.35) {
      this.lastKnown.copy(player.position);
      this.hasLastKnown = true;
      if (this.state === 'idle') this._enter('alerted');
    }
    if (this.awareness >= 1) {
      this._notice(player);
      this._enter('combat');
    }
  }

  // ---------------------------------------------------------------------------
  // States

  _enter(state) {
    if (this.state === state || this.state === 'dead') return;
    this.state = state;
    this.stateTime = 0;
    if (state === 'combat') {
      this.reaction = this.cfg.reactionTime * (0.85 + this.rand() * 0.3);
      this.relocateTimer = 0; // pick cover right away
      this.mode = 'exposed';
    }
    if (state === 'alerted') this.modeTimer = 0;
    if (state === 'idle') {
      this._stopMoving();
      this.body.wantCrouch = false;
      this.baseYaw = this.facing;
    }
  }

  /**
   * One fixed step.
   * @param {number} dt
   * @param {{ position: Vector3, head: Vector3, chest: Vector3, speed: number, crouched: boolean,
   *   firing: boolean, alive: boolean, hitTest: (origin: Vector3, dir: Vector3, maxDist: number) => number }} player
   * @param {Enemy[]} others
   */
  update(dt, player, others = []) {
    this.time += dt;
    this.stateTime += dt;
    if (!this.alive) return;

    this._perceive(dt, player);
    this.sinceSeen = this.canSeePlayer ? 0 : this.sinceSeen + dt;
    if (this.canSeePlayer) this.losTime += dt;
    else if (this.sinceSeen > 0.5) {
      this.losTime = 0;
      // Losing sight means reacting again when you reappear.
      if (this.state === 'combat') this.reaction = Math.max(this.reaction, this.cfg.reactionTime * 0.6);
    }
    this.reaction = Math.max(0, this.reaction - (this.canSeePlayer ? dt : 0));

    if (this.state === 'idle') this._idle(dt);
    else if (this.state === 'alerted') this._alerted(dt);
    else if (this.state === 'combat') this._combat(dt, player, others);

    this._move(dt);
    this._updateEye();
  }

  _idle(dt) {
    // Stand and look around slowly; awareness fades.
    if (!this.canSeePlayer) this.awareness = Math.max(0, this.awareness - this.cfg.awarenessDecay * dt);
    this._turnTo(this.baseYaw + Math.sin(this.time * 0.35) * 0.7, dt, 0.4);
  }

  _alerted(dt) {
    const c = this.cfg;
    if (!this.hasLastKnown) return this._enter('idle');
    this._turnTo(Math.atan2(-(this.lastKnown.x - this.position.x), -(this.lastKnown.z - this.position.z)), dt, 1);
    this.modeTimer += dt;
    // After a moment, go and have a look.
    if (this.modeTimer > 2.5 && !this.moving && this.position.distanceTo(this.lastKnown) > 3) {
      this._goTo(this.lastKnown, c.walkSpeed);
    }
    if (this.stateTime > c.alertedSearchTime && !this.canSeePlayer) {
      this.hasLastKnown = false;
      this.awareness = 0;
      this._enter('idle');
    }
  }

  _combat(dt, player, others) {
    const c = this.cfg;
    this.relocateTimer -= dt;
    this.modeTimer -= dt;
    if (this.sinceSeen > 14) {
      // Lost you: search where you were last seen.
      this._enter('alerted');
      return;
    }
    const threat = this.lastKnown;
    const distToThreat = this.position.distanceTo(threat);

    // (Re)pick cover when he has none, his cover is exposed/flanked, or you got too close.
    let needCover = this.coverPoint === null && this.relocateTimer <= 0;
    if (this.coverPoint && this.mode !== 'moving' && this.relocateTimer <= 0) {
      const flanked = !this.cover.protects(this.coverPoint, threat);
      if (flanked || distToThreat < c.closeRange) needCover = true;
    }
    if (needCover) {
      this.relocateTimer = c.relocateCooldown;
      this._takeCover(threat, others);
    }

    const cp = this.coverPoint;
    if (this.mode === 'moving') {
      this.body.wantCrouch = false;
      if (!this.moving) {
        this.mode = 'hiding';
        this.modeTimer = rangeRand(this.rand, c.hideTime) * 0.6;
      }
    } else if (this.mode === 'hiding' && cp) {
      // Low cover: crouch behind it. High cover: stand behind it, out of sight.
      this.body.wantCrouch = cp.low;
      if (this.modeTimer <= 0) {
        this.mode = 'peeking';
        this.modeTimer = rangeRand(this.rand, c.peekTime);
        if (!cp.low) this._goTo(_a.set(cp.peekX, cp.y, cp.peekZ), c.walkSpeed, true);
      }
    } else if (this.mode === 'peeking' && cp) {
      this.body.wantCrouch = false;
      if (this.modeTimer <= 0) {
        this.mode = 'hiding';
        this.modeTimer = rangeRand(this.rand, c.hideTime);
        this.burstLeft = 0;
        if (!cp.low) this._goTo(_a.set(cp.x, cp.y, cp.z), c.walkSpeed, true); // step back behind it
      }
    } else if (this.mode === 'exposed') {
      // No cover available: crouch where he is and fight, retry cover periodically.
      this.body.wantCrouch = this.canSeePlayer && distToThreat > 8;
    }

    // Face the threat (unless running somewhere else, then look where he goes).
    if (!this.moving || this.canSeePlayer) {
      this._turnTo(Math.atan2(-(threat.x - this.position.x), -(threat.z - this.position.z)), dt, 1);
    }

    const canShoot = this.mode === 'peeking' || this.mode === 'exposed' || (this.mode === 'moving' && distToThreat < 20);
    if (canShoot) this._shoot(dt, player);
  }

  _takeCover(threat, others) {
    const c = this.cfg;
    const pts = this.cover.points;
    let best = null;
    let bestScore = -Infinity;
    const pos = this.position;
    let evaluated = 0;
    for (let i = 0; i < pts.length && evaluated < 60; i++) {
      const p = pts[i];
      if (p.owner && p.owner !== this) continue;
      const d = Math.hypot(p.x - pos.x, p.z - pos.z);
      if (d > c.coverSearchRadius) continue;
      const dThreat = Math.hypot(p.x - threat.x, p.z - threat.z);
      if (dThreat < c.closeRange + 1) continue;
      if (Math.abs(p.y - pos.y) > 4) continue;
      // Cheap score first, expensive ray tests only for promising points.
      const [lo, hi] = c.preferredRange;
      let score = -d * 0.6 - (dThreat < lo ? (lo - dThreat) * 1.5 : dThreat > hi ? (dThreat - hi) * 0.5 : 0);
      if (p === this.coverPoint) score -= 4; // prefer moving somewhere new when relocating
      if (others.some((o) => o !== this && o.alive && Math.hypot(o.position.x - p.x, o.position.z - p.z) < 2)) continue;
      if (score <= bestScore) continue;
      evaluated++;
      if (!this.cover.protects(p, threat)) continue;
      _a.set(threat.x, threat.y + 1.3, threat.z);
      if (!this.cover.canSee(p, _a, c.eyeHeight)) score -= 6; // hides well but can't shoot back
      if (p.low) score += 1;
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    if (this.coverPoint && this.coverPoint !== best) this.coverPoint.owner = null;
    if (!best) {
      this.coverPoint = null;
      this.mode = 'exposed';
      return;
    }
    best.owner = this;
    this.coverPoint = best;
    this.mode = 'moving';
    this._goTo(_a.set(best.x, best.y, best.z), c.runSpeed);
    if (!this.path) {
      best.owner = null;
      this.coverPoint = null;
      this.mode = 'exposed';
    }
  }

  // ---------------------------------------------------------------------------
  // Shooting

  _shoot(dt, player) {
    const c = this.cfg;
    this.fireCooldown -= dt;
    if (!this.canSeePlayer || this.reaction > 0 || !player.alive) return;
    if (this.fireCooldown > 0) return;
    if (this.burstLeft <= 0) {
      this.burstLeft = Math.round(rangeRand(this.rand, c.burst));
      this.fireCooldown = rangeRand(this.rand, c.burstPause) * 0.5;
      return;
    }
    // Aim at the chest if visible, otherwise the head.
    const target = this._los(player.chest) ? player.chest : player.head;
    _dir.subVectors(target, this.muzzle).normalize();
    const f = MathUtils.clamp(this.losTime / c.spreadTightenTime, 0, 1);
    let spread = MathUtils.lerp(c.maxSpread, c.minSpread, f);
    if (this.moving) spread *= 1.6;
    const r = spread * Math.sqrt(this.rand());
    const a = this.rand() * Math.PI * 2;
    _right.crossVectors(_dir, UP).normalize();
    _up.crossVectors(_right, _dir);
    _dir.addScaledVector(_right, Math.cos(a) * r).addScaledVector(_up, Math.sin(a) * r).normalize();

    const wallHit = this.world.raycast(this.muzzle, _dir, c.range, this._hit);
    const wallDist = wallHit ? wallHit.distance : c.range;
    const tPlayer = player.hitTest(this.muzzle, _dir, wallDist);
    const hitPlayer = tPlayer >= 0;
    const dist = hitPlayer ? tPlayer : wallDist;
    const shot = {
      origin: this.muzzle.clone(),
      dir: _dir.clone(),
      distance: dist,
      hitPlayer,
      hitWorld: !hitPlayer && wallHit !== null,
      point: this.muzzle.clone().addScaledVector(_dir, dist),
      normal: wallHit && !hitPlayer ? wallHit.normal.clone() : null,
      damage: hitPlayer ? c.damage : 0,
      shooter: this,
    };
    this.shotsFired++;
    this.burstLeft--;
    this.fireCooldown = this.burstLeft > 0 ? c.fireInterval : rangeRand(this.rand, c.burstPause);
    if (this.onFire) this.onFire(shot);
  }

  // ---------------------------------------------------------------------------
  // Movement

  _goTo(target, speed, short = false) {
    this.moveSpeed = speed;
    if (short) {
      // A short step (e.g. sidestep to peek): walk straight there.
      this.path = [target.clone()];
      this.pathIndex = 0;
      this.moving = this.position.distanceTo(target) > this.cfg.arriveDistance;
      return;
    }
    const path = this.nav.findPath(this.position, target);
    this.path = path;
    this.pathIndex = path && path.length > 1 ? 1 : 0;
    this.moving = !!path;
    this.moveTarget.copy(target);
    this.stuckTimer = 0;
  }

  _stopMoving() {
    this.path = null;
    this.moving = false;
  }

  _turnTo(yaw, dt, rateScale = 1) {
    const diff = wrapAngle(yaw - this.facing);
    const step = this.cfg.turnRate * rateScale * dt;
    this.facing = wrapAngle(this.facing + MathUtils.clamp(diff, -step, step));
  }

  _move(dt) {
    const ctl = this._controls;
    ctl.forward = 0;
    ctl.moveScale = 1;
    if (this.moving && this.path) {
      const wp = this.path[this.pathIndex];
      const dx = wp.x - this.position.x;
      const dz = wp.z - this.position.z;
      const d = Math.hypot(dx, dz);
      if (d < this.cfg.arriveDistance) {
        this.pathIndex++;
        if (this.pathIndex >= this.path.length) this._stopMoving();
      } else {
        this.body.yaw = Math.atan2(-dx, -dz);
        ctl.forward = 1;
        ctl.moveScale = MathUtils.clamp(this.moveSpeed / this.body.cfg.walkSpeed, 0.2, 1);
        if (!this.canSeePlayer || this.state !== 'combat') this._turnTo(this.body.yaw, dt, 0.8);
        // Stuck on something: repath.
        this.stuckTimer += dt;
        if (this.stuckTimer > 1.2) {
          if (this.position.distanceTo(this.lastPos) < 0.3) {
            if (this.path.length > 1) this._goTo(this.moveTarget, this.moveSpeed);
            else this._stopMoving();
          }
          this.stuckTimer = 0;
          this.lastPos.copy(this.position);
        }
      }
    }
    this.body.update(dt, ctl);
  }
}
