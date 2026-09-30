import { MathUtils, Vector3 } from 'three';
import { PLAYER } from '../player/config.js';
import { PlayerController } from '../player/PlayerController.js';
import { raySphere, rayCapsule } from '../ai/hitZones.js';

const _a = new Vector3();
const _b = new Vector3();
const _t = new Vector3();

export const NPC = {
  radius: 0.28,
  headHeight: 1.62,
  headRadius: 0.12,
  turnRate: 4,
  arrive: 0.5,
  talkRange: 2.8,
  talkAngle: 0.5, // radians off the view center
};

/** Kinds decide the look and whether hitting them is a civilian or a teammate hit. */
export const TEAMMATE_KINDS = new Set(['commander', 'soldier']);

function wrapAngle(a) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/**
 * A friendly or civilian character (pure logic). Walks routes with the navmesh and the
 * same character controller as the player; waits for the player when leashed; can
 * follow a leader (tour groups) or stand and pray.
 */
export class Npc {
  constructor({ world, nav, id, kind, speaker = null, position, yaw = 0, pray = false, rand = Math.random }) {
    this.world = world;
    this.nav = nav;
    this.id = id;
    this.kind = kind;
    this.speaker = speaker;
    this.pray = pray;
    this.rand = rand;
    this.body = new PlayerController(world, { ...PLAYER, radius: NPC.radius, walkSpeed: 2.4 });
    this.body.setSpawn(position, yaw);
    this.facing = yaw;
    this.faceTarget = null; // 'player' | null
    this.faceYaw = null; // yaw to hold when idle
    this.talkable = false;
    this.route = null;
    this.arrived = true;
    this.follow = null; // { leader: Npc, dx, dz }
    this.speed = 0; // current horizontal speed (for the walk animation)
    this.time = rand() * 10;
    this._ctl = { forward: 0, right: 0, jump: false, sprint: false, crouch: false, moveScale: 1 };
    this._path = null;
    this._pathIndex = 0;
    this._leg = 0;
    this._pause = 0;
    this._stuck = 0;
    this._lastPos = position.clone();
  }

  get position() {
    return this.body.position;
  }

  get isTeammate() {
    return TEAMMATE_KINDS.has(this.kind);
  }

  place(x, y, z, yaw) {
    this.body.spawnPoint.set(x, y, z);
    this.body.spawnYaw = yaw;
    this.body.respawn();
    this.facing = yaw;
    this.route = null;
    this._path = null;
    this.arrived = true;
  }

  /**
   * @param {{ points: [number, number][], speed?: number, leash?: number, loop?: boolean,
   *   pause?: number, face?: number }} route
   */
  setRoute(route) {
    this.route = {
      points: route.points.map(([x, z]) => this._floor(x, z)),
      speed: route.speed ?? 1.4,
      leash: route.leash ?? 0,
      loop: !!route.loop,
      pause: route.pause ?? 0,
      face: route.face ?? null,
    };
    this._leg = 0;
    this._pause = 0;
    this.arrived = false;
    this.faceTarget = null;
    this._planLeg();
  }

  /** Where the route ends (for fast-forwarding a mission). */
  routeEnd(route) {
    const [x, z] = route.points[route.points.length - 1];
    return this._floor(x, z);
  }

  _floor(x, z) {
    const n = this.nav.nodeAt(x, z);
    return new Vector3(x, n >= 0 ? this.nav.y[n] : 0, z);
  }

  _planLeg() {
    const target = this.route.points[this._leg];
    this._path = this.nav.findPath(this.position, target) ?? [target.clone()];
    this._pathIndex = this._path.length > 1 ? 1 : 0;
    this._stuck = 0;
  }

  /** Friendly-fire hit test. Returns distance or -1. */
  raycast(origin, dir, maxDist) {
    const p = this.position;
    _a.set(p.x, p.y + NPC.headHeight, p.z);
    const th = raySphere(origin, dir, _a, NPC.headRadius, maxDist);
    _a.set(p.x, p.y + NPC.radius, p.z);
    _b.set(p.x, p.y + NPC.headHeight - NPC.headRadius - NPC.radius, p.z);
    const tb = rayCapsule(origin, dir, _a, _b, NPC.radius, maxDist);
    if (th < 0) return tb;
    if (tb < 0) return th;
    return Math.min(th, tb);
  }

  /** @param {number} dt @param {{ position: Vector3 }} player */
  update(dt, player) {
    this.time += dt;
    const ctl = this._ctl;
    ctl.forward = 0;
    let moveYaw = null;
    let speed = 0;

    if (this.follow) {
      // Tour group member: keep a spot near the leader.
      const L = this.follow.leader;
      const s = Math.sin(L.facing);
      const c = Math.cos(L.facing);
      const tx = L.position.x + this.follow.dx * c + this.follow.dz * s;
      const tz = L.position.z - this.follow.dx * s + this.follow.dz * c;
      const dx = tx - this.position.x;
      const dz = tz - this.position.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.7) {
        moveYaw = Math.atan2(-dx, -dz);
        speed = Math.min(1.6, 0.6 + d * 0.5);
      } else {
        this.faceYaw = Math.atan2(-(L.position.x - this.position.x), -(L.position.z - this.position.z));
      }
    } else if (this.route && !this.arrived) {
      const r = this.route;
      const distPlayer = Math.hypot(player.position.x - this.position.x, player.position.z - this.position.z);
      if (this._pause > 0) {
        this._pause -= dt;
      } else if (r.leash > 0 && distPlayer > r.leash && this._playerBehind(player)) {
        // Wait for a player who is lagging behind, looking back at them.
        this.faceTarget = 'player';
      } else {
        this.faceTarget = null;
        const wp = this._path[this._pathIndex];
        const dx = wp.x - this.position.x;
        const dz = wp.z - this.position.z;
        if (Math.hypot(dx, dz) < NPC.arrive) {
          this._pathIndex++;
          if (this._pathIndex >= this._path.length) this._nextLeg();
        } else {
          moveYaw = Math.atan2(-dx, -dz);
          speed = r.speed;
          this._stuck += dt;
          if (this._stuck > 2) {
            if (this.position.distanceTo(this._lastPos) < 0.3) this._planLeg();
            this._stuck = 0;
            this._lastPos.copy(this.position);
          }
        }
      }
    }

    if (moveYaw !== null) {
      this.body.yaw = moveYaw;
      ctl.forward = 1;
      ctl.moveScale = MathUtils.clamp(speed / this.body.cfg.walkSpeed, 0.1, 1);
      this._turnTo(moveYaw, dt);
    } else if (this.faceTarget === 'player') {
      this._turnTo(Math.atan2(-(player.position.x - this.position.x), -(player.position.z - this.position.z)), dt);
    } else if (this.faceYaw !== null) {
      this._turnTo(this.faceYaw, dt);
    }
    this.body.update(dt, ctl);
    this.speed = this.body.horizontalSpeed;
  }

  /** Is the player farther from where we are heading than we are? */
  _playerBehind(player) {
    const r = this.route;
    const goal = r.points[r.points.length - 1];
    const me = Math.hypot(goal.x - this.position.x, goal.z - this.position.z);
    const them = Math.hypot(goal.x - player.position.x, goal.z - player.position.z);
    return them > me;
  }

  _nextLeg() {
    const r = this.route;
    this._leg++;
    if (this._leg >= r.points.length) {
      if (r.loop) {
        this._leg = 0;
      } else {
        this.arrived = true;
        if (r.face !== null) this.faceYaw = r.face;
        return;
      }
    }
    this._pause = r.pause;
    this._planLeg();
  }

  _turnTo(yaw, dt) {
    const diff = wrapAngle(yaw - this.facing);
    const step = NPC.turnRate * dt;
    this.facing = wrapAngle(this.facing + MathUtils.clamp(diff, -step, step));
  }
}

/**
 * Keeps the NPCs: spawning (named story characters and anonymous crowds), stepping them,
 * talk targets for the E key, friendly-fire hit tests and body separation.
 */
export class NpcManager {
  constructor({ world, nav, rand = Math.random, onSpawn = null, onRemove = null }) {
    this.world = world;
    this.nav = nav;
    this.rand = rand;
    this.onSpawn = onSpawn;
    this.onRemove = onRemove;
    /** @type {Npc[]} */
    this.list = [];
    this.byId = new Map();
    this._anon = 0;
  }

  get(id) {
    return this.byId.get(id) ?? null;
  }

  clear() {
    for (const n of this.list) if (this.onRemove) this.onRemove(n);
    this.list.length = 0;
    this.byId.clear();
  }

  spawn({ id = null, kind, speaker = null, at, yaw = 0, pray = false }) {
    if (id && this.byId.has(id)) this.remove(id);
    const npcId = id ?? `npc${++this._anon}`;
    const [x, y, z] = at;
    const npc = new Npc({ world: this.world, nav: this.nav, id: npcId, kind, speaker, position: new Vector3(x, y, z), yaw, pray, rand: this.rand });
    this.list.push(npc);
    this.byId.set(npcId, npc);
    if (this.onSpawn) this.onSpawn(npc);
    return npc;
  }

  remove(id) {
    const n = this.byId.get(id);
    if (!n) return;
    this.byId.delete(id);
    this.list.splice(this.list.indexOf(n), 1);
    if (this.onRemove) this.onRemove(n);
  }

  /** Spawns an ambient group from mission data (see mission1.js `groups`). */
  populate(def) {
    if (Array.isArray(def)) {
      for (const d of def) {
        if (d.route) {
          const [x, z] = d.route[0];
          const n = this.nav.nodeAt(x, z);
          const npc = this.spawn({ kind: d.kind, at: [x, n >= 0 ? this.nav.y[n] : 0, z], yaw: 0 });
          npc.setRoute({ points: d.route, speed: d.speed, loop: d.loop, pause: d.pause ?? 2 });
          // Stagger the loops so crossers don't move in lockstep.
          npc._pause = this.rand() * 6;
        } else {
          this.spawn({ kind: d.kind, at: d.at, yaw: d.yaw ?? 0, pray: !!d.pray });
        }
      }
      return;
    }
    if (def.guide) {
      const g = def.guide;
      const [x, z] = g.route[0];
      const n = this.nav.nodeAt(x, z);
      const guide = this.spawn({ id: g.id, kind: g.kind, speaker: 'guide', at: [x, n >= 0 ? this.nav.y[n] : 0, z], yaw: 0 });
      guide.setRoute({ points: g.route, speed: g.speed, loop: g.loop, pause: g.pause });
      for (let i = 0; i < def.members; i++) {
        const row = Math.floor(i / 3);
        const col = (i % 3) - 1;
        const m = this.spawn({ kind: 'tourist', at: [x + col * 1.1, guide.position.y, z + 1.6 + row * 1.2], yaw: 0 });
        m.follow = { leader: guide, dx: col * 1.1 + (this.rand() - 0.5) * 0.4, dz: 1.8 + row * 1.2 + this.rand() * 0.4 };
      }
    }
  }

  update(dt, player, playerBody) {
    for (const n of this.list) n.update(dt, player);
    // Nobody walks through anybody (the player included).
    const minD = 0.6;
    const L = this.list;
    for (let i = 0; i < L.length; i++) {
      const a = L[i];
      const dx = playerBody.position.x - a.position.x;
      const dz = playerBody.position.z - a.position.z;
      const d = Math.hypot(dx, dz);
      if (d < minD && d > 1e-4 && Math.abs(playerBody.position.y - a.position.y) < 1.6) {
        playerBody.position.x += (dx / d) * (minD - d);
        playerBody.position.z += (dz / d) * (minD - d);
      }
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j];
        const ex = b.position.x - a.position.x;
        const ez = b.position.z - a.position.z;
        const ed = Math.hypot(ex, ez);
        if (ed < minD && ed > 1e-4) {
          const push = (minD - ed) / 2;
          b.position.x += (ex / ed) * push;
          b.position.z += (ez / ed) * push;
          a.position.x -= (ex / ed) * push;
          a.position.z -= (ez / ed) * push;
        }
      }
    }
  }

  /** The talkable NPC the player is looking at, within reach, or null. */
  talkTarget(eye, dir) {
    let best = null;
    let bestAngle = NPC.talkAngle;
    for (const n of this.list) {
      if (!n.talkable) continue;
      _t.set(n.position.x, n.position.y + 1.4, n.position.z).sub(eye);
      const d = _t.length();
      if (d > NPC.talkRange) continue;
      const angle = Math.acos(Math.min(1, _t.dot(dir) / d));
      if (angle < bestAngle) {
        bestAngle = angle;
        best = n;
      }
    }
    return best;
  }

  /** Closest NPC hit by a ray: { npc, distance } or null. */
  raycast(origin, dir, maxDist) {
    let best = null;
    for (const n of this.list) {
      const t = n.raycast(origin, dir, maxDist);
      if (t >= 0 && (!best || t < best.distance)) best = { npc: n, distance: t };
    }
    return best;
  }
}
