import { ACESFilmicToneMapping, Frustum, MathUtils, Matrix4, PCFShadowMap, PerspectiveCamera, Scene, Vector2, Vector3, WebGLRenderer } from 'three';
import { Input } from './Input.js';
import { PlayerController } from '../player/PlayerController.js';
import { PlayerCamera } from '../player/PlayerCamera.js';
import { VIEW } from '../player/config.js';
import { CollisionWorld } from '../world/CollisionWorld.js';
import { Environment } from '../world/Environment.js';
import { FlashLights } from '../world/FlashLights.js';
import { TextureLibrary } from '../world/Textures.js';
import { characters } from '../characters/registry.js';
import { CHARACTER, FAR_LAYER } from '../characters/config.js';
import { PostFX } from './PostFX.js';
import { QUALITY, loadQuality, saveQuality } from './Graphics.js';
import { SkyFx } from '../world/SkyFx.js';
import { createTestRange } from '../world/TestRange.js';
import { createKotelLevel } from '../world/kotel/KotelLevel.js';
import { createGreyboxMaterials, createGridTexture } from '../world/greybox.js';
import { LAUNCHER, RIFLE } from '../weapons/config.js';
import { Launcher } from '../weapons/Launcher.js';
import { RocketSim, RocketView } from '../weapons/Rockets.js';
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
import { Screenshot } from '../ui/Screenshot.js';
import { StoryHud } from '../ui/StoryHud.js';
import { StoryDirector } from '../story/StoryDirector.js';
import { MISSION1 } from '../story/mission1.js';
import { VoicePlayer, voiceFiles } from '../story/Voice.js';
import { Overlay, loadSensitivity } from '../ui/Overlay.js';

// Physics runs at a fixed rate; rendering interpolates between steps, so movement
// feels identical at 60, 144 or 240 Hz.
const FIXED_DT = 1 / 120;
const MAX_FRAME_DT = 0.1; // after a hitch, slow down instead of spiraling
// Recorded dialogue, if any: src/assets/voice/<lineId>.ogg|mp3|wav|m4a (see story/Voice.js).
const VOICE_FILES = voiceFiles(import.meta.glob('../assets/voice/*.{ogg,mp3,wav,m4a}', { eager: true, query: '?url', import: 'default' }));
const DEATH_RESTART = 3.2; // seconds from death to restart
const _up = new Vector3(0, 1, 0);
const _o = new Vector3();
const _b = new Vector3();
const _size = new Vector2();
const _c = new Vector3();
const _down = new Vector3(0, -1, 0);
const _pv = new Matrix4();

export class Game {
  constructor(container) {
    // Antialiasing happens in the post chain (MSAA render target), not on the canvas.
    const renderer = new WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.qualityName = loadQuality();
    this.quality = QUALITY[this.qualityName];
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.quality.pixelRatio));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = ACESFilmicToneMapping; // filmic; applied by the post chain's output pass
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFShadowMap;
    renderer.info.autoReset = false; // several passes per frame; reset manually
    container.append(renderer.domElement);
    this.renderer = renderer;

    this.scene = new Scene();
    this.camera = new PerspectiveCamera(VIEW.fov, window.innerWidth / window.innerHeight, VIEW.near, VIEW.far);
    this.camera.layers.enable(FAR_LAYER); // far characters (see characters/config.js)

    // World
    // Level: the Kotel plaza by default; ?level=range loads the movement test range.
    const range = new URLSearchParams(window.location.search).get('level') === 'range';
    const level = range
      ? createTestRange(createGreyboxMaterials(createGridTexture(renderer.capabilities.getMaxAnisotropy())))
      : createKotelLevel();
    this.level = level;
    this.scene.add(level.root);
    this.environment = new Environment(this.scene, renderer, this.camera, level.environment ?? {}, this.quality);
    // Stone textures stream in after the level shows (KTX2).
    this.textures = new TextureLibrary(renderer);
    this.textures.anisotropy = this.quality.anisotropy;
    level.applyTextures?.(this.textures);
    // Animated characters stream in too (placeholders until they arrive); the loaders are
    // their own chunk.
    characters.camera = this.camera;
    characters.frustum = new Frustum();
    this._applyCharacterQuality();
    this.characters = null;
    import('../characters/CharacterLibrary.js').then(({ CharacterLibrary }) => {
      this.characters = new CharacterLibrary({ ktx2Loader: this.textures.loader });
      characters.library = this.characters;
      return this.characters.load();
    });
    this.flashes = new FlashLights(this.scene, this.quality.flashLights);
    this._blastHit = { point: new Vector3(), normal: new Vector3(), distance: 0 };
    this.collision = new CollisionWorld().build(level.collisionRoots);

    // Player
    this.player = new PlayerController(this.collision);
    this.player.setSpawn(level.spawn.position, level.spawn.yaw);
    this.view = new PlayerCamera(this.camera, this.player);
    this.view.sensitivity = loadSensitivity();

    // Weapon
    this.viewmodel = new Viewmodel();
    this.viewmodel.setAspect(this.camera.aspect);
    this.post = new PostFX(renderer, this.scene, this.camera, this.viewmodel.scene, this.viewmodel.camera, this.quality);
    this.impacts = new Impacts(this.scene);
    this._dustScale();
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

    // Rocket launcher (weapon 2), handed out in Mission 1's final push.
    this.launcher = new Launcher(LAUNCHER);
    this.rockets = new RocketSim(this.collision, LAUNCHER);
    this.rocketView = new RocketView(this.scene, this.rockets);
    this.weapon = 'rifle'; // in hand
    this._switchTime = 0; // > 0 while switching weapons
    this._switchTo = 'rifle';
    this._idleWeapon = { trigger: false, aim: false, reload: false, blocked: true };
    // Mission stats (accuracy etc.), counted from the start or the chapter you picked.
    this.stats = { shots: 0, hits: 0, kills0: 0, headshots0: 0 };

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
    // Every enemy / squad shot briefly lights up the stone around the muzzle.
    this.enemies.onShotFx = (shot) => this.flashes.flash(shot.origin, { intensity: 14, distance: 7, duration: 0.05 });
    this.enemies.onVehicleDestroyed = (truck) => this._vehicleExplosion(truck);
    this.rockets.targets = { raycast: (o, d, max) => this.enemies.raycast(o, d, max) };
    this.rockets.onImpact = (r, point, normal, target) => this._rocketImpact(r, point, target);
    this.launcher.onFire = (eye, dir) => this._launchRocket(eye, dir);
    this.launcher.onReload = () => this.audio.reload(LAUNCHER.reloadTime);
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
      hit: (t, d) => {
        if (t.friendly) return this.story.friendlyFire(t.npc);
        this.stats.hits++;
        return this.enemies.hit(t, d, this._playerInfo);
      },
    };
    this.rifle.onShot = (origin) => {
      this.stats.shots++;
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
          launcher: this.launcher,
          voices: new VoicePlayer(this.audio, VOICE_FILES),
          stats: () => ({
            shots: this.stats.shots,
            hits: this.stats.hits,
            kills: this.enemies.kills - this.stats.kills0,
            headshots: this.enemies.headshots - this.stats.headshots0,
          }),
        });
    this.storyHud.setVisible(false);
    if (this.story) this.story.onLauncher = () => this._requestWeapon('launcher');
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
    this.screenshot = new Screenshot(renderer.domElement);
    // Dev tools: F1 = AI debug view + FPS readout, K = spawn an enemy. P = screenshot.
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyP' && !e.repeat) {
        this.screenshot.request();
      } else if (e.code === 'F1') {
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
        this.story?.voices?.preload();
        this.input.requestLock();
      },
      onSensitivity: (v) => {
        this.view.sensitivity = v;
      },
      quality: this.qualityName,
      onQuality: (q) => this.setQuality(q),
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
    const size = this.renderer.getDrawingBufferSize(_size);
    this.post.setSize(size.x, size.y);
    this.environment.csm.updateFrustums();
    this._dustScale();
  }

  /** Dust puffs are sized in meters: pixels per meter at 1 m for the current view. */
  _dustScale() {
    const h = this.renderer.getDrawingBufferSize(_size).y;
    this.impacts.dust.material.uniforms.scale.value = h / (2 * Math.tan(MathUtils.degToRad(this.camera.fov) / 2));
  }

  /** Graphics setting (low / medium / high): applied live and saved. */
  setQuality(name) {
    if (!QUALITY[name]) return;
    this.qualityName = name;
    this.quality = QUALITY[name];
    saveQuality(name);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.quality.pixelRatio));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.environment.setQuality(this.quality);
    this.post.setQuality(this.quality);
    this.flashes.setCount(this.quality.flashLights);
    this.textures.setAnisotropy(this.quality.anisotropy);
    this._applyCharacterQuality();
    this.resize();
  }

  _applyCharacterQuality() {
    CHARACTER.lodScale = this.quality.characterLod ?? 1;
    CHARACTER.shadowDistance = this.quality.characterShadows ?? 40;
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

      // Slow motion (the story's big moments) scales game time, not the frame rate.
      this.accumulator += dt * (this.story ? this.story.timeScale : 1);
      while (this.accumulator >= FIXED_DT) {
        this._fixedStep(FIXED_DT);
        this.accumulator -= FIXED_DT;
      }
      this._updateDeath(dt);
    }

    this.view.render(this.active ? this.accumulator / FIXED_DT : 1);
    this.environment.update(this.camera, dt);
    this.flashes.update(dt);
    const L = this.weapon === 'launcher';
    this.viewmodel.update(dt, {
      aim: L ? this.launcher.state.aim : this.rifle.state.aim,
      reload: L ? this.launcher.state.reloadProgress : this.rifle.state.reloadProgress,
      loaded: this.launcher.state.ammo > 0,
      sprinting: this.player.sprinting,
      lowered: this.rifle.lowered || this.thrower.aiming || this.thrower.busy > 0 || this._switchTime > 0,
      check: this.rifle.checkProgress,
      lookX: m.x,
      lookY: m.y,
      bobPhase: this.view.bobPhase,
      bobWeight: this.view.bobWeight,
      dip: this.view.dip,
    });
    this.rifle.frameUpdate(dt);
    this.grenadeView.update(dt);
    this.rocketView.update(dt);
    if (this.active) this.thrower.frameUpdate(this.view.eye, this.view.getAimDirection(this._forward), this.player.velocity);
    this.grenadeWarning.update(this._hostileGrenades(), this.player.position, this.view.viewYaw);
    this.impacts.update(dt);
    // Characters: LOD and animation rates from where the camera is this frame.
    this.camera.updateMatrixWorld();
    characters.frustum.setFromProjectionMatrix(_pv.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse));
    characters.frame++;
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
    this.post.render(dt);
    this.screenshot.capture();
  }

  /** Footsteps: one per step of the walk cycle (the head bob's phase), on stairs one per stair. */
  _footsteps() {
    const v = this.view;
    const p = this.player;
    const level = p.crouched ? 0.35 : p.sprinting ? 0.95 : 0.6;
    const n = v.steps.steps; // (starts over at 0 when the camera snaps)
    if (n > (this._stairSteps ?? n) && p.grounded) this.audio.footstep(level, true);
    this._stairSteps = n;
    const phase = Math.floor(v.bobPhase + 0.5);
    if (phase !== (this._stepPhase ?? phase) && p.grounded && p.horizontalSpeed > 0.5 && v.steps.amount < 0.3) this.audio.footstep(level, false);
    this._stepPhase = phase;
  }

  _fixedStep(dt) {
    const dead = this.health.dead;
    const info = this._playerInfo;
    info.firing = false;
    this.player.yaw = this.view.yaw;
    this.player.update(dt, dead ? this._noControls() : this._readControls());
    this.view.fixedUpdate(dt);
    this._footsteps();
    this._updateWeapons(dt, dead);
    this.thrower.enabled = !this.rifle.lowered && !this.rifle.state.reloading && !this.launcher.state.reloading && this._switchTime === 0;
    this.thrower.update(dt, !dead && this.input.isDown('KeyG'), this.view.eye, this.view.getAimDirection(this._forward), this.player.velocity);
    this.grenadeSim.update(dt);
    this.rockets.update(dt);
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
    this._resetCombat();
    this._fadeIn = 1;
    if (this.story) this.story.restartFromCheckpoint();
    else this.player.respawn();
    this.view.snap();
  }

  _startChapter() {
    const i = this._pendingChapter;
    this._pendingChapter = undefined;
    this._resetCombat();
    this.stats = { shots: 0, hits: 0, kills0: this.enemies.kills, headshots0: this.enemies.headshots };
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
    this.rockets.clear();
    this.rocketView.clear();
    this.launcher.reset();
    this._setWeapon('rifle');
  }

  // ---------------------------------------------------------------------------
  // Weapons: 1 = rifle, 2 = launcher (once you have it), or the mouse wheel.

  _requestWeapon(name) {
    if (name === 'launcher' && !this.launcher.owned) return;
    if (name === this._switchTo && (this._switchTime > 0 || name === this.weapon)) return;
    this._switchTo = name;
    this._switchTime = LAUNCHER.switchTime;
  }

  _setWeapon(name) {
    this.weapon = name;
    this._switchTo = name;
    this._switchTime = 0;
    this.viewmodel.setWeapon(name);
  }

  _updateWeapons(dt, dead) {
    const i = this.input;
    if (!dead && !this.rifle.lowered) {
      if (i.consumePress('Digit1')) this._requestWeapon('rifle');
      if (i.consumePress('Digit2')) this._requestWeapon('launcher');
      if (i.consumePress('WheelUp') || i.consumePress('WheelDown')) {
        this._requestWeapon((this._switchTime > 0 ? this._switchTo : this.weapon) === 'rifle' ? 'launcher' : 'rifle');
      }
    }
    if (!this.launcher.owned && this.weapon === 'launcher') this._setWeapon('rifle');
    if (this._switchTime > 0) {
      const half = LAUNCHER.switchTime / 2;
      const before = this._switchTime;
      this._switchTime = Math.max(0, this._switchTime - dt);
      // Swap models while the weapon is down out of view.
      if (before > half && this._switchTime <= half) {
        this.weapon = this._switchTo;
        this.viewmodel.setWeapon(this.weapon);
      }
    }
    const input = dead ? this._noWeapon() : this._readWeaponInput();
    if (this._switchTime > 0) input.blocked = true;
    const eye = this.view.eye;
    const dir = this.view.getAimDirection(this._forward);
    if (this.weapon === 'launcher') {
      this.rifle.fixedUpdate(dt, this._idleWeapon, this.player);
      if (!this.rifle.lowered) this.launcher.fixedUpdate(dt, input, eye, dir);
      // The launcher's own aim-down-sight zoom.
      const a = this.launcher.aim;
      this.view.fovScale = MathUtils.lerp(1, LAUNCHER.adsZoom, a);
      this.view.lookScale = MathUtils.lerp(1, LAUNCHER.adsLookScale, a);
    } else {
      this.rifle.fixedUpdate(dt, input, this.player);
    }
  }

  get _aim() {
    return this.weapon === 'launcher' ? this.launcher.aim : this.rifle.aim;
  }

  _launchRocket(eye, dir) {
    this.stats.shots++;
    _o.copy(eye).addScaledVector(dir, 0.9);
    _o.x += Math.cos(this.view.yaw) * 0.12;
    _o.z -= Math.sin(this.view.yaw) * 0.12;
    this.rockets.spawn(_o, dir, LAUNCHER.rocketSpeed);
    this.flashes.flash(_o, { color: 0xffc080, intensity: 200, distance: 12, duration: 0.15 });
    this.viewmodel.onLauncherShot();
    this.view.addShake(0.25);
    this.audio.rocketLaunch?.();
    this._playerInfo.firing = true;
    this.enemies.playerShot(eye);
  }

  _rocketImpact(r, point, target) {
    const info = this._playerInfo;
    if (target) {
      this.stats.hits++;
      const e = target.enemy;
      const dir = _o.copy(r.velocity).normalize();
      this.enemies.applyDamage(e, e.isVehicle ? DIFFICULTY.truck.rocketDirect : 300, dir, info);
    }
    this._blast(point, LAUNCHER.blastRadius, 150, LAUNCHER.blastDamage, info, 1.4);
  }

  /** The truck blows up: a big fireball, damage all around, a heavy shake. */
  _vehicleExplosion(truck) {
    const p = truck.position;
    for (const [dx, dy, dz] of [[0, 1.2, 0], [0.8, 1.8, -1.2], [-0.7, 1.5, 1.3]]) this.grenadeView.explode(_o.set(p.x + dx, p.y + dy, p.z + dz), 2.2);
    this.audio.explosion(_o.set(p.x, p.y + 1, p.z));
    this.audio.explosion(_o.set(p.x, p.y + 1, p.z));
    this.flashes.flash(_o.set(p.x, p.y + 2, p.z), { color: 0xff9040, intensity: 4000, distance: 32, duration: 0.8 });
    this.impacts.scorch(_c.set(p.x, p.y + 0.02, p.z), _up, 7);
    this._blast(_o.set(p.x, p.y + 1, p.z), 9, 120, 320, null, 0);
    const d = p.distanceTo(this.player.position);
    this.view.addShake(Math.max(0.55, 1 - d / 60));
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

  /** A grenade went off. */
  _explode(g) {
    const G = DIFFICULTY.grenades;
    const thrower = g.owner === 'player' ? this._playerInfo : g.thrower?.asTarget ?? null;
    this._blast(g.position, G.radius, G.playerDamage, G.enemyDamage, thrower, 1);
  }

  /**
   * An explosion: effects (`fx` = size, 0 = none), sound, damage to you, the enemies and
   * the squad, and a shake by distance.
   */
  _blast(pos, radius, playerDamage, enemyDamage, thrower, fx) {
    const info = this._playerInfo;
    const at = _b.copy(pos);
    if (fx > 0) {
      this.grenadeView.explode(at, fx);
      this.audio.explosion(at);
      this.impacts.burst(at, _up, [0.45, 0.4, 0.33], 26);
      this.flashes.flash(at, { color: 0xffa050, intensity: 900 * fx, distance: 16 + 6 * fx, duration: 0.35 });
      // Scorch the surface under it and kick up stone dust.
      const hit = this.collision.raycast(_c.set(at.x, at.y + 0.5, at.z), _down, 3, this._blastHit);
      if (hit) {
        this.impacts.scorch(hit.point, hit.normal, 2.2 * fx);
        this.impacts.puff(hit.point, hit.normal, 3);
      }
    }
    if (!this.health.dead) {
      const dmg = this.enemies.explosionDamageAt(at, info.chest, info.head, radius, playerDamage);
      if (dmg > 0) this.health.damage(dmg, at);
    }
    this.enemies.explode(at, radius, enemyDamage, thrower);
    const d = at.distanceTo(this.player.position);
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
    const aim = this._aim;
    const L = this.weapon === 'launcher';
    // Crosshair gap = the spread cone projected to pixels; hidden when aiming or sprinting.
    const halfFov = MathUtils.degToRad(this.camera.fov) / 2;
    const gap = L ? 10 : (Math.tan(this.rifle.spread(this.player)) / Math.tan(halfFov)) * (window.innerHeight / 2);
    const lowered = this.rifle.lowered;
    hud.setCrosshair(gap + 4, this.player.sprinting || lowered ? 0 : MathUtils.clamp(1 - aim * 2.5, 0, 1));
    // With the weapon lowered the ammo counter only shows while checking the magazine.
    if (this.rifle.checkTime > 0) this._ammoShowTime = 2.5;
    this._ammoShowTime = Math.max(0, (this._ammoShowTime ?? 0) - dt);
    hud.ammo.hidden = lowered && this._ammoShowTime <= 0;
    hud.setAmmo(L ? this.launcher.state : this.rifle.state);
    hud.setWeaponName?.(this.launcher.owned ? (L ? HE.weapons.launcher : HE.weapons.rifle) : '');
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
    c.moveScale = MathUtils.lerp(1, this.weapon === 'launcher' ? LAUNCHER.adsMoveScale : RIFLE.adsMoveScale, this._aim);
    c.jump = i.consumePress('Space');
    c.crouch = i.consumePress('KeyC');
    return c;
  }
}
