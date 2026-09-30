import { ACESFilmicToneMapping, MathUtils, PCFShadowMap, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from 'three';
import { Input } from './Input.js';
import { PlayerController } from '../player/PlayerController.js';
import { PlayerCamera } from '../player/PlayerCamera.js';
import { VIEW } from '../player/config.js';
import { CollisionWorld } from '../world/CollisionWorld.js';
import { Environment } from '../world/Environment.js';
import { SkyFx } from '../world/SkyFx.js';
import { createTestRange } from '../world/TestRange.js';
import { createKotelLevel } from '../world/kotel/KotelLevel.js';
import { createGreyboxMaterials, createGridTexture } from '../world/greybox.js';
import { RIFLE } from '../weapons/config.js';
import { Impacts } from '../weapons/Impacts.js';
import { Rifle } from '../weapons/Rifle.js';
import { Viewmodel } from '../weapons/Viewmodel.js';
import { WeaponAudio } from '../weapons/WeaponAudio.js';
import { GrenadeSim, GrenadeView } from '../weapons/Grenades.js';
import { GrenadeThrower } from '../weapons/GrenadeThrower.js';
import { GrenadeWarning } from '../ui/GrenadeWarning.js';
import { DIFFICULTY } from '../story/difficulty.js';
import { NavGrid } from '../ai/NavGrid.js';
import { CoverPoints } from '../ai/CoverPoints.js';
import { EnemyManager, playerHitTest } from '../ai/EnemyManager.js';
import { DebugDraw } from '../ai/DebugDraw.js';
import { PlayerHealth } from '../player/PlayerHealth.js';
import { DamageOverlay } from '../ui/DamageOverlay.js';
import { HE } from '../ui/strings.he.js';
import { Hud, num } from '../ui/Hud.js';
import { StoryHud } from '../ui/StoryHud.js';
import { StoryDirector } from '../story/StoryDirector.js';
import { MISSION1 } from '../story/mission1.js';
import { Overlay, loadSensitivity } from '../ui/Overlay.js';

// Physics runs at a fixed rate; rendering interpolates between steps, so movement
// feels identical at 60, 144 or 240 Hz.
const FIXED_DT = 1 / 120;
const MAX_FRAME_DT = 0.1; // after a hitch, slow down instead of spiraling
const DEATH_RESTART = 3.2; // seconds from death to restart
const _up = new Vector3(0, 1, 0);

export class Game {
  constructor(container) {
    const renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFShadowMap;
    renderer.info.autoReset = false; // two render passes per frame; reset manually
    container.append(renderer.domElement);
    this.renderer = renderer;

    this.scene = new Scene();
    this.camera = new PerspectiveCamera(VIEW.fov, window.innerWidth / window.innerHeight, VIEW.near, VIEW.far);

    // World
    // Level: the Kotel plaza by default; ?level=range loads the movement test range.
    const range = new URLSearchParams(window.location.search).get('level') === 'range';
    const level = range
      ? createTestRange(createGreyboxMaterials(createGridTexture(renderer.capabilities.getMaxAnisotropy())))
      : createKotelLevel();
    this.level = level;
    this.scene.add(level.root);
    this.environment = new Environment(
      this.scene,
      renderer,
      level.environment ?? { shadowCenter: [0, 0, -8], shadowExtent: 36 },
    );
    this.collision = new CollisionWorld().build(level.collisionRoots);

    // Player
    this.player = new PlayerController(this.collision);
    this.player.setSpawn(level.spawn.position, level.spawn.yaw);
    this.view = new PlayerCamera(this.camera, this.player);
    this.view.sensitivity = loadSensitivity();

    // Weapon
    this.viewmodel = new Viewmodel();
    this.viewmodel.setAspect(this.camera.aspect);
    this.impacts = new Impacts(this.scene);
    this.audio = new WeaponAudio();
    this.rifle = new Rifle(
      {
        scene: this.scene,
        collision: this.collision,
        view: this.view,
        viewmodel: this.viewmodel,
        impacts: this.impacts,
        audio: this.audio,
      },
      // The mission limits reserve ammo (ammo crates refill it); the test range doesn't.
      range ? RIFLE : { ...RIFLE, reserveAmmo: DIFFICULTY.ammo.reserve },
    );

    // Grenades: one simulation for everyone's; the player throws with G.
    const G = DIFFICULTY.grenades;
    this.grenadeSim = new GrenadeSim(this.collision, { fuse: G.fuse });
    this.grenadeView = new GrenadeView(this.scene, this.grenadeSim);
    this.thrower = new GrenadeThrower({ sim: this.grenadeSim, view: this.grenadeView, audio: this.audio, config: G.player });
    this.grenadeSim.onBounce = (g) => this.audio.grenadeBounce(g.position);
    this.grenadeSim.onExplode = (g) => this._explode(g);

    // Enemies: navmesh + cover points baked from the level's collision.
    this.nav = new NavGrid(this.collision, level.navBounds).build();
    this.cover = new CoverPoints(this.collision, this.nav).generate();
    this.health = new PlayerHealth();
    this.enemies = new EnemyManager({
      scene: this.scene,
      world: this.collision,
      nav: this.nav,
      cover: this.cover,
      audio: this.audio,
      impacts: this.impacts,
      health: this.health,
      spawns: level.enemySpawns ?? [],
    });
    this.enemies.grenades = this.grenadeSim;
    this._playerInfo = {
      position: this.player.position,
      head: new Vector3(),
      chest: new Vector3(),
      speed: 0,
      crouched: false,
      firing: false,
      alive: true,
      hitTest: playerHitTest(this.player),
    };
    // Bullets: enemies and NPCs (friendly fire), whichever is closer.
    this.rifle.targets = {
      raycast: (o, d, max) => {
        const e = this.enemies.raycast(o, d, max);
        const n = this.story ? this.story.raycast(o, d, e ? e.distance : max) : null;
        return n ? { ...n, zone: 'body', friendly: true } : e;
      },
      hit: (t, d) => (t.friendly ? this.story.friendlyFire(t.npc) : this.enemies.hit(t, d, this._playerInfo)),
    };
    this.rifle.onShot = (origin) => {
      this._playerInfo.firing = true;
      this.enemies.playerShot(origin);
    };
    this.debugDraw = new DebugDraw(this.scene, this.camera, this.enemies);

    // Story: the mission on the Kotel level (the test range has none).
    this.storyHud = new StoryHud(document.body);
    this.story = range
      ? null
      : new StoryDirector({
          script: MISSION1,
          scene: this.scene,
          world: this.collision,
          nav: this.nav,
          player: this.player,
          rifle: this.rifle,
          enemies: this.enemies,
          audio: this.audio,
          hud: this.storyHud,
          sky: new SkyFx(this.scene),
          view: this.view,
          grenades: this.thrower,
        });
    this.storyHud.setVisible(false);
    this.deathTime = -1;
    this._forward = new Vector3();

    // Input + UI
    this.input = new Input(renderer.domElement);
    this.damage = new DamageOverlay(document.body);
    this.grenadeWarning = new GrenadeWarning(document.body);
    this.enemies.onEnemyHit = ({ zone, killed }) => {
      this.damage.showHitmarker(killed);
      this.audio.hitmarker(zone === 'head');
    };
    // Dev tools: F1 = AI debug view + FPS readout, K = spawn an enemy.
    window.addEventListener('keydown', (e) => {
      if (e.code === 'F1') {
        e.preventDefault();
        if (e.repeat) return;
        this.debugDraw.toggle();
        this.hud.showDebug(this.debugDraw.visible);
      } else if (e.code === 'KeyK' && this.active && !e.repeat) {
        this.enemies.spawnNear(this.view.eye);
      } else if (e.code === 'F2' && this.story) {
        e.preventDefault();
        if (!e.repeat) this._toggleStepMenu();
      }
    });
    this.hud = new Hud(document.body, { showDebug: import.meta.env.DEV });
    this.overlay = new Overlay(document.body, {
      sensitivity: this.view.sensitivity,
      onStart: () => {
        this.audio.unlock(); // audio may only start from a user gesture
        this.input.requestLock();
      },
      onSensitivity: (v) => {
        this.view.sensitivity = v;
      },
      // Chapter select: start (or restart) the mission at one of its parts.
      chapters: this.story ? MISSION1.chapters : [],
      onChapter: (i) => {
        this._pendingChapter = this.story.mission.indexOf(MISSION1.chapters[i].step);
        this.audio.unlock();
        if (this.active) this._startChapter();
        else this.input.requestLock();
      },
    });
    this.input.onLockChange = (locked) => this.setActive(locked);
    this.input.onLockError = () => this.overlay.showError();

    this.active = false;
    this.accumulator = 0;
    this.lastTime = null;
    this._mouse = { x: 0, y: 0 };
    this._controls = { forward: 0, right: 0, jump: false, sprint: false, crouch: false, moveScale: 1 };
    this._weaponInput = { trigger: false, aim: false, reload: false, blocked: false };

    window.addEventListener('resize', () => this.resize());
  }

  start() {
    this.renderer.setAnimationLoop((t) => this.frame(t));
  }

  /** Playing (pointer locked) vs paused (overlay shown). */
  setActive(active) {
    if (active === this.active) return;
    this.active = active;
    this.input.setEnabled(active);
    this.hud.setPlaying(active);
    this.storyHud.setVisible(active);
    if (active && this.story) {
      if (this._pendingChapter !== undefined) this._startChapter();
      else this.story.start();
    }
    if (active) this.overlay.hide();
    else this.overlay.show({ paused: true });
  }

  resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.viewmodel.setAspect(this.camera.aspect);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  frame(timeMs) {
    const now = timeMs / 1000;
    const dt = this.lastTime === null ? 0 : Math.min(now - this.lastTime, MAX_FRAME_DT);
    this.lastTime = now;

    const m = this._mouse;
    m.x = 0;
    m.y = 0;
    if (this.active) {
      this.input.consumeMouse(m);
      this.view.look(m.x, m.y);

      this.accumulator += dt;
      while (this.accumulator >= FIXED_DT) {
        this._fixedStep(FIXED_DT);
        this.accumulator -= FIXED_DT;
      }
      this._updateDeath(dt);
    }

    this.view.render(this.active ? this.accumulator / FIXED_DT : 1);
    this.environment.update(this.camera);
    this.viewmodel.update(dt, {
      aim: this.rifle.state.aim,
      reload: this.rifle.state.reloadProgress,
      sprinting: this.player.sprinting,
      lowered: this.rifle.lowered || this.thrower.aiming || this.thrower.busy > 0,
      check: this.rifle.checkProgress,
      lookX: m.x,
      lookY: m.y,
      bobPhase: this.view.bobPhase,
      bobWeight: this.view.bobWeight,
      dip: this.view.dip,
    });
    this.rifle.frameUpdate(dt);
    this.grenadeView.update(dt);
    if (this.active) this.thrower.frameUpdate(this.view.eye, this.view.getAimDirection(this._forward), this.player.velocity);
    this.grenadeWarning.update(this._hostileGrenades(), this.player.position, this.view.viewYaw);
    this.impacts.update(dt);
    this.enemies.frameUpdate(dt);
    this.debugDraw.update();
    this.audio.setListener(this.camera, this.view.getAimDirection(this._forward));
    if (this.story) this.story.frameUpdate(dt, this.camera, this.view.eye, this._forward);
    const fade = this.deathTime < 0 ? 0 : MathUtils.clamp((this.deathTime - 0.4) / 1.2, 0, 1);
    this.damage.update(dt, this.health, this.player.position, this.view.viewYaw, this._fadeIn ?? fade);
    this._updateHud(dt);

    // World first, then the weapon on top with a cleared depth buffer.
    const r = this.renderer;
    r.info.reset();
    r.render(this.scene, this.camera);
    r.autoClear = false;
    r.clearDepth();
    r.render(this.viewmodel.scene, this.viewmodel.camera);
    r.autoClear = true;
  }

  _fixedStep(dt) {
    const dead = this.health.dead;
    const info = this._playerInfo;
    info.firing = false;
    this.player.yaw = this.view.yaw;
    this.player.update(dt, dead ? this._noControls() : this._readControls());
    this.view.fixedUpdate(dt);
    this.rifle.fixedUpdate(dt, dead ? this._noWeapon() : this._readWeaponInput(), this.player);
    this.thrower.enabled = !this.rifle.lowered && !this.rifle.state.reloading;
    this.thrower.update(dt, !dead && this.input.isDown('KeyG'), this.view.eye, this.view.getAimDirection(this._forward), this.player.velocity);
    this.grenadeSim.update(dt);
    if (this.story && !dead && this.input.consumePress('KeyE')) {
      this.story.interact(this.view.eye, this.view.getAimDirection(this._forward));
    }

    const p = this.player;
    info.speed = p.horizontalSpeed;
    info.crouched = p.crouched;
    info.alive = !dead;
    info.head.set(p.position.x, p.position.y + p.height - 0.15, p.position.z);
    info.chest.set(p.position.x, p.position.y + p.height * 0.72, p.position.z);
    this.enemies.update(dt, info, p);
    if (this.story) this.story.update(dt, info);
    this.health.update(dt);
  }

  _noControls() {
    const c = this._controls;
    c.forward = c.right = 0;
    c.jump = c.sprint = c.crouch = false;
    return c;
  }

  _noWeapon() {
    const w = this._weaponInput;
    w.trigger = w.aim = w.reload = false;
    w.blocked = true;
    return w;
  }

  /** Death: fade to black, then restart the level from its start. */
  _updateDeath(dt) {
    if (this._fadeIn !== undefined) {
      this._fadeIn = Math.max(0, this._fadeIn - dt / 0.8);
      if (this._fadeIn === 0) this._fadeIn = undefined;
    }
    const failed = this.story && this.story.failed;
    if (!this.health.dead && !failed) return;
    if (this.deathTime < 0) this.deathTime = 0;
    this.deathTime += dt;
    if (this.deathTime >= DEATH_RESTART) this.restart();
  }

  /** Death or a failed mission: back to the last checkpoint (or the level start). */
  restart() {
    this.deathTime = -1;
    this._fadeIn = 1;
    this.health.reset();
    this.rifle.reset();
    this.enemies.reset();
    this.impacts.clear();
    this._clearGrenades();
    if (this.story) this.story.restartFromCheckpoint();
    else this.player.respawn();
    this.view.snap();
  }

  _startChapter() {
    const i = this._pendingChapter;
    this._pendingChapter = undefined;
    this._resetCombat();
    this.story.startAt(i);
    this.view.snap();
  }

  /** Health, weapon, enemies, grenades and bullet marks back to a clean state. */
  _resetCombat() {
    this.deathTime = -1;
    this.health.reset();
    this.rifle.reset();
    this.enemies.reset();
    this.impacts.clear();
    this._clearGrenades();
  }

  _clearGrenades() {
    this.grenadeSim.clear();
    this.grenadeView.clear();
    this.thrower.reset();
  }

  _hostileGrenades() {
    const out = this._grenadeList ?? (this._grenadeList = []);
    out.length = 0;
    for (const g of this.grenadeSim.items) if (g.live && g.owner === 'hostile') out.push(g);
    return out;
  }

  /** A grenade went off: damage (you, enemies, the squad), effects, sound, shake. */
  _explode(g) {
    const G = DIFFICULTY.grenades;
    const pos = g.position;
    const info = this._playerInfo;
    this.grenadeView.explode(pos);
    this.audio.explosion(pos);
    this.impacts.burst(pos, _up, [0.45, 0.4, 0.33], 26);
    if (!this.health.dead) {
      const dmg = this.enemies.explosionDamageAt(pos, info.chest, info.head, G.radius, G.playerDamage);
      if (dmg > 0) this.health.damage(dmg, pos);
    }
    const thrower = g.owner === 'player' ? info : g.thrower?.asTarget ?? null;
    this.enemies.explode(pos, G.radius, G.enemyDamage, thrower);
    const d = pos.distanceTo(this.player.position);
    this.view.addShake(Math.max(0, 1 - d / 28) * 0.8);
  }

  /** F2: jump to any mission step (dev tool). Frees the mouse while the menu is open. */
  _toggleStepMenu() {
    const open = this.storyHud.toggleMenu(this.story.steps, this.story.stepIndex, {
      onJump: (i) => {
        this._resetCombat();
        this.story.jumpTo(i);
        this.view.snap();
        this.input.requestLock();
      },
      onWeapon: () => {
        this.rifle.mode = this.rifle.lowered ? 'ready' : 'lowered';
        this.input.requestLock();
      },
      onClose: () => this.input.requestLock(),
    });
    if (open) this.input.exitLock();
  }

  _updateHud(dt) {
    const hud = this.hud;
    const aim = this.rifle.aim;
    // Crosshair gap = the spread cone projected to pixels; hidden when aiming or sprinting.
    const halfFov = MathUtils.degToRad(this.camera.fov) / 2;
    const gap = (Math.tan(this.rifle.spread(this.player)) / Math.tan(halfFov)) * (window.innerHeight / 2);
    const lowered = this.rifle.lowered;
    hud.setCrosshair(gap + 4, this.player.sprinting || lowered ? 0 : MathUtils.clamp(1 - aim * 2.5, 0, 1));
    // With the weapon lowered the ammo counter only shows while checking the magazine.
    if (this.rifle.checkTime > 0) this._ammoShowTime = 2.5;
    this._ammoShowTime = Math.max(0, (this._ammoShowTime ?? 0) - dt);
    hud.ammo.hidden = lowered && this._ammoShowTime <= 0;
    hud.setAmmo(this.rifle.state);
    hud.setGrenades(this.thrower.count, lowered ? 0 : this.thrower.cfg.max);
    hud.update(dt, {
      player: this.player,
      drawCalls: this.renderer.info.render.calls,
      extra: () => {
        const alive = this.enemies.enemies.filter((e) => e.alive).length;
        return [
          `${HE.hud.health}: ${num(this.health.health, 0)}`,
          `${HE.hud.enemies}: ${num(alive, 0)} · ${HE.hud.kills}: ${num(this.enemies.kills, 0)}`,
        ];
      },
    });
  }

  _readWeaponInput() {
    const w = this._weaponInput;
    w.trigger = this.input.isDown('Mouse0');
    w.aim = this.input.isDown('Mouse2');
    w.reload = this.input.consumePress('KeyR');
    w.blocked = this.player.sprinting || this.thrower.aiming || this.thrower.busy > 0;
    return w;
  }

  _readControls() {
    const i = this.input;
    const c = this._controls;
    c.forward = (i.isDown('KeyW') || i.isDown('ArrowUp') ? 1 : 0) - (i.isDown('KeyS') || i.isDown('ArrowDown') ? 1 : 0);
    c.right = (i.isDown('KeyD') || i.isDown('ArrowRight') ? 1 : 0) - (i.isDown('KeyA') || i.isDown('ArrowLeft') ? 1 : 0);
    // Firing or aiming ends a sprint; aiming also slows you down.
    const firing = i.isDown('Mouse0') || i.isDown('Mouse2');
    c.sprint = !firing && (i.isDown('ShiftLeft') || i.isDown('ShiftRight'));
    c.moveScale = MathUtils.lerp(1, RIFLE.adsMoveScale, this.rifle.aim);
    c.jump = i.consumePress('Space');
    c.crouch = i.consumePress('KeyC');
    return c;
  }
}
