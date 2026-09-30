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
  constructor({ script, scene, world, nav, player, rifle, enemies, audio, hud, sky = null, view = null, grenades = null, difficulty = DIFFICULTY }) {
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
    this.grenades = grenades; // the player's GrenadeThrower (refilled at crates)
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
        if (line.radio) this.ambient.radioLine(line.duration);
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
        if (mode === 'ready' && this.rifle.mode !== 'ready' && !fast) this.ambient.play('charge');
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

  _crate(a) {
    if (a.remove) {
      this.crates.get(a.id)?.dispose();
      this.crates.delete(a.id);
      return;
    }
    const n = this.nav.nodeAt(a.at[0], a.at[1]);
    const crate = new AmmoCrate({ id: a.id, position: new Vector3(a.at[0], n >= 0 ? this.nav.y[n] : 0, a.at[1]), yaw: a.yaw ?? 0 });
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
  resupply() {
    const w = this.rifle.state;
    if (w) w.reserve = Math.max(w.reserve, this.difficulty.ammo.crateReserve);
    this.grenades?.refill();
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
    if (this.crateInReach(eye, dir)) return this.resupply();
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
    this.npcs.update(dt, playerInfo, p);
    for (const c of this.crates.values()) c.pushOut(p.position, p.cfg.radius);
    this.dialogue.update(dt);
    this.mission.update(dt);
  }

  /** The objective marker's world position, or null. */
  objectivePosition() {
    const t = this.objectiveTarget;
    if (!t || !this.objectiveText) return null;
    if (Array.isArray(t)) return this._targetPos.set(t[0], t[1] + 1.6, t[2]);
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
    for (const v of this.views.values()) v.update(dt);
    this.ambient.update(dt);
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
      crate ? STORY_UI.cratePrompt : talk ? (talk.frozen ? STORY_UI.shelterPrompt : `${STORY_UI.talkPrompt} ${this._speakerName(talk)}`) : null,
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
