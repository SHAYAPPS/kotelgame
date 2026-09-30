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
 * How another combatant looks to an AI (the same shape as the player info object the
 * game passes in): position, head/chest points, speed, crouched, firing, alive, hitTest.
 */
export class CombatTarget {
  constructor(agent) {
    this.agent = agent;
    this.position = agent.body.position;
    this.head = new Vector3();
    this.chest = new Vector3();
    this.zone = 'body'; // zone of the last successful hitTest
  }

  get alive() {
    return this.agent.alive;
  }

  get crouched() {
    return this.agent.crouched;
  }

  get speed() {
    return this.agent.body.horizontalSpeed;
  }

  get firing() {
    return this.agent.time - this.agent.lastShotTime < 0.3;
  }

  /** Refresh head / chest points (after the agent moved). */
  update() {
    const c = this.agent.cfg;
    const p = this.position;
    this.head.set(p.x, p.y + (this.crouched ? c.crouchHeadHeight : c.headHeight), p.z);
    this.chest.set(p.x, p.y + (this.crouched ? 0.75 : 1.25), p.z);
    // With an animated model, aim at its actual head (hit zones follow the model).
    const hs = this.agent.hitShape;
    if (hs?.valid) placeLocal(this.head, hs, p, hs.head);
  }

  hitTest(origin, dir, maxDist) {
    const h = this.agent.raycast(origin, dir, maxDist);
    if (!h) return -1;
    this.zone = h.zone;
    return h.distance;
  }
}

const _h = new Vector3();
const _ca = new Vector3();
const _cb = new Vector3();

/** A point of a model's hit shape (root frame, rotated by shape.yaw) placed at `position`. */
export function placeLocal(out, shape, position, v) {
  const s = Math.sin(shape.yaw);
  const c = Math.cos(shape.yaw);
  return out.set(position.x + v.x * c + v.z * s, position.y + v.y, position.z - v.x * s + v.z * c);
}

/**
 * Ray test against a character model's hit zones: `shape` holds the head center and the body
 * capsule's end points in the model's root frame (feet at the origin, rotated by `yaw`); they
 * are placed at the body's current position. The capsule's top stops `radius` below the neck
 * so the head sphere is what a shot at the head hits.
 * @returns {{ distance: number, zone: 'head'|'body' } | null}
 */
export function modelHitTest(shape, position, headRadius, radius, origin, dir, maxDist) {
  placeLocal(_h, shape, position, shape.head);
  placeLocal(_ca, shape, position, shape.a);
  placeLocal(_cb, shape, position, shape.b);
  // Pull the capsule's top end down by its radius (the neck ends the body zone).
  _dir.subVectors(_ca, _cb);
  const len = _dir.length();
  if (len > 1e-4) _cb.addScaledVector(_dir, Math.min(radius, len * 0.5) / len);
  const th = raySphere(origin, dir, _h, headRadius, maxDist);
  const tb = rayCapsule(origin, dir, _ca, _cb, radius, maxDist);
  if (th >= 0 && (tb < 0 || th <= tb + 0.05)) return { distance: th, zone: 'head' };
  if (tb >= 0) return { distance: tb, zone: 'body' };
  return null;
}

/** Nobody to fight (a friendly with no enemies left). */
export const NO_TARGET = {
  position: new Vector3(),
  head: new Vector3(),
  chest: new Vector3(),
  alive: false,
  crouched: false,
  speed: 0,
  firing: false,
  hitTest: () => -1,
};

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
  constructor({ world, nav, cover, rand = Math.random, onFire = null, config = ENEMY, faction = 'hostile', body = null }, position, yaw = 0) {
    config ??= ENEMY;
    this.cfg = config;
    this.faction = faction; // 'hostile' | 'friendly'
    this.world = world;
    this.nav = nav;
    this.cover = cover;
    this.rand = rand;
    this.onFire = onFire;

    // A friendly squad member drives its story NPC's existing body.
    this.body = body ?? new PlayerController(world, { ...PLAYER, walkSpeed: config.runSpeed, radius: config.radius });
    if (!body) this.body.setSpawn(position, yaw);
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
    this.stuckCount = 0;
    this.badCover = null; // cover he could not reach (skipped next time)
    this.lastPos = position.clone();

    // Weapon
    this.burstLeft = 0;
    this.fireCooldown = 0;
    this.shotsFired = 0;
    this.lastShotTime = -Infinity;
    this.throws = 0; // grenades thrown (the view plays the throw)

    // Roles (see story/difficulty.js): a route to run before engaging (flankers), aimed
    // single shots with a scope glint (marksman), grenades.
    this.via = null; // Vector3[]
    this.aimTime = 0;
    this.glint = 0; // 0..1 while a marksman is lining up a shot at the player
    this.grenadeCooldown = config.grenades ? rangeRand(rand, config.grenades.cooldown) * 0.5 : Infinity;
    this._grenadeCheck = rand();
    this._rushTimer = 0;

    // Who he fights: the player info object or another combatant's `asTarget`.
    // null = the `player` argument of update() (the single-target default).
    this.target = null;
    this.asTarget = new CombatTarget(this);
    // Friendlies: pick cover around this point (the player) instead of around themselves.
    this.anchor = null;
    this.anchorOverride = null; // set by the story (bounding: a point ahead of the player)
    this.anchorRadius = null; // cover within this of the anchor (default coverSearchRadius)
    this.holdPosition = false; // stay in the current cover (covering while others move)
    this._forceCover = false;

    // Death
    this.deathDir = new Vector3(0, 0, 1);
    this.lastHitZone = null;

    // Hit zones from the animated model (set by the view: head sphere and body capsule
    // points in its root frame, see characters/CharacterModel.js). Without a model: the
    // analytic zones below.
    this.hitShape = null;
    this.visualMuzzle = null; // where tracers start (the rifle's muzzle on the model)

    this._hit = { point: new Vector3(), normal: new Vector3(), distance: 0 };
    this._controls = { forward: 0, right: 0, jump: false, sprint: false, crouch: false, moveScale: 1 };
    this.eye = new Vector3();
    this.muzzle = new Vector3();
    this._updateEye();
    this.asTarget.update();
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
    if (this.hitShape?.valid) return modelHitTest(this.hitShape, p, c.headRadius, c.radius, origin, dir, maxDist);
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
    return this.takeDamage(zone === 'head' ? c.headDamage : c.bodyDamage, dir, attacker, zone);
  }

  /** Apply damage (bullets via takeHit, explosions directly). Returns true if it killed him. */
  takeDamage(amount, dir, attacker = null, zone = 'body') {
    if (!this.alive) return false;
    const c = this.cfg;
    this.health -= amount;
    this.lastHitZone = zone;
    if (attacker) {
      if (attacker.hitTest) this.setTarget(attacker); // turn on whoever shot him
      this._notice(attacker, true);
    }
    // Story squad members can't die: they get knocked back into cover instead.
    if (c.invulnerable) this.health = Math.max(this.health, 1);
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

  /** Pick new cover now (the story's bounding: "moving!"). */
  relocate() {
    this._forceCover = true;
    this.relocateTimer = 0;
  }

  /** Switch who he fights. A new target means reacquiring it (aim and reaction). */
  setTarget(target) {
    if (target === this.target) return;
    this.target = target;
    this.losTime = 0;
    if (this.state === 'combat') this.reaction = Math.max(this.reaction, this.cfg.reactionTime * 0.5);
  }

  /** Start fighting straight away (scripted attackers, the squad at first contact). */
  engage(threatPosition) {
    if (!this.alive) return;
    this.lastKnown.copy(threatPosition);
    this.hasLastKnown = true;
    this.awareness = 1;
    this.sinceSeen = 0;
    this._enter('combat');
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
    if (this.target) player = this.target;
    if (this.cfg.invulnerable) this.health = Math.min(this.cfg.health, this.health + this.cfg.regen * dt);

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
    this.asTarget.update();
    // Scope glint: a marksman lining up on the player (not on a teammate).
    this.glint = this.cfg.marksman && this.canSeePlayer && !player.agent ? Math.min(1, 0.35 + this.aimTime / this.cfg.aimTime) : 0;
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
    if (this.sinceSeen > 14 && !c.holdCombat) {
      // Lost you: search where you were last seen.
      this._enter('alerted');
      return;
    }
    // Attackers know roughly where the defenders are: after a while without contact
    // they head for their target's real position.
    if (c.assault && this.sinceSeen > c.seekTime && player.alive) this.lastKnown.copy(player.position);
    if (this.via) return this._followVia(dt, player);
    if (c.rusher) return this._rush(dt, player);
    const threat = this.lastKnown;
    const distToThreat = this.position.distanceTo(threat);

    // (Re)pick cover when he has none, his cover is exposed/flanked, or you got too close.
    let needCover = this.coverPoint === null && this.relocateTimer <= 0;
    if (this.coverPoint && this.mode !== 'moving' && this.relocateTimer <= 0) {
      const flanked = !this.cover.protects(this.coverPoint, threat);
      if (flanked || distToThreat < c.closeRange) needCover = true;
      // Nobody in sight for a while, or left behind by the anchor: find a better spot.
      if (c.seekTime && this.sinceSeen > c.seekTime && !this.holdPosition) needCover = true;
      const a = this.anchor;
      if (a && !this.holdPosition && Math.hypot(this.coverPoint.x - a.x, this.coverPoint.z - a.z) > (this.anchorRadius ?? c.coverSearchRadius)) needCover = true;
    }
    if (this._forceCover && this.mode !== 'moving') {
      this._forceCover = false;
      needCover = true;
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
      if (c.assault) {
        // No cover in reach: advance in the open until someone is in sight.
        if (this.canSeePlayer) this._stopMoving();
        else if (!this.moving && distToThreat > c.closeRange) this._goTo(threat, c.runSpeed);
      }
      const a = this.anchor;
      if (a && !this.canSeePlayer && !this.moving && Math.hypot(a.x - this.position.x, a.z - this.position.z) > 5) {
        // A squad member with no cover and nothing to shoot at: stay with the player.
        const ang = this.rand() * Math.PI * 2;
        this._goTo(_b.set(a.x + Math.cos(ang) * 2.5, a.y, a.z + Math.sin(ang) * 2.5), c.runSpeed);
      }
    }

    // Face the threat (unless running somewhere else, then look where he goes).
    if (!this.moving || this.canSeePlayer) {
      this._turnTo(Math.atan2(-(threat.x - this.position.x), -(threat.z - this.position.z)), dt, 1);
    }

    const canShoot = this.mode === 'peeking' || this.mode === 'exposed' || (this.mode === 'moving' && distToThreat < 20);
    if (canShoot) this._shoot(dt, player);
  }

  /** Flanker: run the route first (shooting at anyone close on the way), then fight. */
  _followVia(dt, player) {
    const c = this.cfg;
    const v = this.via[0];
    this.mode = 'moving';
    this.body.wantCrouch = false;
    if (Math.hypot(v.x - this.position.x, v.z - this.position.z) < 1.5) {
      this.via.shift();
      this._stopMoving();
      if (!this.via.length) {
        this.via = null;
        this.mode = 'exposed';
        this.relocateTimer = 0;
      }
      return;
    }
    if (!this.moving) {
      this._goTo(v, c.runSpeed);
      if (!this.moving) this.via.shift(); // unreachable: skip that point
      if (this.via && !this.via.length) this.via = null;
    }
    if (this.canSeePlayer && player.alive) {
      this._faceTarget(dt, player.position);
      if (this.position.distanceTo(player.position) < (c.viaShootRange ?? 20)) this._shoot(dt, player);
    }
  }

  /** Rusher: charge straight at the target, firing on the move; stop right on top of it. */
  _rush(dt, player) {
    const c = this.cfg;
    this.mode = 'exposed';
    this.body.wantCrouch = false;
    const tp = player.alive ? player.position : this.lastKnown;
    const d = Math.hypot(tp.x - this.position.x, tp.z - this.position.z);
    this._rushTimer -= dt;
    if (d > c.rushStop) {
      if (this._rushTimer <= 0 || !this.moving) {
        this._rushTimer = 0.7;
        this._goTo(tp, c.runSpeed);
      }
    } else this._stopMoving();
    if (this.canSeePlayer) {
      this._faceTarget(dt, player.position);
      this._shoot(dt, player);
    }
  }

  _faceTarget(dt, p) {
    this._turnTo(Math.atan2(-(p.x - this.position.x), -(p.z - this.position.z)), dt, 1);
  }

  /**
   * Grenade throw at a point: the launch velocity (into `outVelocity`) and origin
   * (`outOrigin`). The manager decides when; he stops firing for a moment.
   */
  throwGrenade(targetPoint, solve, outOrigin, outVelocity) {
    const g = this.cfg.grenades;
    outOrigin.copy(this.eye);
    outOrigin.y += 0.25;
    const s = g.inaccuracy;
    _a.set(targetPoint.x + (this.rand() - 0.5) * 2 * s, targetPoint.y, targetPoint.z + (this.rand() - 0.5) * 2 * s);
    solve(outOrigin, _a, outVelocity);
    this.grenadeCooldown = rangeRand(this.rand, g.cooldown);
    this.throws++;
    this.fireCooldown = Math.max(this.fireCooldown, 0.9);
    this.burstLeft = 0;
    this._faceTarget(1, targetPoint);
  }

  _takeCover(threat, others) {
    const c = this.cfg;
    const pts = this.cover.points;
    let best = null;
    let bestScore = -Infinity;
    const pos = this.position;
    let evaluated = 0;
    // An attacker looking for contact only takes cover that gets him closer.
    const seeking = c.assault && this.sinceSeen > c.seekTime;
    const curThreat = Math.hypot(pos.x - threat.x, pos.z - threat.z);
    for (let i = 0; i < pts.length && evaluated < 60; i++) {
      const p = pts[i];
      if (p.owner && p.owner !== this) continue;
      if (p === this.badCover) continue;
      const dSelf = Math.hypot(p.x - pos.x, p.z - pos.z);
      const a = this.anchor;
      const d = a ? Math.hypot(p.x - a.x, p.z - a.z) : dSelf;
      if (d > (a ? (this.anchorRadius ?? c.coverSearchRadius) : c.coverSearchRadius)) continue;
      const dThreat = Math.hypot(p.x - threat.x, p.z - threat.z);
      if (dThreat < c.closeRange + 1) continue;
      if (seeking && dThreat > curThreat - 5) continue;
      // Same level as him (or his anchor), or as the threat (down the stairs toward it).
      if (Math.abs(p.y - (a ? a.y : pos.y)) > 4 && Math.abs(p.y - threat.y) > 4) continue;
      // Cheap score first, expensive ray tests only for promising points.
      const [lo, hi] = c.preferredRange;
      let score = -(a ? d * 0.35 + dSelf * 0.15 : d * (c.travelCost ?? 0.6)) - (dThreat < lo ? (lo - dThreat) * 1.5 : dThreat > hi ? (dThreat - hi) * 0.5 : 0);
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
    if (best && best === this.coverPoint && c.assault && this.sinceSeen > c.seekTime) {
      // Nothing better in reach and nobody in sight: leave cover and push on.
      best.owner = null;
      best = null;
    }
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
    if (!player.alive) return;
    if (c.marksman) return this._marksmanShot(dt, player);
    let aim;
    if (this.canSeePlayer) {
      if (this.reaction > 0) return;
      // Aim at the chest if visible, otherwise the head.
      aim = this._los(player.chest) ? player.chest : player.head;
    } else if (c.suppress && this.hasLastKnown && this.sinceSeen < c.suppressTime && this.mode !== 'hiding' && this.mode !== 'moving') {
      // Suppressing: keep firing at where the target was (the cover he's behind).
      aim = _o.set(this.lastKnown.x, this.lastKnown.y + 1.0, this.lastKnown.z);
    } else return;
    if (this.fireCooldown > 0) return;
    if (this.burstLeft <= 0) {
      this.burstLeft = Math.round(rangeRand(this.rand, c.burst));
      this.fireCooldown = rangeRand(this.rand, c.burstPause) * 0.5;
      return;
    }
    const f = this.canSeePlayer ? MathUtils.clamp(this.losTime / c.spreadTightenTime, 0, 1) : 0;
    let spread = MathUtils.lerp(c.maxSpread, c.minSpread, f);
    if (this.moving) spread *= 1.6;
    this._fireAt(aim, player, spread);
    this.burstLeft--;
    this.fireCooldown = this.burstLeft > 0 ? c.fireInterval : rangeRand(this.rand, c.burstPause);
  }

  /** Marksman: line up (glint), fire one accurate round, work the bolt. */
  _marksmanShot(dt, player) {
    const c = this.cfg;
    if (!this.canSeePlayer || this.reaction > 0) {
      this.aimTime = Math.max(0, this.aimTime - dt * 2);
      return;
    }
    if (this.fireCooldown > 0) return;
    this.aimTime += dt;
    if (this.aimTime < c.aimTime) return;
    this.aimTime = 0;
    const aim = this._los(player.chest) ? player.chest : player.head;
    const f = MathUtils.clamp(this.losTime / c.spreadTightenTime, 0, 1);
    this._fireAt(aim, player, MathUtils.lerp(c.maxSpread, c.minSpread, f));
    this.fireCooldown = c.boltTime;
  }

  _fireAt(aim, player, spread) {
    const c = this.cfg;
    _dir.subVectors(aim, this.muzzle).normalize();
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
      target: player, // hitPlayer means this target was hit (the player or a combatant)
      zone: hitPlayer ? player.zone ?? 'body' : null,
    };
    this.shotsFired++;
    this.lastShotTime = this.time;
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

  /** Repathing keeps failing (the path runs somewhere the body can't go): drop it. */
  _giveUpMove() {
    this.stuckCount = 0;
    this._stopMoving();
    if (this.via) {
      this.via.shift();
      if (!this.via.length) this.via = null;
    }
    if (this.mode === 'moving' && this.coverPoint) {
      this.badCover = this.coverPoint;
      this.coverPoint.owner = null;
      this.coverPoint = null;
      this.mode = 'exposed';
      this.relocateTimer = 0;
    }
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
            if (++this.stuckCount >= 3) this._giveUpMove();
            else if (this.path.length > 1) this._goTo(this.moveTarget, this.moveSpeed);
            else this._stopMoving();
          } else this.stuckCount = 0;
          this.stuckTimer = 0;
          this.lastPos.copy(this.position);
        }
      }
    }
    this.body.update(dt, ctl);
  }
}
