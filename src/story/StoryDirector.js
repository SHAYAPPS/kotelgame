import { Vector3 } from 'three';
import { AmbientAudio } from './AmbientAudio.js';
import { Dialogue } from './Dialogue.js';
import { Mission } from './Mission.js';
import { NpcManager } from './Npc.js';
import { NpcView } from './NpcView.js';
import { SPEAKERS, STORY_UI } from './text.he.js';

const _t = new Vector3();

/**
 * Runs a mission script against the game: implements the mission context (objectives,
 * dialogue, NPCs, weapon mode, sounds, fades, checkpoints), turns player behaviour into
 * tutorial events, handles talking (E), friendly fire and checkpoint restarts.
 */
export class StoryDirector {
  /**
   * @param {{ script, scene, world, nav, player, rifle, enemies, audio, hud }} deps
   *   hud: StoryHud; player: PlayerController; enemies: EnemyManager
   */
  constructor({ script, scene, world, nav, player, rifle, enemies, audio, hud }) {
    this.script = script;
    this.scene = scene;
    this.player = player;
    this.rifle = rifle;
    this.enemies = enemies;
    this.hud = hud;
    this.ambient = new AmbientAudio(audio);
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
        if (line.radio) this.ambient.play('radioIn');
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
      enemiesAlive: () => this.enemies.enemies.filter((e) => e.alive).length,
      dialogueIdle: () => this.dialogue.idle,
      npcArrived: (id) => this.npcs.get(id)?.arrived ?? true,
      objective: (text, target, fast) => {
        this.objectiveText = text;
        this.objectiveTarget = target;
        this.hud.setObjective(text);
        if (text && !fast) this.ambient.play('chime');
      },
      hint: (id) => this.hud.setHint(id),
      dialogue: (lines, interrupt) => this.dialogue.play(lines, { interrupt }),
      npc: (a, fast) => this._npcAction(a, fast),
      populate: (group) => this.npcs.populate(this.script.groups[group]),
      weapon: (mode) => {
        this.rifle.mode = mode;
      },
      sound: (id) => this.ambient.play(id),
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
    const npc = this.npcs.talkTarget(eye, dir);
    if (!npc) return;
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

    this.npcs.update(dt, playerInfo, p);
    this.dialogue.update(dt);
    this.mission.update(dt);
  }

  /** The objective marker's world position, or null. */
  objectivePosition() {
    const t = this.objectiveTarget;
    if (!t || !this.objectiveText) return null;
    if (Array.isArray(t)) return this._targetPos.set(t[0], t[1] + 1.6, t[2]);
    const npc = this.npcs.get(t.npc);
    return npc ? this._targetPos.set(npc.position.x, npc.position.y + 2.2, npc.position.z) : null;
  }

  /** Per rendered frame. */
  frameUpdate(dt, camera, eye, dir) {
    for (const v of this.views.values()) v.update(dt);
    this.ambient.update(dt);
    if (this.fade !== this.fadeTarget) {
      const step = this.fadeSpeed * dt;
      this.fade = this.fade < this.fadeTarget ? Math.min(this.fadeTarget, this.fade + step) : Math.max(this.fadeTarget, this.fade - step);
    }
    this.hud.setFade(this.started ? this.fade : 0);
    this.hud.setSubtitle(this.dialogue.current);
    const talk = this.npcs.talkTarget(eye, dir);
    this.hud.setPrompt(talk ? this._speakerName(talk) : null);
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
