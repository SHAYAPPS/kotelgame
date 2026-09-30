import { Vector3 } from 'three';
import { Enemy, NO_TARGET } from './Enemy.js';
import { ATTACKER, FRIENDLY } from './config.js';
import { EnemyView, Tracers } from './EnemyView.js';
import { rayCapsule } from './hitZones.js';
import { solveThrow } from '../weapons/Grenades.js';
import { Truck } from './Truck.js';
import { TruckView } from './TruckView.js';

const _a = new Vector3();
const _b = new Vector3();
const _p = new Vector3();
const _q = new Vector3();
const _d = new Vector3();
const _go = new Vector3();
const _gv = new Vector3();
const _gt = new Vector3();
const _rayHit = { point: new Vector3(), normal: new Vector3(), distance: 0 };

/**
 * Owns the enemies: spawns them, steps their AI, routes their shots (tracers,
 * positional sound, damage to the player, impacts) and answers the player's bullets.
 *
 * Factions: hostiles fight the player and the friendly combatants; friendlies (story
 * squad members driven by the same AI, see `addFriendly`) fight the hostiles. Each
 * agent's target is re-picked a few times a second: the closest one in sight.
 */
export class EnemyManager {
  /**
   * @param {{ scene, world, nav, cover, audio, impacts, health, spawns: { position: Vector3, yaw: number }[] }} deps
   */
  constructor({ scene, world, nav, cover, audio, impacts, health, spawns }) {
    this.scene = scene;
    this.world = world;
    this.nav = nav;
    this.cover = cover;
    this.audio = audio;
    this.impacts = impacts;
    this.health = health;
    this.spawns = spawns;
    this.tracers = new Tracers(scene);
    /** @type {{ enemy: Enemy, view: EnemyView }[]} */
    this.list = [];
    this.kills = 0;
    this.headshots = 0;
    /** (hit: { enemy, zone, killed }) => void */
    this.onEnemyHit = null;
    /** (enemy, killer) => void: any hostile killed, by the player or a friendly */
    this.onEnemyKilled = null;
    /** @type {Enemy[]} friendly combatants (their views belong to the story) */
    this.friendlies = [];
    this.friendlyKills = 0;
    this.playerTarget = null; // the player info object from the last update
    /** GrenadeSim for enemy throws (null = enemies never throw) */
    this.grenades = null;
    /** (grenade, thrower) => void: an enemy threw one (teammates shout) */
    this.onGrenadeThrown = null;
    /** (truck) => void: a vehicle was destroyed (the game plays the big explosion) */
    this.onVehicleDestroyed = null;
    this._grenadeGlobal = 4; // seconds until any enemy may throw
    this._campAnchor = new Vector3(0, -1e6, 0);
    this.campTime = 0; // how long the player has stayed in one spot
    this._listenerHead = new Vector3();
    this.reset();
  }

  get enemies() {
    return this.list.map((x) => x.enemy);
  }

  reset() {
    this.tracers.clear();
    for (const { view } of this.list) view.dispose();
    this.list.length = 0;
    this.friendlies.length = 0;
    this._grenadeGlobal = 4;
    this.campTime = 0;
    for (const c of this.cover.points) c.owner = null;
    for (const s of this.spawns) this.spawn(s.position, s.yaw);
  }

  /** Remove every hostile (keeps friendlies). */
  clearHostiles() {
    for (const { enemy, view } of this.list) {
      if (enemy.coverPoint) enemy.coverPoint.owner = null;
      view.dispose();
    }
    this.list.length = 0;
  }

  /**
   * Put a friendly combatant on an existing body (a story squad member).
   * @returns {Enemy} its AI; `removeFriendly` hands the body back.
   */
  addFriendly(body, yaw = 0) {
    const f = new Enemy(
      {
        world: this.world,
        nav: this.nav,
        cover: this.cover,
        config: FRIENDLY,
        faction: 'friendly',
        body,
        onFire: (shot) => this._onEnemyFire(shot),
      },
      body.position,
      yaw,
    );
    this.friendlies.push(f);
    return f;
  }

  removeFriendly(f) {
    const i = this.friendlies.indexOf(f);
    if (i < 0) return;
    this.friendlies.splice(i, 1);
    if (f.coverPoint) f.coverPoint.owner = null;
    f.body.wantCrouch = false;
  }

  /** An armed vehicle (see Truck.js) driving in along `path` (Vector3[]). */
  spawnTruck(config, path, threatPosition) {
    const truck = new Truck({ world: this.world, config, path, onFire: (shot) => this._onEnemyFire(shot) });
    truck.onDestroyed = () => {
      if (this.onVehicleDestroyed) this.onVehicleDestroyed(truck);
    };
    if (threatPosition) truck.engage(threatPosition);
    const view = new TruckView(truck);
    this.scene.add(view.root);
    this.list.push({ enemy: truck, view });
    return truck;
  }

  /** Damage an agent directly (a rocket hit), with the same kill bookkeeping as bullets. */
  applyDamage(agent, amount, dir, attacker = null) {
    const killed = agent.takeDamage(amount, dir, attacker);
    if (killed && agent.faction === 'hostile') {
      if (attacker && !attacker.agent) this.kills++;
      if (this.onEnemyKilled) this.onEnemyKilled(agent, attacker);
    }
    return killed;
  }

  /** Spawn a hostile that already knows where the defenders are and fights at once. */
  spawnAttacker(position, yaw, threatPosition, config = ATTACKER, via = null) {
    const e = this.spawn(position, yaw, config);
    if (via) e.via = via.map((p) => p.clone());
    e.engage(threatPosition);
    return e;
  }

  /**
   * An explosion: damage everyone in the radius (falling off with distance, reduced
   * behind cover). Hostile kills count for whoever threw it.
   * @returns {number} hostiles killed
   */
  explode(position, radius, maxDamage, thrower = null) {
    let kills = 0;
    const hurt = (agent) => {
      if (!agent.alive) return;
      const t = agent.asTarget;
      const d = position.distanceTo(t.chest);
      if (d >= radius) return;
      let dmg = maxDamage * Math.pow(1 - d / radius, 1.3);
      _go.set(position.x, position.y + 0.3, position.z);
      if (!this._clear(_go, t.chest) && !this._clear(_go, t.head)) dmg *= 0.2;
      if (dmg < 1) return;
      _d.subVectors(t.chest, position).setY(0);
      if (_d.lengthSq() < 1e-6) _d.set(1, 0, 0);
      _d.normalize();
      const killed = agent.takeDamage(dmg, _d, thrower && thrower.hitTest ? thrower : null);
      if (killed && agent.faction === 'hostile') {
        kills++;
        if (thrower && !thrower.agent) this.kills++;
        if (this.onEnemyKilled) this.onEnemyKilled(agent, thrower);
      }
    };
    for (const { enemy } of this.list) hurt(enemy);
    for (const f of this.friendlies) hurt(f);
    return kills;
  }

  /** Explosion damage to the player (0 outside the radius or fully behind cover). */
  explosionDamageAt(position, point, head, radius, maxDamage) {
    const d = position.distanceTo(point);
    if (d >= radius) return 0;
    let dmg = maxDamage * Math.pow(1 - d / radius, 1.3);
    _go.set(position.x, position.y + 0.3, position.z);
    if (!this._clear(_go, point) && !this._clear(_go, head)) dmg *= 0.2;
    return dmg;
  }

  /** Enemy grenades: who throws, when, at whom (see story/difficulty.js `grenades.enemy`). */
  _updateGrenades(dt, player) {
    const p = player.position;
    // Camping: the player stayed within campRadius of one spot.
    const any = this.list.find((x) => x.enemy.cfg.grenades);
    if (!any) return;
    const g = any.enemy.cfg.grenades;
    if (Math.hypot(p.x - this._campAnchor.x, p.z - this._campAnchor.z) > g.campRadius) {
      this._campAnchor.copy(p);
      this.campTime = 0;
    } else this.campTime += dt;
    this._grenadeGlobal -= dt;
    if (!this.grenades || this._grenadeGlobal > 0) return;
    for (const { enemy: e } of this.list) {
      const eg = e.cfg.grenades;
      if (!eg || !e.alive || e.state !== 'combat' || e.cfg.marksman) continue;
      e.grenadeCooldown -= dt;
      e._grenadeCheck -= dt;
      if (e.grenadeCooldown > 0 || e._grenadeCheck > 0) continue;
      e._grenadeCheck = eg.checkInterval;
      const t = e.target && e.target.alive ? e.target : player.alive ? player : null;
      if (!t) continue;
      const d = Math.hypot(t.position.x - e.position.x, t.position.z - e.position.z);
      if (d < eg.range[0] || d > eg.range[1]) continue;
      const camping = t === player && this.campTime > eg.campTime;
      if (e.rand() > (camping ? eg.campChance : eg.otherChance)) continue;
      // Needs a rough idea where the target is (seen recently).
      if (e.sinceSeen > 6) continue;
      _gt.copy(t.position);
      e.throwGrenade(_gt, solveThrow, _go, _gv);
      const gren = this.grenades.spawn(_go, _gv, 'hostile', e);
      if (!gren) continue;
      this._grenadeGlobal = eg.minInterval;
      if (this.onGrenadeThrown) this.onGrenadeThrown(gren, e);
      break;
    }
  }

  spawn(position, yaw = 0, config = undefined) {
    const enemy = new Enemy(
      {
        world: this.world,
        nav: this.nav,
        cover: this.cover,
        config,
        onFire: (shot) => this._onEnemyFire(shot),
      },
      position,
      yaw,
    );
    const view = new EnemyView(enemy);
    this.scene.add(view.root);
    this.list.push({ enemy, view });
    return enemy;
  }

  /** Spawns an enemy on a random walkable spot 18-40 m away that the player cannot see. */
  spawnNear(playerEye) {
    const nav = this.nav;
    for (let tries = 0; tries < 200; tries++) {
      const i = nav.randomNode();
      if (i < 0) break;
      nav.nodePosition(i, _p);
      const d = Math.hypot(_p.x - playerEye.x, _p.z - playerEye.z);
      if (d < 18 || d > 40) continue;
      _q.set(_p.x, _p.y + 1.6, _p.z);
      _a.subVectors(_q, playerEye);
      const len = _a.length();
      _a.divideScalar(len);
      if (!this.world.raycast(playerEye, _a, len, { point: new Vector3(), normal: new Vector3(), distance: 0 })) continue;
      const yaw = Math.atan2(_p.x - playerEye.x, _p.z - playerEye.z); // faces the player
      return this.spawn(_p.clone(), yaw);
    }
    return null;
  }

  /** The player fired: everyone in earshot hears it. */
  playerShot(origin) {
    for (const { enemy } of this.list) enemy.hearGunshot(origin);
  }

  /** Closest enemy hit along the ray: { enemy, zone, distance } or null. */
  raycast(origin, dir, maxDist) {
    let best = null;
    for (const { enemy } of this.list) {
      const h = enemy.raycast(origin, dir, maxDist);
      if (h && (!best || h.distance < best.distance)) best = { enemy, zone: h.zone, distance: h.distance };
    }
    return best;
  }

  /** The player's bullet hit an enemy. */
  hit(target, dir, player) {
    const killed = target.enemy.takeHit(target.zone, dir, player);
    if (killed) {
      this.kills++;
      if (target.zone === 'head') this.headshots++;
      if (this.onEnemyKilled) this.onEnemyKilled(target.enemy, player);
    }
    if (this.onEnemyHit) this.onEnemyHit({ enemy: target.enemy, zone: target.zone, killed });
    return killed;
  }

  _onEnemyFire(shot) {
    this.tracers.add(shot.origin, shot.dir, shot.distance);
    if (this.onShotFx) this.onShotFx(shot);
    this.audio.shotAt(shot.origin);
    const victim = shot.hitPlayer ? shot.target.agent : null;
    if (victim) {
      // One combatant hit another.
      const wasAlive = victim.alive;
      victim.takeHit(shot.zone ?? 'body', shot.dir, shot.shooter.asTarget);
      if (wasAlive && !victim.alive) {
        if (shot.shooter.faction === 'friendly') this.friendlyKills++;
        if (victim.faction === 'hostile' && this.onEnemyKilled) this.onEnemyKilled(victim, shot.shooter);
      }
      if (shot.hitWorld) this.impacts.add(shot.point, shot.normal, shot.dir);
    } else if (shot.hitPlayer) {
      this.health.damage(shot.damage, shot.origin);
    } else {
      if (shot.hitWorld) this.impacts.add(shot.point, shot.normal, shot.dir);
      // A near miss past your head: the supersonic crack.
      const h = this._listenerHead;
      _a.subVectors(h, shot.origin);
      const t = Math.min(Math.max(_a.dot(shot.dir), 0), shot.distance);
      _p.copy(shot.origin).addScaledVector(shot.dir, t);
      if (_p.distanceTo(h) < 2.5 && t > 3) this.audio.crack(_p);
    }
  }

  /**
   * Fixed step.
   * @param {object} player see Enemy.update; `head` is also used for near-miss cracks
   * @param {import('../player/PlayerController.js').PlayerController} playerBody pushed out of enemies
   */
  update(dt, player, playerBody) {
    this._listenerHead.copy(player.head);
    this.playerTarget = player;
    this._updateGrenades(dt, player);
    const enemies = this.enemies;
    const fr = this.friendlies;
    if (fr.length) {
      // Two factions: pick targets, and everyone avoids everyone's cover spots.
      for (const e of enemies) if (e.alive) this._retarget(e, dt, player, fr, true);
      for (const f of fr) {
        // The squad fights around the player unless the story moves its anchor (bounding).
        f.anchor = f.anchorOverride ?? (player.alive ? player.position : null);
        this._retarget(f, dt, null, enemies, false);
      }
      const all = enemies.concat(fr);
      for (const e of enemies) e.update(dt, player, all);
      for (const f of fr) f.update(dt, NO_TARGET, all);
    } else {
      for (const e of enemies) e.update(dt, player, enemies);
    }

    // Bodies don't overlap: push the player and enemies apart horizontally.
    const minD = 0.62;
    const vehicles = enemies.filter((e) => e.isVehicle);
    if (vehicles.length) {
      for (const v of vehicles) {
        v.pushOut(playerBody.position, playerBody.cfg.radius);
        for (const e of enemies) if (!e.isVehicle && e.alive) v.pushOut(e.position, e.cfg.radius);
        for (const f of fr) v.pushOut(f.position, f.cfg.radius);
      }
    }
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e.alive || e.isVehicle) continue;
      const dx = playerBody.position.x - e.position.x;
      const dz = playerBody.position.z - e.position.z;
      const d = Math.hypot(dx, dz);
      if (d < minD && d > 1e-4 && Math.abs(playerBody.position.y - e.position.y) < 1.6) {
        playerBody.position.x += (dx / d) * (minD - d);
        playerBody.position.z += (dz / d) * (minD - d);
      }
      for (let j = i + 1; j < enemies.length; j++) {
        const o = enemies[j];
        if (!o.alive || o.isVehicle) continue;
        const ex = o.position.x - e.position.x;
        const ez = o.position.z - e.position.z;
        const ed = Math.hypot(ex, ez);
        if (ed < minD && ed > 1e-4) {
          const push = (minD - ed) / 2;
          o.position.x += (ex / ed) * push;
          o.position.z += (ez / ed) * push;
          e.position.x -= (ex / ed) * push;
          e.position.z -= (ez / ed) * push;
        }
      }
    }
  }

  /**
   * Re-pick an agent's target a few times a second: the closest opponent in sight
   * (hostiles slightly prefer the player), else keep the current one, else the closest.
   */
  _retarget(agent, dt, player, opponents, hostile) {
    agent._retargetTimer = (agent._retargetTimer ?? 0) - dt;
    const cur = agent.target;
    const curValid = cur && cur.alive;
    if (curValid && agent._retargetTimer > 0) return;
    agent._retargetTimer = 0.35 + agent.rand() * 0.25;
    let best = null;
    let bestScore = Infinity;
    let nearest = null;
    let nearestD = Infinity;
    const consider = (t, weight) => {
      if (!t.alive) return;
      const d = agent.eye.distanceTo(t.chest) * weight;
      if (d < nearestD) {
        nearestD = d;
        nearest = t;
      }
      if (d > agent.cfg.visionRange || d >= bestScore) return;
      if (!this._clear(agent.eye, t.chest) && !this._clear(agent.eye, t.head)) return;
      // Stick with the current target unless another is clearly closer.
      bestScore = t === cur ? d * 0.7 : d;
      best = t;
    };
    if (player && player.alive) consider(player, 0.8);
    for (const o of opponents) if (o.alive) consider(o.asTarget, 1);
    const pick = best ?? (curValid ? cur : nearest);
    if (pick) agent.setTarget(pick);
    else agent.target = hostile ? null : NO_TARGET;
  }

  _clear(from, to) {
    _d.subVectors(to, from);
    const len = _d.length();
    if (len < 1e-3) return true;
    _d.divideScalar(len);
    return this.world.raycast(from, _d, len - 0.05, _rayHit) === null;
  }

  /** Per rendered frame: views and tracers. */
  frameUpdate(dt) {
    for (const { view } of this.list) view.update(dt);
    this.tracers.update(dt);
  }
}

/** Player capsule hit test for enemy bullets. */
export function playerHitTest(body) {
  return (origin, dir, maxDist) => {
    const p = body.position;
    const r = body.cfg.radius;
    _a.set(p.x, p.y + r, p.z);
    _b.set(p.x, p.y + body.height - r, p.z);
    return rayCapsule(origin, dir, _a, _b, r, maxDist);
  };
}
