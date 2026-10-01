import { MathUtils, Vector3 } from 'three';
import { PLAYER } from '../player/config.js';
import { PlayerController } from '../player/PlayerController.js';
import { raySphere, rayCapsule } from '../ai/hitZones.js';
import { modelHitTest } from '../ai/Enemy.js';
import { stairsAt } from '../world/stairs.js';
import { BEHAVIORS, PEOPLE } from './people.js';

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
  runSpeed: 3.6, // fleeing to shelter
  // Walking a flight of stairs people slow down (m/s across the flight); runners don't.
  stairUpSpeed: 0.6,
  stairDownSpeed: 0.72,
  settle: 0.6, // s standing still before the physics sleeps
  // Small talk: each turn lasts this long (s), now and then a pause with nobody talking.
  chatTurn: [1.6, 5.5],
  chatPause: 0.2,
};
const _stairs = { on: 0, dir: 1, zone: null };

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
    // Children are smaller (story/people.js): the body too.
    this.scale = PEOPLE[kind]?.scale ?? 1;
    // walkSpeed is the cap (running to shelter); routes scale it down to walking pace.
    this.body = new PlayerController(world, { ...PLAYER, radius: NPC.radius * Math.min(1, this.scale + 0.15), standHeight: PLAYER.standHeight * this.scale, walkSpeed: 4.2 });
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

    // Emergency behaviour
    this.brain = null; // combat AI (ai/Enemy.js, friendly faction) driving this body
    this.speech = null; // the line being said: { text, duration, level?, to } (StoryDirector)
    this.lookAt = null; // Vector3 to turn the head toward (someone talking / listening), or null
    this.headPoint = new Vector3(); // where others look at this one (StoryDirector)
    this.freezes = false; // a bystander who freezes when the sirens start
    this.frozen = false; // standing frozen: the player presses E to send them off
    this.fleeing = false;
    this.sheltered = false;
    this.shelterSpot = null; // Vector3
    this._fleeDelay = -1;
    this.emerged = false; // walked back out of the shelter after the battle
    this.escort = 0; // > 0: stay within this distance of the player (squad in an emergency)
    this._escortTimer = 0;
    this.speaking = false; // has the current dialogue line (the view plays talking)
    this.hitShape = null; // hit zones from the animated model (set by the view)
    // Small talk (an ambient group, NpcManager.updateChats): the group, and whether this one
    // is the one talking right now.
    this.chat = null;
    this.chatting = false;
    this._still = 0; // s standing still with nothing to do (the physics sleeps after a while)
    this._dodge = 0; // s left of a sidestep around an obstacle
    this._dodgeSide = rand() < 0.5 ? 1 : -1;
    // The Selichot night (story/people.js): what this person does on their own (`behavior`,
    // its state in `b`), a clip played standing (`act`: { clip, until }), sitting on a chair,
    // what they carry, their sex (the view sets it from the model), a special role.
    this.behavior = null;
    this.b = {};
    this.act = null;
    this.sit = false;
    this.prop = PEOPLE[kind]?.prop ?? null;
    this.sex = null;
    this.special = null;
    this.parent = null; // a child's parent (npc id)
    this.home = null; // { x, z, yaw }: where they stand (they step aside and come back)
    this.glancing = false;
    this.greeted = false;
    this.flash = 0; // a photo's flash (the view lights it)
    this.hold = 0; // s left standing still facing the player (talking with him)
    this.preset = null; // { id, outfit }: the character and outfit to build (a crowd member stepping in)
    this.wantSex = null; // 'm' | 'f': cast a model of that sex (a father, a mother)
  }

  /** Stops whatever they were doing on their own (an emergency). */
  stopBehavior() {
    this.behavior = null;
    this.act = null;
    this.sit = false;
    this.hold = 0;
    this.b = {};
  }

  /** Out of a chat group (sent somewhere, panicking...). */
  leaveChat() {
    const g = this.chat;
    if (g) {
      g.members.splice(g.members.indexOf(this), 1);
      if (g.talker === this) g.talker = null;
      if (g.listener === this) g.listener = null;
    }
    this.chat = null;
    this.chatting = false;
  }

  /** Reacting to the sirens, before running (the flee delay). */
  get panicking() {
    return this._fleeDelay >= 0;
  }

  /** Civilians count for the shelter objective; the squad does not. */
  get isCivilian() {
    return !this.isTeammate;
  }

  /** Runs for the shelter at the sirens (not the people on duty: police, the guard). */
  get evacuates() {
    return this.isCivilian && !PEOPLE[this.kind]?.stays;
  }

  /** Run to a shelter spot after `delay` seconds (panic reaction time). */
  flee(spot, delay = 0) {
    this.stopBehavior();
    this.leaveChat();
    this.shelterSpot = spot;
    this.follow = null;
    this.pray = false;
    this.frozen = false;
    this.talkable = false;
    this.body.wantCrouch = false;
    this.faceTarget = null;
    this._fleeDelay = delay;
    this.route = null;
    this.arrived = true;
  }

  /** Freeze in place (cowering) until the player sends them off. */
  freeze() {
    this.stopBehavior();
    this.leaveChat();
    this.follow = null;
    this.pray = false;
    this.route = null;
    this.arrived = true;
    this.frozen = true;
    this.talkable = true;
    this.body.wantCrouch = true;
  }

  /** Put straight into the shelter (fast-forwarding a mission). */
  shelterNow(spot) {
    this.shelterSpot = spot;
    this.follow = null;
    this.pray = false;
    this.frozen = false;
    this.talkable = false;
    this._fleeDelay = -1;
    this.fleeing = false;
    this.sheltered = true;
    this.body.wantCrouch = false;
    this.place(spot.x, spot.y, spot.z, Math.PI / 2);
  }

  get position() {
    return this.body.position;
  }

  get isTeammate() {
    return TEAMMATE_KINDS.has(this.kind);
  }

  place(x, y, z, yaw) {
    this._still = 0;
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
    this.leaveChat();
    this._still = 0;
    this.route = {
      points: route.points.map(([x, z]) => this._floor(x, z)),
      speed: route.speed ?? 1.4,
      leash: route.leash ?? 0,
      loop: !!route.loop,
      pause: route.pause ?? 0,
      face: route.face ?? null,
      backward: !!route.backward, // walking backwards (facing away from where they go)
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
    if (this.hitShape?.valid) {
      const h = modelHitTest(this.hitShape, p, NPC.headRadius, NPC.radius, origin, dir, maxDist);
      return h ? h.distance : -1;
    }
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
  update(dt, player, ctx = null) {
    this.time += dt;
    // Their own doings (notes in the wall, a photo, running around a parent...).
    if (this.act && this.time >= this.act.until) this.act = null;
    if (this.act?.flash && this.rand() < dt * 0.6) this.flash = 1;
    this.flash = Math.max(0, this.flash - dt * 6);
    if (this.hold > 0) {
      // Talking with the player: stand and face him (seated, only the head turns).
      this.hold -= dt;
      this.speed = 0;
      if (!this.sit) this._turnTo(Math.atan2(-(player.position.x - this.position.x), -(player.position.z - this.position.z)), dt);
      return;
    }
    if (this.behavior && ctx && !this.frozen && !this.fleeing && !this.sheltered && this._fleeDelay < 0) BEHAVIORS[this.behavior]?.(this, dt, ctx);
    if (this.sit) {
      // On a chair: no walking, no physics (the seat is a collision box).
      this.speed = 0;
      if (this.faceYaw !== null) this._turnTo(this.faceYaw, dt);
      return;
    }
    if (this.brain) {
      // The combat AI moves the body (EnemyManager steps it); just mirror it.
      this.facing = this.brain.facing;
      this.speed = this.body.horizontalSpeed;
      return;
    }
    if (this._fleeDelay >= 0) {
      this._fleeDelay -= dt;
      if (this._fleeDelay < 0) {
        const s = this.shelterSpot;
        this.setRoute({ points: [[s.x, s.z]], speed: NPC.runSpeed * (0.85 + this.rand() * 0.3), face: Math.PI / 2 });
        this.fleeing = true;
      }
    }
    if (this.fleeing && this.arrived) {
      this.fleeing = false;
      this.sheltered = true;
      // Out through an exit (not the shelter): gone from the plaza.
      if (this.exitOnArrival) this.exited = true;
    }
    if (this.escort > 0) this._updateEscort(dt, player);
    // Back in front of the wall: worshipers pray again.
    if (this.emerged && this.arrived && !this.pray && (this.kind === 'worshipper' || this.kind === 'worshipperWoman')) this.pray = true;
    if (this.sheltered && this.arrived && !this.route && this.escort === 0) {
      // Settled in the shelter: nothing moves them, so skip the physics (many of them).
      if (this.faceYaw !== null) this._turnTo(this.faceYaw, dt);
      this.speed = 0;
      return;
    }
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
          if (this._dodge > 0) {
            // Stepping around something the path runs into (a thin post, a knot of people).
            this._dodge -= dt;
            moveYaw += this._dodgeSide * 1.25;
          }
          this._stuck += dt;
          if (this._stuck > 2) {
            if (this.position.distanceTo(this._lastPos) < 0.3) {
              // Stuck off the walkable floor (pushed into a pit or through a gap in a crowd):
              // back onto the path. On the floor: a sidestep (the other way each time), then
              // find the way again.
              const node = this.nav.nodeAt(this.position.x, this.position.z);
              this._stuckTimes = (this._stuckTimes ?? 0) + 1;
              if (node < 0 || Math.abs(this.nav.y[node] - this.position.y) > 0.3 || this._stuckTimes > 3) {
                // Off the floor, or wedged (between chairs) for good: onto the next waypoint.
                this.body.spawnPoint.copy(wp);
                this.body.respawn();
                this._stuckTimes = 0;
              } else {
                this._dodgeSide = -this._dodgeSide;
                this._dodge = 0.7;
              }
              this._planLeg();
            } else this._stuckTimes = 0;
            this._stuck = 0;
            this._lastPos.copy(this.position);
          }
        }
      }
    }

    if (moveYaw !== null && speed < 2.3 && this.world.stairZones) {
      stairsAt(this.world.stairZones, this.position.x, this.position.z, -Math.sin(moveYaw), -Math.cos(moveYaw), _stairs, 0.25);
      if (_stairs.on) speed = Math.min(speed, _stairs.dir > 0 ? NPC.stairUpSpeed : NPC.stairDownSpeed);
    }
    if (moveYaw !== null && this.route?.backward) {
      // Backwards (away from the wall, still facing it).
      this.body.yaw = moveYaw + Math.PI;
      ctl.forward = -1;
      ctl.moveScale = MathUtils.clamp(speed / this.body.cfg.walkSpeed, 0.1, 1);
      this._turnTo(moveYaw + Math.PI, dt);
    } else if (moveYaw !== null) {
      this.body.yaw = moveYaw;
      ctl.forward = 1;
      ctl.moveScale = MathUtils.clamp(speed / this.body.cfg.walkSpeed, 0.1, 1);
      this._turnTo(moveYaw, dt);
    } else if (this.faceTarget === 'player') {
      this._turnTo(Math.atan2(-(player.position.x - this.position.x), -(player.position.z - this.position.z)), dt);
    } else if (this.faceYaw !== null) {
      this._turnTo(this.faceYaw, dt);
    }
    // Standing still with nothing to do (praying, waiting, chatting, frozen): once settled the
    // physics sleeps, so a big crowd costs next to nothing. A route, a placement or a push from
    // someone walking by wakes it (NpcManager.update).
    if (moveYaw === null && this.body.grounded && this.body.horizontalSpeed < 0.03) this._still += dt;
    else this._still = 0;
    if (this._still > NPC.settle) {
      this.speed = 0;
      return;
    }
    this.body.update(dt, ctl);
    this.speed = this.body.horizontalSpeed;
  }

  /** Keep up with the player: run when far behind, stop and watch when close. */
  _updateEscort(dt, player) {
    const p = player.position;
    const d = Math.hypot(p.x - this.position.x, p.z - this.position.z);
    this._escortTimer -= dt;
    if (d > this.escort && this._escortTimer <= 0) {
      this._escortTimer = 1.2;
      const n = this.nav.nodeAt(p.x, p.z);
      if (n >= 0) this.setRoute({ points: [[p.x, p.z]], speed: d > 14 ? NPC.runSpeed : 2.2 });
    } else if (d < this.escort * 0.6 && this.route) {
      this.route = null;
      this.arrived = true;
    }
    if (!this.route || this.arrived) this.faceTarget = 'player';
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
// What a mission's person definition may set on the NPC (see NpcManager.spawn).
const SPAWN_EXTRAS = ['prop', 'behavior', 'special', 'parent', 'sit', 'freezes', 'talkable', 'preset', 'sex'];
const personExtras = (d) => {
  const o = {};
  for (const k of SPAWN_EXTRAS) if (d[k] !== undefined) o[k] = d[k];
  return o;
};

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
    this.chats = []; // small-talk groups: { members, talker, listener, timer }
    // What behaviors see (story/people.js): the dice, everyone, a way to speak up.
    this.onBark = null;
    this.chatty = false; // every calm civilian can be talked to (StoryDirector: the quiet part)
    this._ctx = { rand, npcs: this, bark: (npc, what) => this.onBark?.(npc, what) };
  }

  get(id) {
    return this.byId.get(id) ?? null;
  }

  /** Everyone (for behaviors that look around). */
  get people() {
    return this.list;
  }

  clear() {
    for (const n of this.list) if (this.onRemove) this.onRemove(n);
    this.list.length = 0;
    this.byId.clear();
    this.chats.length = 0;
  }

  /**
   * @param {{ id?: string, kind: string, speaker?: string, at: number[], yaw?: number, pray?: boolean,
   *   prop?: string, behavior?: string, special?: string, parent?: string, sit?: boolean,
   *   freezes?: boolean, talkable?: boolean }} o the extras are set before the view is made
   */
  spawn({ id = null, kind, speaker = null, at, yaw = 0, pray = false, ...extra }) {
    if (id && this.byId.has(id)) this.remove(id);
    const npcId = id ?? `npc${++this._anon}`;
    const [x, y, z] = at;
    const npc = new Npc({ world: this.world, nav: this.nav, id: npcId, kind, speaker, position: new Vector3(x, y, z), yaw, pray, rand: this.rand });
    for (const k of SPAWN_EXTRAS) if (extra[k] !== undefined && extra[k] !== null) npc[k] = extra[k];
    if (extra.sex) npc.wantSex = extra.sex; // (the view casts a model of that sex)
    if (npc.behavior || npc.sit) {
      npc.home = { x, z, yaw };
      npc.faceYaw = yaw;
    }
    this.list.push(npc);
    this.byId.set(npcId, npc);
    if (this.onSpawn) this.onSpawn(npc);
    return npc;
  }

  remove(id) {
    const n = this.byId.get(id);
    if (!n) return;
    n.leaveChat();
    this.byId.delete(id);
    this.list.splice(this.list.indexOf(n), 1);
    if (this.onRemove) this.onRemove(n);
  }

  /** Spawns an ambient group from mission data (see mission1.js `groups`). */
  populate(def) {
    if (def.chats) {
      // Small talk: a few people around a spot, facing in, taking turns to talk.
      for (const g of def.chats) {
        const group = { members: [], talker: null, listener: null, timer: this.rand() * 2 };
        const [cx, cz] = g.at;
        const n = g.kinds.length;
        const turn = this.rand() * Math.PI * 2;
        for (let i = 0; i < n; i++) {
          const a = turn + (i / n) * Math.PI * 2 + (this.rand() - 0.5) * 0.5;
          const r = (g.radius ?? (n > 2 ? 0.8 : 0.6)) * (0.9 + this.rand() * 0.25);
          const x = cx + Math.sin(a) * r;
          const z = cz + Math.cos(a) * r;
          const node = this.nav.nodeAt(x, z);
          const npc = this.spawn({ kind: g.kinds[i], at: [x, node >= 0 ? this.nav.y[node] : 0, z], yaw: 0 });
          npc.faceYaw = Math.atan2(x - cx, z - cz); // yaw 0 looks down -Z: face the middle
          npc.facing = npc.faceYaw;
          npc.freezes = !!g.freezes;
          npc.chat = group;
          group.members.push(npc);
        }
        this.chats.push(group);
      }
      return;
    }
    if (Array.isArray(def)) {
      for (const d of def) {
        if (d.route) {
          const [x, z] = d.route[0];
          const n = this.nav.nodeAt(x, z);
          const npc = this.spawn({ ...personExtras(d), id: d.id, kind: d.kind, at: [x, n >= 0 ? this.nav.y[n] : 0, z], yaw: 0 });
          npc.setRoute({ points: d.route, speed: d.speed, loop: d.loop, pause: d.pause ?? 2 });
          // Stagger the loops so crossers don't move in lockstep.
          npc._pause = this.rand() * 6;
        } else {
          let at = d.at;
          if (at.length === 2) {
            const n = this.nav.nodeAt(at[0], at[1]);
            at = [at[0], n >= 0 ? this.nav.y[n] : 0, at[1]];
          }
          const npc = this.spawn({ ...personExtras(d), id: d.id, kind: d.kind, at, yaw: d.yaw ?? 0, pray: !!d.pray });
          npc.freezes = !!d.freezes;
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
        const m = this.spawn({ kind: def.memberKind ?? 'tourist', at: [x + col * 1.1, guide.position.y, z + 1.6 + row * 1.2], yaw: 0 });
        m.follow = { leader: guide, dx: col * 1.1 + (this.rand() - 0.5) * 0.4, dz: 1.8 + row * 1.2 + this.rand() * 0.4 };
      }
    }
  }

  /** Civilians still outside the shelter. */
  get civiliansOutside() {
    let n = 0;
    for (const c of this.list) if (c.evacuates && !c.sheltered) n++;
    return n;
  }

  /** Frozen civilian closest to a point, or null. */
  nearestFrozen(pos) {
    let best = null;
    let bestD = Infinity;
    for (const c of this.list) {
      if (!c.frozen) continue;
      const d = Math.hypot(c.position.x - pos.x, c.position.z - pos.z);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }

  /**
   * Sirens: every civilian runs for the shelter spots, or out through the nearest exit when
   * that is closer (staggered reactions, which also spreads the path searches over a few
   * seconds); bystanders freeze instead; people on duty stay and wave the others on.
   * @param {Vector3[]} spots @param {{ maxDelay?: number, exits?: number[][] }} o exits: [x, z]
   */
  panic(spots, { maxDelay = 2.5, exits = [] } = {}) {
    let k = 0;
    let cx = 0;
    let cz = 0;
    for (const s of spots) {
      cx += s.x / spots.length;
      cz += s.z / spots.length;
    }
    for (const c of this.list) {
      if (!c.isCivilian || c.sheltered || c.fleeing) continue;
      if (!c.evacuates) {
        // On duty: stay and wave people on toward the shelter.
        c.stopBehavior();
        c.leaveChat();
        c.act = { clip: 'wave', until: Infinity };
        continue;
      }
      // The shelter, unless an exit is a good deal nearer.
      let exit = null;
      let best = Math.hypot(c.position.x - cx, c.position.z - cz) * 0.7;
      for (const e of exits) {
        const d = Math.hypot(c.position.x - e[0], c.position.z - e[1]);
        if (d < best) {
          best = d;
          exit = e;
        }
      }
      let spot = spots[k++ % spots.length];
      if (exit && !c.freezes) {
        const n = this.nav.nodeAt(exit[0], exit[1]);
        spot = new Vector3(exit[0] + (this.rand() - 0.5) * 2, n >= 0 ? this.nav.y[n] : 0, exit[1] + (this.rand() - 0.5) * 2);
        c.exitOnArrival = true;
      }
      if (c.freezes) {
        c.shelterSpot = spot;
        c.freeze();
      } else c.flee(spot, 0.2 + this.rand() * maxDelay);
    }
  }

  /** Everyone still outside runs now (frozen ones included). */
  runAll(spots, { maxDelay = 1 } = {}) {
    let k = 0;
    for (const c of this.list) {
      if (!c.evacuates || c.sheltered) continue;
      const spot = c.shelterSpot ?? spots[k % spots.length];
      k++;
      if (!c.fleeing && c._fleeDelay < 0) c.flee(spot, this.rand() * maxDelay);
    }
  }

  /**
   * After the battle: civilians walk out of the shelter to spots in front of the wall.
   * Fast-forwarding puts them there directly.
   */
  emerge(spots, fast = false) {
    let k = 0;
    for (const c of this.list) {
      if (!c.evacuates) continue;
      const [x, z] = spots[k++ % spots.length];
      c.sheltered = false;
      c.fleeing = false;
      c.frozen = false;
      c.talkable = false;
      c._fleeDelay = -1;
      c.emerged = true;
      c.faceYaw = -Math.PI / 2; // facing the wall
      if (fast) {
        const n = this.nav.nodeAt(x, z);
        c.place(x, n >= 0 ? this.nav.y[n] : 0, z, -Math.PI / 2);
      } else {
        c.setRoute({ points: [[x, z]], speed: 0.9 + this.rand() * 0.4, face: -Math.PI / 2 });
        c._pause = this.rand() * 4; // they come out a few at a time
      }
    }
  }

  /** Fast-forward: every civilian is already in the shelter. */
  shelterAll(spots) {
    let k = 0;
    for (const c of this.list) if (c.evacuates) c.shelterNow(spots[k++ % spots.length]);
  }

  update(dt, player, playerBody) {
    for (const n of this.list) n.update(dt, player, this._ctx);
    // Out through an exit: gone.
    for (let i = this.list.length - 1; i >= 0; i--) if (this.list[i].exited) this.remove(this.list[i].id);
    this.updateChats(dt);
    // Nobody walks through anybody (the player included). Two sleeping bodies can't have
    // moved into each other; a push wakes a sleeper (its physics settles it again).
    const minD = 0.6;
    const L = this.list;
    const settle = NPC.settle;
    for (let i = 0; i < L.length; i++) {
      const a = L[i];
      const dx = playerBody.position.x - a.position.x;
      const dz = playerBody.position.z - a.position.z;
      const d = Math.hypot(dx, dz);
      if (d < minD && d > 1e-4 && Math.abs(playerBody.position.y - a.position.y) < 1.6) {
        playerBody.position.x += (dx / d) * (minD - d);
        playerBody.position.z += (dz / d) * (minD - d);
      }
      const aSleeps = a._still > settle;
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j];
        if (aSleeps && b._still > settle) continue;
        const ex = b.position.x - a.position.x;
        const ez = b.position.z - a.position.z;
        if (ex > minD || ex < -minD || ez > minD || ez < -minD) continue;
        const ed = Math.hypot(ex, ez);
        if (ed < minD && ed > 1e-4) {
          // Apart, but never off the walkable floor (into a pit, through a fence).
          const push = (minD - ed) / 2;
          const px = (ex / ed) * push;
          const pz = (ez / ed) * push;
          if (this.nav.nodeAt(b.position.x + px, b.position.z + pz) >= 0) {
            b.position.x += px;
            b.position.z += pz;
            b._still = 0;
          }
          if (this.nav.nodeAt(a.position.x - px, a.position.z - pz) >= 0) {
            a.position.x -= px;
            a.position.z -= pz;
            a._still = 0;
          }
        }
      }
    }
  }

  /**
   * Small talk: in each group one person talks for a few seconds, then another (now and then
   * a pause), the others listen. A group goes quiet while any of its people is busy.
   */
  updateChats(dt) {
    for (const g of this.chats) {
      const M = g.members;
      if (M.length < 2) {
        for (const m of M) m.chatting = false;
        continue;
      }
      g.timer -= dt;
      if (g.timer > 0) continue;
      const [a, b] = NPC.chatTurn;
      g.timer = a + this.rand() * (b - a);
      let next = null;
      if (this.rand() > NPC.chatPause || !g.talker) {
        // Someone else's turn (whoever spoke last rarely goes on).
        next = M[Math.floor(this.rand() * M.length) % M.length];
        if (next === g.talker && this.rand() < 0.75) next = M[(M.indexOf(next) + 1) % M.length];
      } else g.timer *= 0.4;
      g.talker = next;
      g.listener = next ? M[(M.indexOf(next) + 1 + Math.floor(this.rand() * (M.length - 1))) % M.length] : null;
      // (Someone talking with the player doesn't chat with the group meanwhile.)
      for (const m of M) m.chatting = m === next && !(m.hold > 0);
    }
  }

  /** The talkable NPC the player is looking at, within reach, or null. */
  talkTarget(eye, dir) {
    let best = null;
    let bestAngle = NPC.talkAngle;
    for (const n of this.list) {
      // Talkable: the story's (a mission flag), or anyone calm while `chatty` (the quiet part).
      if (!n.talkable && !(this.chatty && n.evacuates && !n.fleeing && !n.sheltered && n._fleeDelay < 0 && !n.screening)) continue;
      _t.set(n.position.x, n.position.y + n.scale * 1.4, n.position.z).sub(eye);
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
