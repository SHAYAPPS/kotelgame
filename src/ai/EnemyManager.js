import { Vector3 } from 'three';
import { Enemy } from './Enemy.js';
import { EnemyView, Tracers } from './EnemyView.js';
import { rayCapsule } from './hitZones.js';

const _a = new Vector3();
const _b = new Vector3();
const _p = new Vector3();
const _q = new Vector3();

/**
 * Owns the enemies: spawns them, steps their AI, routes their shots (tracers,
 * positional sound, damage to the player, impacts) and answers the player's bullets.
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
    this._listenerHead = new Vector3();
    this.reset();
  }

  get enemies() {
    return this.list.map((x) => x.enemy);
  }

  reset() {
    for (const { view } of this.list) view.dispose();
    this.list.length = 0;
    for (const c of this.cover.points) c.owner = null;
    for (const s of this.spawns) this.spawn(s.position, s.yaw);
  }

  spawn(position, yaw = 0) {
    const enemy = new Enemy(
      {
        world: this.world,
        nav: this.nav,
        cover: this.cover,
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
    }
    if (this.onEnemyHit) this.onEnemyHit({ enemy: target.enemy, zone: target.zone, killed });
    return killed;
  }

  _onEnemyFire(shot) {
    this.tracers.add(shot.origin, shot.dir, shot.distance);
    this.audio.shotAt(shot.origin);
    if (shot.hitPlayer) {
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
    const enemies = this.enemies;
    for (const e of enemies) e.update(dt, player, enemies);

    // Bodies don't overlap: push the player and enemies apart horizontally.
    const minD = 0.62;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e.alive) continue;
      const dx = playerBody.position.x - e.position.x;
      const dz = playerBody.position.z - e.position.z;
      const d = Math.hypot(dx, dz);
      if (d < minD && d > 1e-4 && Math.abs(playerBody.position.y - e.position.y) < 1.6) {
        playerBody.position.x += (dx / d) * (minD - d);
        playerBody.position.z += (dz / d) * (minD - d);
      }
      for (let j = i + 1; j < enemies.length; j++) {
        const o = enemies[j];
        if (!o.alive) continue;
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
