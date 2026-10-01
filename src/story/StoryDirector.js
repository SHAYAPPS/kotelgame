import { Vector3 } from 'three';
import { AmbientAudio } from './AmbientAudio.js';
import { Dialogue } from './Dialogue.js';
import { Mission } from './Mission.js';
import { NpcManager } from './Npc.js';
import { NpcView } from './NpcView.js';
import { COUNTERS, SPEAKERS, STORY_UI } from './text.he.js';
import { AmmoCrate } from './AmmoCrate.js';
import { DIFFICULTY, attackerConfig, expandWave } from './difficulty.js';

const _t = new Vector3();
const KILL_LINES = { yonatan: 'down_1', noam: 'down_2', cmd: 'down_3' };
const THANKS = { man: ['civ_thanks_1', 'civ_thanks_3'], woman: ['civ_thanks_2', 'civ_thanks_4'] };
const GRENADE_SHOUTS = { yonatan: 'grenade_1', noam: 'grenade_2', cmd: 'grenade_3' };
const BOUND_TIME = 6; // seconds per bound (one group moves, the other covers)
const MOVE_LINES = { cmd: 'cover_1', yonatan: 'move_1', noam: 'move_2' };

/**
 * Runs a mission script against the game: implements the mission context (objectives,
 * dialogue, NPCs, weapon mode, sounds, fades, checkpoints), turns player behaviour into
 * tutorial events, handles talking (E), friendly fire and checkpoint restarts.
 */
export class StoryDirector {
  /**
   * @param {{ script, scene, world, nav, player, rifle, enemies, audio, hud, sky?, view? }} deps
   *   hud: StoryHud; player: PlayerController; enemies: EnemyManager;
   *   sky: SkyFx (interceptions, optional); view: PlayerCamera (camera shake, optional)
   */
  constructor({ script, scene, world, nav, player, rifle, enemies, audio, hud, sky = null, view = null, grenades = null, launcher = null, stats = null, difficulty = DIFFICULTY, voices = null }) {
    this.script = script;
    this.scene = scene;
    this.nav = nav;
    this.player = player;
    this.rifle = rifle;
    this.enemies = enemies;
    this.hud = hud;
    this.audio = audio;
    this.sky = sky;
    this.view = view;
    this.voices = voices; // VoicePlayer: recorded lines (optional, see Voice.js)
    this.grenades = grenades; // the player's GrenadeThrower (refilled at crates)
    this.launcher = launcher; // the player's Launcher (handed out by a crate in the final push)
    this.stats = stats; // () => { shots, hits, headshots, kills } for the mission-complete screen
    /** () => void: the launcher was just handed over (the game switches to it) */
    this.onLauncher = null;
    this.truck = null;
    this.truckDown = false;
    this.timeScale = 1; // < 1 during a slow-motion moment (the game reads it)
    this._slowmo = null;
    this.missionStart = 0;
    this._bound = null; // counterattack bounding: { squad, to: Vector3, timer, phase }
    this.difficulty = difficulty;
    /** @type {Map<string, AmmoCrate>} */
    this.crates = new Map();
    this._lastGrenadeShout = -Infinity;
    this.ambient = new AmbientAudio(audio);
    this.shelterSpots = (script.shelter?.spots ?? []).map(([x, z]) => {
      const n = nav.nodeAt(x, z);
      return new Vector3(x, n >= 0 ? nav.y[n] : 0, z);
    });
    this.time = 0;
    this._timed = []; // [{ t, fn }] game-time callbacks (spawns, callouts, volleys)
    this._pendingSpawns = 0;
    this._lastKillBark = -Infinity;
    this._lastOneCalled = false;
    this.objectiveCounter = null;
    if (sky) {
      // Interception flash: the boom arrives later (sound travels 343 m/s) with a shake.
      sky.onFlash = (distance, strength) => {
        this._after(distance / 343, () => {
          this.ambient.boom(distance, strength);
          if (this.view) this.view.addShake(Math.min(0.6, strength * 90 / Math.max(distance, 90)));
        });
      };
    }
    if (enemies) {
      enemies.onEnemyKilled = (enemy, killer) => this._onKill(enemy, killer);
      enemies.onGrenadeThrown = (g) => this._onEnemyGrenade(g);
    }
    this.views = new Map();
    this.npcs = new NpcManager({
      world,
      nav,
      onSpawn: (npc) => {
        const v = new NpcView(npc);
        this.views.set(npc, v);
        scene.add(v.root);
      },
      onRemove: (npc) => {
        this.views.get(npc)?.dispose();
        this.views.delete(npc);
      },
    });
    this.dialogue = new Dialogue({
      onLine: (line) => {
        // A recording if the line has one (the subtitle stays up as long as it plays), else
        // the generated radio voice for radio lines. The speaker's mouth follows either.
        const npc = line.radio ? null : this.npcs.list.find((n) => n.speaker === line.speaker) ?? null;
        const rec = this.voices?.play(line.id, npc ? npc.position : null, { radio: line.radio }) ?? null;
        if (rec) line.duration = Math.max(line.duration, rec.duration + 0.3);
        else if (line.radio) this.ambient.radioLine(line.duration);
        if (npc) npc.speech = { text: line.text, duration: line.duration, level: rec ? rec.level : null, to: line.to };
      },
    });

    this.objectiveText = null;
    this.objectiveTarget = null; // [x, y, z] | { npc }
    this.fade = 1;
    this.fadeTarget = 1;
    this.fadeSpeed = 1;
    this.started = false;
    this.failed = null;
    this._moved = 0;
    this._sprintTime = 0;
    this._lastPos = new Vector3();
    this._targetPos = new Vector3();

    this.mission = new Mission(script, this._context());
    rifle.onMagCheck = () => this.mission.notify('action:magCheck');
  }

  _context() {
    return {
      reset: () => {
        for (const n of this.npcs.list) if (n.brain) this.enemies.removeFriendly?.(n.brain);
        this.enemies.clearHostiles?.();
        this.truck = null;
        this.truckDown = false;
        this._bound = null;
        this._slowmo = null;
        this.timeScale = 1;
        this.hud.hideStats?.();
        for (const c of this.crates.values()) c.dispose();
        this.crates.clear();
        this._timed.length = 0;
        this._pendingSpawns = 0;
        this._lastOneCalled = false;
        this.objectiveCounter = null;
        this.ambient.set({ siren: 0, panic: false });
        if (this.sky) this.sky.setBarrage(0);
        this.npcs.clear();
        this.dialogue.clear();
        this.hud.setHint(null);
        this.hud.hideCard();
        this.hud.hideFailed();
        this.objectiveText = null;
        this.objectiveTarget = null;
        this.hud.setObjective(null);
        this.rifle.mode = 'ready';
        this.failed = null;
      },
      playerDistance: (x, z) => Math.hypot(this.player.position.x - x, this.player.position.z - z),
      enemiesAlive: () => this.enemiesLeft,
      civiliansOutside: () => this.npcs.civiliansOutside,
      truckDestroyed: () => this.truckDown,
      hasLauncher: () => !!this.launcher?.owned,
      hostilesNear: (x, z, r) => {
        let n = 0;
        for (const e of this.enemies.enemies) if (e.alive && Math.hypot(e.position.x - x, e.position.z - z) < r) n++;
        return n;
      },
      truck: (a) => this._spawnTruck(a),
      arm: (a) => {
        if (a.launcher && this.launcher && !this.launcher.owned) this.launcher.give(this.difficulty.rockets.start);
      },
      slowmo: (a) => {
        this._slowmo = { scale: a.scale, time: a.time, left: a.time };
      },
      retreat: (a) => this._retreat(a.to),
      bounding: (a) => this._setBounding(a),
      stats: (a) => {
        if (a.hide) return this.hud.hideStats?.();
        const st = this.stats ? this.stats() : { shots: 0, hits: 0, headshots: 0, kills: 0 };
        this.hud.showStats?.({ ...st, time: this.time - this.missionStart });
      },
      dialogueIdle: () => this.dialogue.idle,
      npcArrived: (id) => this.npcs.get(id)?.arrived ?? true,
      objective: (text, target, fast, counter) => {
        this.objectiveText = text;
        this.objectiveTarget = target;
        this.objectiveCounter = counter;
        this.hud.setObjective(text);
        if (text && !fast) this.ambient.play('chime');
      },
      hint: (id) => this.hud.setHint(id),
      dialogue: (lines, interrupt) => this.dialogue.play(lines, { interrupt }),
      npc: (a, fast) => this._npcAction(a, fast),
      populate: (group) => this.npcs.populate(this.script.groups[group]),
      weapon: (mode, fast) => {
        if (mode === 'ready' && this.rifle.mode !== 'ready' && !fast) {
          this.ambient.play('charge');
          this.rifle.charge?.();
        }
        this.rifle.mode = mode;
      },
      sound: (id, at) => (id === 'gunfire' ? this._volley(at) : this.ambient.play(id)),
      sky: (level) => this.sky?.setBarrage(level),
      civilians: (what, fast) => this._civilians(what, fast),
      combat: (a) => this._combat(a),
      wave: (a) => this._wave(a),
      crate: (a) => this._crate(a),
      ambience: (a) => this.ambient.set(a),
      fade: (to, time) => {
        this.fadeTarget = to;
        this.fadeSpeed = 1 / Math.max(0.05, time);
      },
      title: (card) => this.hud.showCard(card, 6),
      endCard: (card) => this.hud.showCard(card, 1e9),
      checkpoint: (at, yaw, fast) => {
        this.player.spawnPoint.set(at[0], at[1], at[2]);
        this.player.spawnYaw = yaw;
        // No toast for the starting checkpoint (it would sit on the title card).
        if (!fast && this.mission.index > 0) this.hud.flashCheckpoint();
      },
    };
  }

  _npcAction(a, fast) {
    if (a.spawn) {
      const [x, y, z, yaw = 0] = a.spawn.at;
      this.npcs.spawn({ id: a.id, kind: a.spawn.kind, speaker: a.spawn.speaker, at: [x, y, z], yaw });
      return;
    }
    const npc = this.npcs.get(a.id);
    if (!npc) throw new Error(`Mission refers to unknown NPC "${a.id}"`);
    if (a.talkable !== undefined) npc.talkable = a.talkable;
    if (a.escort !== undefined) {
      npc.escort = a.escort ?? 0;
      npc.route = null;
      npc.arrived = true;
      if (fast && npc.escort > 0) {
        // Fast-forward: already next to the player's restart point.
        const sp = this.player.spawnPoint;
        const k = this.npcs.list.filter((n) => n.escort > 0).indexOf(npc);
        const ang = k * 2.1 + 0.6;
        npc.place(sp.x + Math.cos(ang) * 2.5, sp.y, sp.z + Math.sin(ang) * 2.5, 0);
      }
    }
    if (a.face === 'player') npc.faceTarget = 'player';
    if (a.place) npc.place(...a.place);
    if (a.route) {
      if (fast) {
        const end = npc.routeEnd(a.route);
        npc.place(end.x, end.y, end.z, a.route.face ?? npc.facing);
        if (a.route.face !== undefined) npc.faceYaw = a.route.face;
      } else {
        npc.setRoute(a.route);
      }
    }
  }

  /** Hostiles alive plus the ones still due to spawn. */
  get enemiesLeft() {
    let n = this._pendingSpawns;
    for (const e of this.enemies.enemies) if (e.alive) n++;
    return n;
  }

  _after(seconds, fn) {
    this._timed.push({ t: this.time + seconds, fn });
  }

  _civilians(what, fast) {
    const spots = this.shelterSpots;
    if (what === 'panic') this.npcs.panic(spots);
    else if (what === 'emerge') this.npcs.emerge(this.script.shelter.emerge, fast);
    else if (what === 'runAll') {
      if (fast) this.npcs.shelterAll(spots);
      else this.npcs.runAll(spots);
    } else throw new Error(`Unknown civilians action "${what}"`);
  }

  /** Squad members switch between story NPC behaviour and the combat AI. */
  _combat(a) {
    for (const id of a.squad) {
      const npc = this.npcs.get(id);
      if (!npc) throw new Error(`Mission refers to unknown NPC "${id}"`);
      if (a.on && !npc.brain) {
        npc.escort = 0;
        npc.route = null;
        npc.arrived = true;
        npc.faceTarget = null;
        npc.brain = this.enemies.addFriendly(npc.body, npc.facing);
        if (a.threat) npc.brain.engage(_t.set(a.threat[0], a.threat[1], a.threat[2]));
      } else if (!a.on && npc.brain) {
        this.enemies.removeFriendly(npc.brain);
        npc.brain = null;
        npc.route = null;
        npc.arrived = true;
      }
    }
  }

  /**
   * Scripted attackers (a wave from difficulty.js): spawn on a timer, already fighting,
   * each with its role's AI; radio callouts when the first of a spawn group appears.
   */
  _wave(a) {
    const d = this.difficulty;
    const groups = d.waves[a.wave];
    if (!groups) throw new Error(`Unknown wave "${a.wave}"`);
    const called = new Set();
    const floor = ([x, z]) => {
      const n = this.nav.nodeAt(x, z);
      return new Vector3(x, n >= 0 ? this.nav.y[n] : 0, z);
    };
    for (const sp of expandWave(groups, d)) {
      this._pendingSpawns++;
      this._after(sp.delay, () => {
        this._pendingSpawns--;
        const pos = floor(sp.at);
        const p = this.player.position;
        const yaw = Math.atan2(-(p.x - pos.x), -(p.z - pos.z));
        const via = sp.via ? sp.via.map(floor) : null;
        this.enemies.spawnAttacker(pos, yaw, p, attackerConfig(sp.role, d), via);
        const c = a.callouts?.[sp.from];
        if (c && !called.has(sp.from)) {
          called.add(sp.from);
          this._after(c.delay ?? 2, () => this.dialogue.play(c.lines));
        }
      });
    }
  }

  /** The armed pickup (`ensure`: only if there isn't one yet; it then starts parked). */
  _spawnTruck(a) {
    if (a.ensure && (this.truck || this.truckDown)) return;
    const cfg = this.difficulty.truck;
    const path = cfg.path.map(([x, z]) => {
      const n = this.nav.nodeAt(x, z);
      return new Vector3(x, n >= 0 ? this.nav.y[n] : 0, z);
    });
    const spawn = () => {
      this._pendingSpawns = Math.max(0, this._pendingSpawns - 1);
      this.truck = this.enemies.spawnTruck(cfg, a.ensure ? path.slice(-2) : path, this.player.position);
    };
    this._pendingSpawns++;
    if (a.ensure || !a.delay) spawn();
    else this._after(a.delay, spawn);
  }

  /** The attack breaks: everyone left falls back to the nearest post and holds it. */
  _retreat(lists) {
    const posts = lists.flatMap((l) => this.difficulty.spawns[l]);
    const defender = this.difficulty.roles.defender;
    for (const e of this.enemies.enemies) {
      if (!e.alive || e.isVehicle) continue;
      let best = posts[0];
      let bestD = Infinity;
      for (const p of posts) {
        const d = Math.hypot(p[0] - e.position.x, p[1] - e.position.z);
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      }
      const n = this.nav.nodeAt(best[0], best[1]);
      e.via = [new Vector3(best[0], n >= 0 ? this.nav.y[n] : 0, best[1])];
      Object.assign(e.cfg, { rusher: false, assault: false, suppress: false }, defender);
      if (e.coverPoint) e.coverPoint.owner = null;
      e.coverPoint = null;
    }
  }

  /**
   * Counterattack: the squad advances in bounds toward `to`. One group moves to cover
   * ahead of the player while the other holds and covers; they swap every few seconds.
   */
  _setBounding(a) {
    for (const id of a.squad) {
      const b = this.npcs.get(id)?.brain;
      if (!b) continue;
      b.anchorOverride = null;
      b.anchorRadius = null;
      b.holdPosition = false;
    }
    if (a.off) {
      this._bound = null;
      return;
    }
    this._bound = { squad: a.squad, to: new Vector3(a.to[0], a.to[1], a.to[2]), timer: 0, phase: 0, anchors: new Map() };
  }

  _updateBounding(dt) {
    const b = this._bound;
    if (!b) return;
    b.timer -= dt;
    const p = this.player.position;
    const groups = [[b.squad[0]], b.squad.slice(1)]; // the commander, then the other two
    if (b.timer <= 0) {
      b.timer = BOUND_TIME;
      b.phase = 1 - b.phase;
      const movers = groups[b.phase];
      // "Moving!" from a mover, "covering!" from the others.
      const line = MOVE_LINES[movers[0]];
      if (line && b.phase === 1) this.dialogue.bark(line);
      else if (b.phase === 0) this.dialogue.bark('cover_2');
      for (const id of movers) this.npcs.get(id)?.brain?.relocate();
    }
    // Movers: cover up to ~9 m ahead of the player toward the objective.
    const dx = b.to.x - p.x;
    const dz = b.to.z - p.z;
    const d = Math.hypot(dx, dz);
    const ahead = Math.min(9, d);
    groups.forEach((g, gi) => {
      for (const id of g) {
        const br = this.npcs.get(id)?.brain;
        if (!br) continue;
        if (gi === b.phase) {
          let a = b.anchors.get(id);
          if (!a) b.anchors.set(id, (a = new Vector3()));
          a.set(p.x + (d > 0 ? (dx / d) * ahead : 0), p.y, p.z + (d > 0 ? (dz / d) * ahead : 0));
          br.anchorOverride = a;
          br.anchorRadius = 7;
          br.holdPosition = false;
        } else {
          br.holdPosition = true;
          br.anchorOverride = null;
          br.anchorRadius = 24; // don't get pulled out of cover by the player moving
        }
      }
    });
  }

  _crate(a) {
    if (a.remove) {
      this.crates.get(a.id)?.dispose();
      this.crates.delete(a.id);
      return;
    }
    const n = this.nav.nodeAt(a.at[0], a.at[1]);
    const crate = new AmmoCrate({ id: a.id, position: new Vector3(a.at[0], n >= 0 ? this.nav.y[n] : 0, a.at[1]), yaw: a.yaw ?? 0 });
    crate.launcher = !!a.launcher;
    this.crates.get(a.id)?.dispose();
    this.crates.set(a.id, crate);
    if (this.scene.isObject3D) this.scene.add(crate.view());
  }

  /** The crate the player is looking at within reach, or null. */
  crateInReach(eye, dir) {
    for (const c of this.crates.values()) if (c.inReach(eye, dir)) return c;
    return null;
  }

  /** E at a crate: full reserve and grenades. */
  resupply(crate = null) {
    const w = this.rifle.state;
    if (w) w.reserve = Math.max(w.reserve, this.difficulty.ammo.crateReserve);
    this.grenades?.refill();
    const L = this.launcher;
    if (L && crate?.launcher && !L.owned) {
      L.give(this.difficulty.rockets.start);
      if (this.onLauncher) this.onLauncher();
      this.mission.notify('action:launcher');
    } else if (L?.owned) {
      // Top the rockets back up.
      const have = L.state.ammo + L.state.reserve;
      if (have < this.difficulty.rockets.crate) L.give(this.difficulty.rockets.crate - have);
    }
    this.ambient.play('resupply');
    this.hud.flashToast?.(STORY_UI.resupplied);
    this.mission.notify('action:resupply');
  }

  /** An enemy threw a grenade: the teammate nearest to where it's going shouts. */
  _onEnemyGrenade(g) {
    if (this.time - this._lastGrenadeShout < 2.5) return;
    const p = this.player.position;
    // Where it will land, roughly: close enough to the player or the squad to matter.
    let best = null;
    let bestD = Infinity;
    for (const id of Object.keys(GRENADE_SHOUTS)) {
      const n = this.npcs.get(id);
      if (!n) continue;
      const dd = Math.hypot(n.position.x - p.x, n.position.z - p.z);
      if (dd < bestD) {
        bestD = dd;
        best = id;
      }
    }
    if (!best) return;
    this._lastGrenadeShout = this.time;
    this.dialogue.bark(GRENADE_SHOUTS[best], { next: true });
  }

  /** A burst of gunfire somewhere (heard before the attackers are seen). */
  _volley(at) {
    const p = new Vector3(at[0], at[1], at[2]);
    let t = 0;
    for (let burst = 0; burst < 4; burst++) {
      const n = 3 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) {
        this._after(t, () => this.audio.shotAt?.(p));
        t += 0.09 + Math.random() * 0.03;
      }
      t += 0.3 + Math.random() * 0.6;
    }
  }

  _onKill(enemy, killer) {
    if (enemy.isVehicle) {
      this.truckDown = true;
      return;
    }
    const left = this.enemiesLeft;
    if (left === 0) return;
    if (left === 1 && !this._lastOneCalled) {
      this._lastOneCalled = true;
      this.dialogue.bark('last_one');
      return;
    }
    if (this.time - this._lastKillBark < 3) return;
    let line = null;
    if (killer && killer.faction === 'friendly') {
      const npc = this.npcs.list.find((n) => n.brain === killer);
      line = npc && KILL_LINES[npc.id];
    } else if (Math.random() < 0.6) {
      line = Math.random() < 0.5 ? 'down_player_1' : 'down_player_2';
    }
    if (line && this.dialogue.bark(line)) this._lastKillBark = this.time;
  }

  get steps() {
    return this.script.steps;
  }

  get stepIndex() {
    return this.mission.index;
  }

  /** First activation: start the mission (fade in, title card). */
  start() {
    if (this.started) return;
    this.started = true;
    this.missionStart = this.time;
    this.fade = 1;
    this.mission.start();
    this.player.respawn();
  }

  /** Dev tool / checkpoint restart: jump to a step with the world set up for it. */
  jumpTo(index) {
    this.started = true;
    // Clear the screen first: the step being entered may start its own fade.
    this.fade = 0;
    this.fadeTarget = 0;
    this.mission.jumpTo(index);
    this.player.respawn();
  }

  /** Chapter select: start at a step (step 0 plays the opening fade-in and title). */
  startAt(index) {
    this.missionStart = this.time;
    if (index > 0) return this.jumpTo(index);
    this.started = true;
    this.fade = 1;
    this.fadeTarget = 1;
    this.mission.jumpTo(0);
    this.player.respawn();
  }

  restartFromCheckpoint() {
    this.jumpTo(this.mission.checkpointIndex);
  }

  /** An NPC was shot: friendly fire fails the mission. */
  friendlyFire(npc) {
    if (this.failed) return;
    this.failed = npc.isTeammate ? STORY_UI.failedTeammate : STORY_UI.failedCivilian;
    this.mission.fail('friendlyFire');
    this.hud.showFailed(this.failed);
  }

  /** E pressed. */
  interact(eye, dir) {
    const crate = this.crateInReach(eye, dir);
    if (crate) return this.resupply(crate);
    const npc = this.npcs.talkTarget(eye, dir);
    if (!npc) return;
    if (npc.frozen) {
      // Snap a frozen civilian out of it: off to the shelter.
      npc.flee(npc.shelterSpot ?? this.shelterSpots[0], 0.25);
      const lines = npc.kind === 'worshipperWoman' ? THANKS.woman : THANKS.man;
      this.dialogue.bark(lines[Math.floor(Math.random() * lines.length)], { next: true });
      this.mission.notify('action:sendCivilian');
      return;
    }
    npc.faceTarget = 'player';
    this.mission.notify(`talk:${npc.id}`);
  }

  /** Fixed step. */
  update(dt, playerInfo) {
    if (!this.started) return;
    // Tutorial events from what the player does.
    const p = this.player;
    this._moved += Math.hypot(p.position.x - this._lastPos.x, p.position.z - this._lastPos.z);
    this._lastPos.copy(p.position);
    if (this._moved > 3) this.mission.notify('action:move');
    this._sprintTime = p.sprinting && p.horizontalSpeed > 4 ? this._sprintTime + dt : 0;
    if (this._sprintTime > 0.8) this.mission.notify('action:sprint');
    if (p.crouched) this.mission.notify('action:crouch');

    this.time += dt;
    if (this.sky) this.sky.update(dt);
    const due = this._timed;
    for (let i = 0; i < due.length; i++) {
      if (due[i].t > this.time) continue;
      const { fn } = due[i];
      due.splice(i--, 1);
      fn();
    }
    this._updateBounding(dt);
    this.npcs.update(dt, playerInfo, p);
    for (const c of this.crates.values()) c.pushOut(p.position, p.cfg.radius);
    this.dialogue.update(dt);
    const line = this.dialogue.current;
    for (const n of this.npcs.list) {
      n.speaking = !!(line && n.speaker && line.speaker === n.speaker && !line.radio);
      if (!n.speaking) n.speech = null;
    }
    this.mission.update(dt);
  }

  /**
   * Who looks at whom while someone talks: the speaker at the one addressed (the line's `to`,
   * else the player when near, else the nearest person), people near the speaker at him.
   * Nobody busy looks: fighting, praying, frozen, fleeing.
   */
  _updateLooks(eye) {
    const list = this.npcs.list;
    let speaker = null;
    for (const n of list) {
      n.headPoint.set(n.position.x, n.position.y + (n.body.crouched ? 1.1 : 1.6), n.position.z);
      if (n.speaking) speaker = n;
    }
    const line = this.dialogue.current;
    for (const n of list) {
      n.lookAt = null;
      if (n.brain || n.pray || n.frozen || n.fleeing || n.panicking) continue;
      if (n === speaker) {
        const to = line?.to ? this.npcs.get(line.to) : null;
        if (to) n.lookAt = to.headPoint;
        else if (eye && n.position.distanceTo(eye) < 14) n.lookAt = eye;
        else {
          let best = 8;
          for (const o of list) {
            const d = o === n || o.pray ? Infinity : o.position.distanceTo(n.position);
            if (d < best) {
              best = d;
              n.lookAt = o.headPoint;
            }
          }
        }
      } else if (speaker && n.position.distanceTo(speaker.position) < 7) n.lookAt = speaker.headPoint;
      else if (n.chat) {
        // Small talk: the talker looks at one of the others, the others at the talker.
        const g = n.chat;
        const other = n === g.talker ? g.listener : g.talker;
        if (other && other !== n) n.lookAt = other.headPoint;
      }
    }
  }

  /** The objective marker's world position, or null. */
  objectivePosition() {
    const t = this.objectiveTarget;
    if (!t || !this.objectiveText) return null;
    if (Array.isArray(t)) return this._targetPos.set(t[0], t[1] + 1.6, t[2]);
    if (t.truck) {
      const tr = this.truck;
      return tr && tr.alive ? this._targetPos.set(tr.position.x, tr.position.y + 3.2, tr.position.z) : null;
    }
    if (t.frozen) {
      const f = this.npcs.nearestFrozen(this.player.position);
      if (f) return this._targetPos.set(f.position.x, f.position.y + 2, f.position.z);
      return t.fallback ? this._targetPos.set(t.fallback[0], t.fallback[1] + 1.6, t.fallback[2]) : null;
    }
    const npc = this.npcs.get(t.npc);
    return npc ? this._targetPos.set(npc.position.x, npc.position.y + 2.2, npc.position.z) : null;
  }

  /** Per rendered frame. */
  frameUpdate(dt, camera, eye, dir) {
    this._updateLooks(eye);
    for (const v of this.views.values()) v.update(dt);
    this.ambient.update(dt);
    // Slow motion: hold the slow scale, then ease back to normal over the last 0.5 s (real time).
    const sm = this._slowmo;
    if (sm) {
      sm.left -= dt;
      this.timeScale = sm.left > 0.5 ? sm.scale : sm.scale + (1 - sm.scale) * (1 - Math.max(0, sm.left) / 0.5);
      if (sm.left <= 0) {
        this._slowmo = null;
        this.timeScale = 1;
      }
    }
    if (this.sky) this.sky.frame(camera);
    if (this.fade !== this.fadeTarget) {
      const step = this.fadeSpeed * dt;
      this.fade = this.fade < this.fadeTarget ? Math.min(this.fadeTarget, this.fade + step) : Math.max(this.fadeTarget, this.fade - step);
    }
    this.hud.setFade(this.started ? this.fade : 0);
    this.hud.setSubtitle(this.dialogue.current);
    const w = this.rifle.state;
    this.hud.setLowAmmo?.(this.crates.size > 0 && !!w && w.ammo + w.reserve <= 45);
    const crate = this.crateInReach(eye, dir);
    const talk = crate ? null : this.npcs.talkTarget(eye, dir);
    this.hud.setPrompt(
      crate ? (crate.launcher && !this.launcher?.owned ? STORY_UI.crateLauncherPrompt : STORY_UI.cratePrompt) : talk ? (talk.frozen ? STORY_UI.shelterPrompt : `${STORY_UI.talkPrompt} ${this._speakerName(talk)}`) : null,
    );
    const counter = this.objectiveCounter;
    this.hud.setObjectiveCount(
      counter && this.objectiveText ? COUNTERS[counter] : null,
      counter === 'civilians' ? this.npcs.civiliansOutside : counter === 'enemies' ? this.enemiesLeft : 0,
    );
    this.hud.update(dt, this.objectivePosition(), camera, this.player.position);
  }

  _speakerName(npc) {
    const sp = npc.speaker && SPEAKERS[npc.speaker];
    return sp ? sp.name : npc.speaker ?? '';
  }

  /** Closest NPC along a ray for friendly-fire hit tests. */
  raycast(origin, dir, maxDist) {
    const h = this.npcs.raycast(origin, dir, maxDist);
    if (h) _t.copy(origin).addScaledVector(dir, h.distance);
    return h;
  }
}
