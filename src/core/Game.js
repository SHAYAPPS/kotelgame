import { ACESFilmicToneMapping, Color, Frustum, Material, MathUtils, Matrix4, Node, PCFShadowMap, PerspectiveCamera, Quaternion, Scene, Vector2, Vector3, WebGPURenderer } from 'three/webgpu';
import { Input } from './Input.js';
import { enterFullscreen, isTouchDevice } from './device.js';
import { PlayerController } from '../player/PlayerController.js';
import { PlayerCamera } from '../player/PlayerCamera.js';
import { VIEW } from '../player/config.js';
import { CollisionWorld } from '../world/CollisionWorld.js';
import { Environment } from '../world/Environment.js';
import { FlashLights } from '../world/FlashLights.js';
import { TextureLibrary } from '../world/Textures.js';
import { assignCharacterShadows, characters } from '../characters/registry.js';
import { CHARACTER, FAR_LAYER } from '../characters/config.js';
import { PostFX } from './PostFX.js';
import { QUALITY, effectsFor } from './Graphics.js';
import { NightLighting } from '../world/NightLights.js';
import { flattenRenderables, steadyShadowMaterials } from './fastProject.js';
import { STONE } from '../world/stoneMaterial.js';
import { airLight } from '../world/particleLight.js';
import { Bindings } from './Bindings.js';
import { MenuCamera } from './MenuCamera.js';
import { browserStorage, loadSettings, saveSettings } from './Settings.js';
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
import { Casings, viewToWorld } from '../weapons/Casings.js';
import { models } from './Models.js';
import { TRUCK_MODEL } from '../ai/TruckView.js';
import { WeaponAudio } from '../weapons/WeaponAudio.js';
import { GrenadeSim, GrenadeView } from '../weapons/Grenades.js';
import { GrenadeThrower } from '../weapons/GrenadeThrower.js';
import { GrenadeWarning } from '../ui/GrenadeWarning.js';
import { DIFFICULTY, setDifficulty } from '../story/difficulty.js';
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
import { TouchControls } from '../ui/TouchControls.js';
import { StoryDirector } from '../story/StoryDirector.js';
import { viewFx } from '../story/NpcView.js';
import { MISSION1 } from '../story/mission1.js';
import { CROWD } from '../story/crowd/CrowdField.js';
import { NPC } from '../story/Npc.js';
import { VoicePlayer, voiceFiles } from '../story/Voice.js';
import { chapterOf, clearSave, readSave, writeSave } from '../story/SaveGame.js';
import { Shell } from '../ui/menu/Shell.js';

// Physics runs at a fixed rate; rendering interpolates between steps, so movement
// feels identical at 60, 144 or 240 Hz.
const FIXED_DT = 1 / 120;
const MAX_FRAME_DT = 0.1; // after a hitch, slow down instead of spiraling
// Recorded dialogue, if any: src/assets/voice/<lineId>.ogg|mp3|wav|m4a (see story/Voice.js).
const VOICE_FILES = voiceFiles(import.meta.glob('../assets/voice/*.{ogg,mp3,wav,m4a,webm}', { eager: true, query: '?url', import: 'default' }));
const DEATH_RESTART = 3.2; // seconds from death to restart
const _up = new Vector3(0, 1, 0);
const _o = new Vector3();
const _b = new Vector3();
const _size = new Vector2();
const _hv = new Vector3();
const _ac = new Color();
const _hp = new Vector3();
const _c = new Vector3();
const _down = new Vector3(0, -1, 0);
const _pv = new Matrix4();
const _eq = new Quaternion();
const MENU_FOV = 50; // the main menu's cinematic camera
// Loading: each part's share of the progress bar.
const LOAD_WEIGHTS = { level: 0.08, nav: 0.07, textures: 0.14, characters: 0.25, fits: 0.05, crowd: 0.12, weapons: 0.08, sounds: 0.21 };
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

export class Game {
  /**
   * Only the settings and the shell (the loading screen shows at once); `init()` builds the
   * world and loads everything.
   */
  constructor(container) {
    this.container = container;
    this.storage = browserStorage();
    // A phone or tablet: on-screen controls, no pointer lock, and lighter graphics to start with.
    this.touch = isTouchDevice();
    document.body.classList.toggle('touch', this.touch);
    this.settings = loadSettings(this.storage, this.touch ? { quality: 'low' } : {});
    this.bindings = new Bindings(this.settings.bindings);
    setDifficulty(this.settings.difficulty);
    this.range = new URLSearchParams(window.location.search).get('level') === 'range';
    this.forceWebGL = new URLSearchParams(window.location.search).has('webgl');
    // (?nodetrace: where a shader node was made, in TSL's error messages)
    if (new URLSearchParams(window.location.search).has('nodetrace')) Node.captureStackTrace = true;
    this.mode = 'loading'; // 'loading' | 'title' (loaded, waiting for a click) | 'menu' | 'playing' | 'paused'
    this.active = false;
    this.shell = new Shell(document.body, {
      settings: this.settings,
      bindings: this.bindings,
      onSetting: (key, value) => this.setSetting(key, value),
      chapters: this.range ? [] : MISSION1.chapters,
      touch: this.touch,
      save: () => this._saveInfo(),
      onContinue: () => this.continueGame(),
      onNewGame: (chapter) => this.newGame(chapter),
      onResume: () => this.input.requestLock(),
      onRestart: () => {
        this.restart();
        this.input.requestLock();
      },
      onQuitToMenu: () => this.toMenu(),
      // Quit only exists in the desktop version (a wrapper that provides it).
      onQuit: globalThis.kotelDesktop?.quit ? () => globalThis.kotelDesktop.quit() : null,
    });
    this._load = Object.fromEntries(Object.keys(LOAD_WEIGHTS).map((k) => [k, 0]));
  }

  /** One part of the loading done this far (0..1): the loading screen's bar. */
  _loaded(part, f) {
    this._load[part] = Math.max(this._load[part], Math.min(1, f));
    let sum = 0;
    let total = 0;
    for (const [k, w] of Object.entries(LOAD_WEIGHTS)) {
      sum += w * this._load[k];
      total += w;
    }
    this.shell.setProgress(sum / total);
  }

  /** Build the world and load everything (textures, characters, weapons, sounds), the loading screen showing how far it got. */
  async init() {
    const container = this.container;
    await nextFrame(); // the loading screen first
    // WebGPU (WebGL 2 where the browser has no WebGPU; ?webgl forces it). Antialiasing is
    // temporal, in the post chain (core/PostFX.js), not on the canvas.
    // The world pass writes several images at once (color, normals, motion, albedo, metal /
    // roughness for the screen-space effects): ask for the room the adapter has.
    const requiredLimits = {};
    try {
      const adapter = !this.forceWebGL && navigator.gpu ? await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }) : null;
      const max = adapter?.limits?.maxColorAttachmentBytesPerSample ?? 32;
      if (max > 32) requiredLimits.maxColorAttachmentBytesPerSample = Math.min(64, max);
    } catch {
      // (no WebGPU: the WebGL 2 fallback)
    }
    const renderer = new WebGPURenderer({ antialias: false, powerPreference: 'high-performance', forceWebGL: this.forceWebGL, requiredLimits });
    await renderer.init();
    flattenRenderables(renderer);
    steadyShadowMaterials(Material);
    this.qualityName = this.settings.quality;
    this.quality = QUALITY[this.qualityName];
    this.effects = effectsFor(this.qualityName, this.settings.effects);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.quality.pixelRatio));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = ACESFilmicToneMapping; // filmic; applied in the post chain
    renderer.toneMappingExposure = 1.0;
    renderer.setClearColor(0x000000, 0); // (the weapon's pass is laid over the world by its alpha)
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFShadowMap;
    renderer.info.autoReset = false; // several passes per frame; reset manually
    container.append(renderer.domElement);
    this.renderer = renderer;

    this.scene = new Scene();
    // World matrices are brought up to date once a frame (Game.frame), not on every pass
    // (the world, each shadow cascade...): thousands of bones would be walked each time.
    this.scene.matrixWorldAutoUpdate = false;
    this.camera = new PerspectiveCamera(VIEW.fov, window.innerWidth / window.innerHeight, VIEW.near, VIEW.far);
    this.camera.layers.enable(FAR_LAYER); // far characters (see characters/config.js)

    // World
    // Level: the Kotel plaza by default; ?level=range loads the movement test range.
    const range = this.range;
    const level = range
      ? createTestRange(createGreyboxMaterials(createGridTexture(renderer.getMaxAnisotropy())))
      : createKotelLevel();
    this.level = level;
    this.scene.add(level.root);
    this.environment = new Environment(this.scene, renderer, this.camera, level.environment ?? {}, this.quality);
    // The night's floodlights, lamps and screens, and their glowing fixtures.
    for (const l of level.night?.lights ?? []) this.environment.lights.add(l);
    for (const g of level.night?.glows ?? []) this.environment.lights.addGlow(g);
    // Every lit material in the plaza loops over the night lights (world/NightLights.js).
    renderer.lighting = new NightLighting(this.environment.lights, this.scene);
    airLight.night = this.environment.lights; // (smoke, dust and the haze take them too)
    this._applyStoneDetail();
    // Stone textures stream in after the level shows (KTX2).
    this.textures = new TextureLibrary(renderer);
    this.textures.anisotropy = this.quality.anisotropy;
    const loads = [];
    loads.push(Promise.resolve(level.applyTextures?.(this.textures, (done, total) => this._loaded('textures', done / total))).then(() => this._loaded('textures', 1)));
    // Animated characters stream in too (placeholders until they arrive); the loaders are
    // their own chunk. Their head wear and vests are fitted while the loading screen shows.
    characters.camera = this.camera;
    characters.frustum = new Frustum();
    this._applyCharacterQuality();
    this.characters = null;
    loads.push(
      import('../characters/CharacterLibrary.js')
        .then(({ CharacterLibrary }) => {
          this.characters = new CharacterLibrary({ ktx2Loader: this.textures.loader });
          characters.library = this.characters;
          return this.characters.load((done, total) => this._loaded('characters', done / total));
        })
        .then(() => this.characters.prepareFits((done, total) => this._loaded('fits', done / total)))
        // The crowd: its animations baked, its people placed (needs the story: after the world).
        .then(async () => {
          await this._storyReady;
          await this.story?.buildCrowd(this.characters, this.scene, (done, total) => this._loaded('crowd', done / total));
          this._loaded('crowd', 1);
        }),
    );
    let storyReady;
    this._storyReady = new Promise((r) => (storyReady = r));
    this._loaded('level', 1);
    await nextFrame();
    this.flashes = new FlashLights(this.scene, this.quality.flashLights);
    airLight.flashes = this.flashes;
    // A phone's photo flash in the crowd (a brief cold light on the people in front of it).
    viewFx.flash = (p) => this.flashes.flash(p, { color: 0xdfe8ff, intensity: 16, distance: 5, duration: 0.07 });
    this._blastHit = { point: new Vector3(), normal: new Vector3(), distance: 0 };
    this.collision = new CollisionWorld().build(level.collisionRoots);
    this.collision.stairZones = level.stairZones ?? []; // flights (src/world/stairs.js)

    // Player
    this.player = new PlayerController(this.collision);
    this.player.setSpawn(level.spawn.position, level.spawn.yaw);
    this.view = new PlayerCamera(this.camera, this.player);
    this._applyView();

    // Weapon
    this.viewmodel = new Viewmodel();
    this.viewmodel.setAspect(this.camera.aspect);
    // The real weapon models stream in (greybox ones until then); the truck's too, for later.
    models.ktx2Loader = this.textures.loader;
    loads.push(
      Promise.all([
        this.viewmodel.load().catch((e) => console.warn('Weapon models did not load; keeping the greybox ones.', e)),
        range ? null : models.load(TRUCK_MODEL).catch(() => {}),
      ]).then(() => this._loaded('weapons', 1)),
    );
    this._sunlit = 1; // is the player's weapon in the sun? (a ray toward the sun, a few times a second)
    this._shadeTimer = 0;
    this._shadeHit = { point: new Vector3(), normal: new Vector3(), distance: 0 };
    this.post = new PostFX(renderer, this.scene, this.camera, this.viewmodel.scene, this.viewmodel.camera, { quality: this.quality, effects: this.effects, environment: this.environment });
    this.heatSources = []; // explosions' shimmer: { position, radius, strength, life, maxLife }
    this._frameMs = 16.7; // dynamic resolution: smoothed frame time
    this._resTimer = 0;
    this.impacts = new Impacts(this.scene);
    this._dustScale();
    // Spent casings from the ejection port: world physics, they clink on the stone.
    this.casings = new Casings(this.scene, this.collision);
    this._ejectPos = new Vector3();
    this._ejectVel = new Vector3();
    this.viewmodel.onEject = (p, v) => {
      viewToWorld(p, this.viewmodel.camera, this.camera, this._ejectPos);
      this.camera.getWorldQuaternion(_eq);
      this._ejectVel.copy(v).applyQuaternion(_eq).add(this.player.velocity);
      this.casings.eject(this._ejectPos, this._ejectVel);
    };
    this.audio = new WeaponAudio(this.settings.volumes);
    this.audio.walls = level.acoustics?.walls ?? []; // slap-back echoes off the level's big walls
    // Every sound decoded now (the context starts playing on the first click).
    loads.push(Promise.resolve(this.audio.init((done, total) => this._loaded('sounds', total ? done / total : 1))).then(() => this._loaded('sounds', 1)));
    this.casings.onBounce = (p, speed, n) => this.audio.casing?.(p, speed, n);
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
    await nextFrame();
    this.nav = new NavGrid(this.collision, level.navBounds).build();
    this.cover = new CoverPoints(this.collision, this.nav).generate();
    this._loaded('nav', 1);
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
    this.launcher.onReload = () => this.audio.reload(LAUNCHER.reloadTime, { launcher: true });
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
    this.storyHud = new StoryHud(document.body, { touch: this.touch });
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
          seats: level.seats ?? [],
          stats: () => ({
            shots: this.stats.shots,
            hits: this.stats.hits,
            kills: this.enemies.kills - this.stats.kills0,
            headshots: this.enemies.headshots - this.stats.headshots0,
          }),
        });
    storyReady();
    this.storyHud.setVisible(false);
    this.storyHud.subtitles = this.settings.subtitles;
    if (this.story) {
      this.story.onLauncher = () => this._requestWeapon('launcher');
      this.story.onCheckpoint = (index) => this._save(index); // Continue picks up there
    }
    this.deathTime = -1;
    this._forward = new Vector3();

    // Input + UI
    this.input = new Input(renderer.domElement);
    this.input.touch = this.touch;
    this.damage = new DamageOverlay(document.body);
    this.grenadeWarning = new GrenadeWarning(document.body);
    this.enemies.onEnemyHit = ({ zone, killed }) => {
      this.damage.showHitmarker(killed);
      this.audio.hitmarker(zone === 'head');
    };
    this.screenshot = new Screenshot(renderer.domElement);
    // P = screenshot. Dev tools: F1 = AI debug view + FPS readout, F2 = jump to a mission
    // step, K = spawn an enemy (dev builds).
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyP' && !e.repeat) {
        this.screenshot.request();
      } else if (e.code === 'F1') {
        e.preventDefault();
        if (e.repeat) return;
        this.debugDraw.toggle();
        this.hud.showDebug(this.debugDraw.visible);
      } else if (e.code === 'KeyK' && this.active && !e.repeat && import.meta.env.DEV) {
        this.enemies.spawnNear(this.view.eye);
      } else if (e.code === 'F2' && this.story && this.mode === 'playing') {
        e.preventDefault();
        if (!e.repeat) this._toggleStepMenu();
      }
    });
    this.hud = new Hud(document.body, { showDebug: import.meta.env.DEV });
    this.hud.setFpsVisible(this.settings.showFps);
    this.input.onLockChange = (locked) => this.setActive(locked);
    this.input.onLockError = () => this.shell.showError(HE.lockError);
    if (this.touch) {
      this.touchControls = new TouchControls(document.body, { input: this.input, bindings: this.bindings, onPause: () => this.input.exitLock() });
      this.storyHud.onPromptTap = (key) => this.touchControls.tapKey(key);
      // The app going to the background pauses (on a computer, losing the mouse lock does).
      document.addEventListener('visibilitychange', () => {
        if (document.hidden && this.mode === 'playing') this.input.exitLock();
      });
    }

    this.accumulator = 0;
    this.lastTime = null;
    this._mouse = { x: 0, y: 0 };
    this._controls = { forward: 0, right: 0, jump: false, sprint: false, crouch: false, moveScale: 1 };
    this._weaponInput = { trigger: false, aim: false, reload: false, blocked: false };

    // The main menu's background: slow drifts across the level (else around the spawn).
    const sp = level.spawn.position;
    this.menuCam = new MenuCamera(level.menu?.shots ?? [{ from: [sp.x - 9, sp.y + 3, sp.z + 9], to: [sp.x + 9, sp.y + 3, sp.z + 9], look: [sp.x, sp.y + 1, sp.z - 15], time: 20 }]);

    window.addEventListener('resize', () => this.resize());

    // The menu's scene, drawn behind the loading screen from now on (shaders compile, textures
    // upload while it's covered).
    this._menuScene();
    this.start();
    // Everything streaming in: wait for it (a part that fails keeps its placeholder).
    await Promise.all(loads.map((l) => l.catch((e) => console.warn(e))));
    for (let i = 0; i < 3; i++) await nextFrame();
    if (this.mode !== 'loading') return; // (dev: automated checks started playing already)
    this.mode = 'title';
    this.shell.loaded(() => {
      if (this.touch) enterFullscreen(); // (a tap: fullscreen and landscape where the browser allows)
      this.audio.unlock(); // sound may only start from a user gesture
      this.story?.voices?.preload();
      this.toMenu();
    });
  }

  start() {
    if (!this._looping) this.renderer.setAnimationLoop((t) => this.frame(t));
    this._looping = true;
  }

  /**
   * Playing (the mouse locked) or not: the pointer lock changed (or, in dev, automated checks
   * call setActive(true) to play without it). Losing the lock while playing pauses.
   */
  setActive(active) {
    if (active === this.active || !this.input) return;
    this.active = active;
    this.input.setEnabled(active);
    this.hud.setPlaying(active);
    this.storyHud.setVisible(active);
    this.touchControls?.setVisible(active);
    if (active && this.touch) enterFullscreen(); // (from the menu's tap)
    if (active) {
      const resuming = this.mode === 'paused';
      this.mode = 'playing';
      this.shell.hide();
      this.audio.unlock();
      this.audio.setPaused(false);
      this.viewmodel.scene.visible = true;
      if (!resuming) this._beginPlay();
    } else if (this.mode === 'playing') {
      this.mode = 'paused';
      this.audio.setPaused(true);
      // (The F2 step menu frees the mouse too: no pause menu over it.)
      if (!this.storyHud.menu) this.shell.showPause({ done: !!this.story?.mission.finished });
    }
  }

  /** New Game (main menu): from the start, or from chapter `chapter` of the mission's list. */
  newGame(chapter = null) {
    clearSave(this.storage);
    const c = chapter === null ? null : MISSION1.chapters[chapter];
    this._pending = { step: c && this.story ? Math.max(0, this.story.mission.indexOf(c.step)) : 0 };
    this.input.requestLock();
  }

  /** Continue (main menu): back at the last checkpoint saved. */
  continueGame() {
    const save = this.story ? readSave(this.storage) : null;
    if (!save) return;
    this._pending = { step: Math.max(0, this.story.mission.indexOf(save.step)), stats: save.stats };
    this.input.requestLock();
  }

  /** Into the mission (the mouse just locked from the menu): a new game, Continue, or (dev) its start. */
  _beginPlay() {
    if (this.level.environment?.sun) this.environment.setTime(this.level.environment.sun.time);
    this._completed = false;
    if (!this.story) return;
    const p = this._pending;
    this._pending = undefined;
    if (!p) {
      this.story.start();
      return;
    }
    this._resetCombat();
    const s = p.stats;
    this.stats = { shots: s?.shots ?? 0, hits: s?.hits ?? 0, kills0: this.enemies.kills - (s?.kills ?? 0), headshots0: this.enemies.headshots - (s?.headshots ?? 0) };
    this.story.startAt(p.step);
    if (s) {
      // The mission clock goes on from where the save left it.
      this.story.missionStart = this.story.time - s.time;
      this._save(this.story.mission.checkpointIndex);
    }
    this.view.snap();
  }

  /** Back to the main menu (from the pause menu; after loading): the plaza at dawn behind it. */
  toMenu() {
    this.mode = 'menu';
    this._pending = undefined;
    this.input.exitLock();
    this.active = false;
    this.input.setEnabled(false);
    this.hud.setPlaying(false);
    this.storyHud.setVisible(false);
    this._resetCombat();
    this._menuScene();
    this.audio.setPaused(false);
    this.audio.setMusic('calm');
    this.shell.showMain();
  }

  /** The menu's scene: sunrise, the early prayer at the wall, the camera drifting. */
  _menuScene() {
    this.environment.setTime(this.level.menu?.time);
    this.story?.menuScene();
    this.menuCam.reset();
    this.viewmodel.scene.visible = false;
    this.deathTime = -1;
    this._fadeIn = undefined;
  }

  /** The menu camera this frame (instead of the player's view). */
  _menuCamera(dt) {
    const c = this.menuCam.update(dt);
    this.camera.position.fromArray(c.position);
    this.camera.lookAt(_c.fromArray(c.target));
    if (this.camera.fov !== MENU_FOV) {
      this.camera.fov = MENU_FOV;
      this.camera.updateProjectionMatrix();
    }
    this.shell.setFade(this.mode === 'menu' ? c.fade : 0);
  }

  /** A setting changed (Settings screen): apply it now and save it. */
  setSetting(key, value) {
    this.settings[key] = value;
    saveSettings(this.settings, this.storage);
    if (key === 'sensitivity' || key === 'aimSensitivity' || key === 'invertY' || key === 'fov') this._applyView();
    else if (key === 'quality') {
      // A preset sets every effect; the player's own switches start over.
      this.settings.effects = {};
      saveSettings(this.settings, this.storage);
      this.setQuality(value);
    } else if (key === 'effects') this.setQuality(this.qualityName);
    else if (key === 'showFps') this.hud.setFpsVisible(value);
    else if (key === 'volumes') this.audio.setVolumes(value);
    else if (key === 'difficulty') setDifficulty(value);
    else if (key === 'subtitles') this.storyHud.subtitles = value;
    // 'bindings': the Bindings object (the settings panel's) already changed.
  }

  _applyView() {
    const v = this.view;
    const s = this.settings;
    v.sensitivity = s.sensitivity;
    v.aimSensitivity = s.aimSensitivity;
    v.invertY = s.invertY;
    v.baseFov = s.fov;
  }

  /** A checkpoint reached: saved for Continue. */
  _save(index) {
    const step = this.story?.steps[index];
    if (!step || this.mode !== 'playing') return;
    const st = this.story.stats();
    writeSave({ mission: 'mission1', step: step.id, difficulty: this.settings.difficulty, stats: { ...st, time: this.story.time - this.story.missionStart } }, this.storage);
  }

  /** What the main menu's Continue shows (null: nothing saved). */
  _saveInfo() {
    if (this.range) return null;
    const s = readSave(this.storage);
    if (!s) return null;
    return { chapter: chapterOf(MISSION1, s.step)?.label ?? '' };
  }

  resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.viewmodel.setAspect(this.camera.aspect);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.post.setSize();
    if (this.environment.csm?.camera) this.environment.csm.updateFrustums();
  }

  /** (Dust puffs are sprites sized in meters now: nothing to rescale.) */
  _dustScale() {}

  /** Graphics setting (low / medium / high): applied live and saved. */
  setQuality(name) {
    if (!QUALITY[name]) return;
    this.qualityName = name;
    this.quality = QUALITY[name];
    this.effects = effectsFor(name, this.settings.effects);
    this.post.resolutionScale = 1; // (dynamic resolution starts over at the new preset)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.quality.pixelRatio));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.environment.setQuality(this.quality);
    this.post.setQuality(this.quality, this.effects);
    this._applyStoneDetail();
    this.flashes.setCount(this.quality.flashLights);
    this.textures.setAnisotropy(this.quality.anisotropy);
    this._applyCharacterQuality();
    this.resize();
  }

  /** Parallax and close-up detail on the stone (uniforms: no rebuild). */
  _applyStoneDetail() {
    STONE.parallax.value = this.effects.parallax ? 1 : 0;
    STONE.detail.value = this.effects.detail ? 1 : 0;
  }

  _applyCharacterQuality() {
    // (A phone's CPU: people farther than a few meters animate at a lower rate.)
    CHARACTER.lodScale = (this.quality.characterLod ?? 1) * (this.touch ? 0.75 : 1);
    CHARACTER.shadowDistance = this.quality.characterShadows ?? 40;
    characters.shadowBudget = this.quality.characterShadowCount ?? Infinity;
    CROWD.density = this.quality.crowdDensity ?? 1;
    NPC.farStep = this.quality.npcFarStep ?? 1;
  }

  frame(timeMs) {
    const now = timeMs / 1000;
    // fixedFrame (dev, automated checks): every frame advances exactly that much game time, so
    // software rendering at a few frames a second behaves like the game at 60.
    const dt = this.fixedFrame ?? (this.lastTime === null ? 0 : Math.min(now - this.lastTime, MAX_FRAME_DT));
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

    // In the mission the player's view; in the menus (and behind the loading screen) the
    // menu's slow camera drifts.
    const inMission = this.mode === 'playing' || this.mode === 'paused';
    if (inMission) this.view.render(this.active ? this.accumulator / FIXED_DT : 1);
    else this._menuCamera(dt);
    this.environment.update(this.camera, dt);
    // Flashes and explosions hit harder in the dark.
    const night = this.environment.night;
    this.flashes.boost = 1 + 1.4 * night;
    // The light in the air (smoke, dust): the sky's fill and the key light, roughly.
    const env = this.environment;
    airLight.ambient.value.copy(env.hemi.color).multiplyScalar(env.hemi.intensity * 0.35).add(_ac.copy(env.keyLight.color).multiplyScalar(env.keyLight.intensity * 0.2));
    this.post.setNight?.(night);
    this.flashes.update(dt);
    const L = this.weapon === 'launcher';
    // In the sun or in shade: the weapon's light follows (it has no shadow map of its own).
    this._shadeTimer -= dt;
    if (this._shadeTimer <= 0) {
      this._shadeTimer = 0.1;
      this._sunlit = this.collision.raycast(this.view.eye, this.environment.sunDir, 300, this._shadeHit) ? 0 : 1;
    }
    this.viewmodel.setLighting(this.camera, this.environment, this._sunlit, dt);
    const sw = LAUNCHER.switchTime;
    this.viewmodel.update(dt, {
      aim: L ? this.launcher.state.aim : this.rifle.state.aim,
      reload: L ? this.launcher.state.reloadProgress : this.rifle.state.reloadProgress,
      reloadEmpty: !L && this.rifle.state.reloading && this.rifle.state.ammo === 0,
      loaded: this.launcher.state.ammo > 0,
      sprinting: this.player.sprinting,
      lowered: this.rifle.lowered || this.thrower.aiming || this.thrower.busy > 0,
      // Slung on the back (the checkpoint): out of view.
      stow: this.rifle.mode === 'slung' ? 1 : this._switchTime > 0 ? 1 - Math.abs((2 * this._switchTime) / sw - 1) : 0,
      check: this.rifle.checkProgress,
      charge: this.rifle.chargeProgress,
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
    this.casings.update(dt);
    // Characters: LOD and animation rates from where the camera is this frame.
    this.camera.updateMatrixWorld();
    characters.frustum.setFromProjectionMatrix(_pv.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse));
    characters.frame++;
    this.enemies.frameUpdate(dt);
    this.debugDraw.update();
    this.audio.setListener(this.camera, this.view.getAimDirection(this._forward));
    this.audio.update(dt);
    this.post.setSuppression?.(this.audio.blur);
    if (this.story) {
      if (!inMission) this.story.menuUpdate(dt, this._playerInfo);
      this.story.frameUpdate(dt, this.camera, this.view.eye, this._forward);
    }
    const fade = this.deathTime < 0 ? 0 : MathUtils.clamp((this.deathTime - 0.4) / 1.2, 0, 1);
    this.damage.update(dt, this.health, this.player.position, this.view.viewYaw, this._fadeIn ?? fade);
    this._updateHud(dt);

    assignCharacterShadows();
    // The frame (core/PostFX.js): depth of field, heat shimmer, then the whole chain.
    this._focus(dt);
    this._heat(dt);
    const r = this.renderer;
    r.info.reset();
    characters.sceneWalk = true;
    this.scene.updateMatrixWorld();
    characters.sceneWalk = false;
    this.post.render(dt);
    this.screenshot.capture();
    this._dynamicResolution(dt);
  }

  /**
   * Depth of field: aiming down the sights focuses on what the sight is on (the rest a little
   * soft); in a close conversation, on the one talking.
   */
  _focus(dt) {
    const p = this.post;
    if (!this.effects.dof) return;
    const aim = this.weapon === 'launcher' ? this.launcher.state.aim : this.rifle.state.aim;
    const talk = this.story?._talk ? this.story.dialogue.current : null;
    const speaker = talk?.who ? this.story.npcs.get(talk.who) : null;
    const eye = this.view.eye;
    let target = 0;
    let dist = p.u.focus.value;
    if (aim > 0.05 && this.mode === 'playing') {
      const dir = this.view.getAimDirection(this._forward);
      const hit = this.collision.raycast(eye, dir, 300, this._focusHit ?? (this._focusHit = { point: new Vector3(), normal: new Vector3(), distance: 0 }));
      dist = hit ? hit.distance : 80;
      target = 0.55 * aim;
      p.u.focalLength.value = Math.max(2.5, dist * 0.7);
      p.u.bokeh.value = 1.4;
    } else if (speaker && speaker.position.distanceTo(eye) < 4) {
      dist = speaker.headPoint.distanceTo(eye);
      target = 0.6;
      p.u.focalLength.value = 3.5;
      p.u.bokeh.value = 1.6;
    }
    this._dofAmount = (this._dofAmount ?? 0) + (target - (this._dofAmount ?? 0)) * (1 - Math.exp(-6 * dt));
    p.setFocus(dist, this._dofAmount);
  }

  /** A heat shimmer source (an explosion, a fire): fades over `life` seconds. */
  addHeat(position, radius, strength, life) {
    this.heatSources.push({ position: position.clone(), radius, strength, life, maxLife: life });
  }

  /** The heat sources on screen this frame (blasts, the launcher's rocket, burning wrecks). */
  _heat(dt) {
    if (!this.effects.heat) return;
    const list = (this._heatList ??= []);
    list.length = 0;
    const cam = this.camera;
    const add = (pos, radius, strength) => {
      _hv.copy(pos).applyMatrix4(cam.matrixWorldInverse);
      if (_hv.z > -0.5) return; // behind the camera
      const viewZ = _hv.z;
      _hv.copy(pos).project(cam);
      if (Math.abs(_hv.x) > 1.3 || Math.abs(_hv.y) > 1.3) return;
      // Screen radius: the world radius at that distance.
      const r = radius / (-viewZ * Math.tan(MathUtils.degToRad(cam.fov) / 2) * 2);
      list.push({ x: _hv.x * 0.5 + 0.5, y: 0.5 - _hv.y * 0.5, radius: Math.min(0.6, r), strength, viewZ });
    };
    for (let i = this.heatSources.length - 1; i >= 0; i--) {
      const h = this.heatSources[i];
      h.life -= dt;
      if (h.life <= 0) {
        this.heatSources.splice(i, 1);
        continue;
      }
      const k = h.life / h.maxLife;
      add(h.position, h.radius * (1.4 - 0.4 * k), h.strength * k);
    }
    for (const r of this.rockets?.items ?? []) if (r.live) add(r.position, 1.2, 0.8);
    this.post.setHeat(list);
  }

  /**
   * Dynamic resolution: the world renders smaller while the frame rate dips (the temporal
   * upscaler restores the full image), and comes back up when there's room again.
   */
  _dynamicResolution(dt) {
    const p = this.post;
    const base = Math.min(window.devicePixelRatio, this.quality.pixelRatio);
    if (!this.effects.dynamicRes || dt <= 0) {
      if (p.resolutionScale !== 1) p.setResolutionScale(1, base);
      return;
    }
    this._frameMs += (dt * 1000 - this._frameMs) * 0.05;
    this._resTimer -= dt;
    if (this._resTimer > 0) return;
    const s = p.resolutionScale;
    const min = this.quality.minScale ?? 0.65;
    if (this._frameMs > 18.2 && s > min) {
      p.setResolutionScale(Math.max(min, s - 0.1), base);
      this._resTimer = 1.5;
    } else if (this._frameMs < 14 && s < 1) {
      p.setResolutionScale(Math.min(1, s + 0.05), base);
      this._resTimer = 3;
    } else this._resTimer = 0.5;
  }

  /** Footsteps: one per step of the walk cycle (the head bob's phase), on stairs one per stair. */
  _footsteps() {
    const v = this.view;
    const p = this.player;
    const level = p.crouched ? 0.35 : p.sprinting ? 0.95 : 0.6;
    const n = v.steps.steps; // (starts over at 0 when the camera snaps)
    if (n > (this._stairSteps ?? n) && p.grounded) this.audio.footstep(level, true, this._surface());
    this._stairSteps = n;
    const phase = Math.floor(v.bobPhase + 0.5);
    if (phase !== (this._stepPhase ?? phase) && p.grounded && p.horizontalSpeed > 0.5 && v.steps.amount < 0.3) this.audio.footstep(level, false, this._surface());
    this._stepPhase = phase;
  }

  /** What the player stands on ('stone', 'wood'): a short ray down from the feet. */
  _surface() {
    const p = this.player.position;
    const hit = this.collision.raycast(_c.set(p.x, p.y + 0.3, p.z), _down, 0.8, this._stepHit ?? (this._stepHit = { point: new Vector3(), normal: new Vector3(), distance: 0 }));
    return hit?.surface ?? 'stone';
  }

  _fixedStep(dt) {
    const dead = this.health.dead;
    const info = this._playerInfo;
    info.firing = false;
    // A respawn / checkpoint / jump since the last step: look the way its spawn faces (the
    // player's update clears the flag, so the camera hears about it here).
    const teleported = this.player.teleported;
    if (teleported) {
      this.view.yaw = this.player.yaw;
      this.view.pitch = 0;
    }
    this.player.yaw = this.view.yaw;
    this.player.update(dt, dead ? this._noControls() : this._readControls());
    // Nobody walks through the crowd.
    this.story?.crowd?.field.pushOut(this.player.position, this.player.cfg.radius);
    this.view.fixedUpdate(dt);
    if (teleported) this.view.snap();
    this._footsteps();
    this._updateWeapons(dt, dead);
    this.thrower.enabled = !this.rifle.lowered && !this.rifle.state.reloading && !this.launcher.state.reloading && this._switchTime === 0;
    this.thrower.update(dt, !dead && this.input.anyDown(this.bindings.codes('grenade')), this.view.eye, this.view.getAimDirection(this._forward), this.player.velocity);
    this.grenadeSim.update(dt);
    this.rockets.update(dt);
    if (this.story && !dead && this.input.consumeAny(this.bindings.codes('interact'))) {
      this.story.interact(this.view.eye, this.view.getAimDirection(this._forward));
    }
    if (this.story && !dead && this.input.consumeAny(this.bindings.codes('deny'))) this.story.deny(this.view.eye, this.view.getAimDirection(this._forward));

    const p = this.player;
    info.speed = p.horizontalSpeed;
    info.crouched = p.crouched;
    info.alive = !dead;
    info.head.set(p.position.x, p.position.y + p.height - 0.15, p.position.z);
    info.chest.set(p.position.x, p.position.y + p.height * 0.72, p.position.z);
    this.enemies.update(dt, info, p);
    if (this.story) this.story.update(dt, info);
    this.health.update(dt);
    // Mission complete: nothing left to continue.
    if (this.story?.mission.finished && !this._completed) {
      this._completed = true;
      clearSave(this.storage);
    }
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

  /** Health, weapon, enemies, grenades and bullet marks back to a clean state. */
  _resetCombat() {
    this.deathTime = -1;
    this.health.reset();
    this.rifle.reset();
    this.enemies.reset();
    this.impacts.clear();
    this.casings.clear();
    this.viewmodel.reset();
    this.audio.reset?.();
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
      if (i.consumeAny(this.bindings.codes('weapon1'))) this._requestWeapon('rifle');
      if (i.consumeAny(this.bindings.codes('weapon2'))) this._requestWeapon('launcher');
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
      this.view.aim = a;
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
    this.audio.explosion(_o.set(p.x, p.y + 1.5, p.z));
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
      this.audio.explosion(at, radius < 5 ? 'small' : 'big');
      this.impacts.burst(at, _up, [0.45, 0.4, 0.33], 26);
      this.flashes.flash(at, { color: 0xffa050, intensity: 900 * fx, distance: 16 + 6 * fx, duration: 0.35 });
      // The hot air shimmers over it for a moment.
      this.addHeat(_hp.set(at.x, at.y + 1, at.z), 2.5 * fx + 1, 1, 1.6);
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
    // The touch buttons the moment has (no fire / aim / grenade with the weapon lowered).
    this.touchControls?.update({ armed: !lowered, canReload: this.rifle.mode !== 'slung', launcher: this.launcher.owned, grenades: this.thrower.count });
    hud.update(dt, {
      player: this.player,
      drawCalls: this.renderer.info.render.drawCalls ?? this.renderer.info.render.calls,
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
    const b = this.bindings;
    w.trigger = this.input.anyDown(b.codes('fire'));
    w.aim = this.input.anyDown(b.codes('aim'));
    w.reload = this.input.consumeAny(b.codes('reload'));
    w.blocked = this.player.sprinting || this.thrower.aiming || this.thrower.busy > 0;
    return w;
  }

  _readControls() {
    const i = this.input;
    const b = this.bindings;
    const c = this._controls;
    // Keys, plus the touch stick (analog: a small push walks slowly).
    c.forward = MathUtils.clamp((i.anyDown(b.codes('forward')) ? 1 : 0) - (i.anyDown(b.codes('back')) ? 1 : 0) + i.axisY, -1, 1);
    c.right = MathUtils.clamp((i.anyDown(b.codes('right')) ? 1 : 0) - (i.anyDown(b.codes('left')) ? 1 : 0) + i.axisX, -1, 1);
    // Firing or aiming ends a sprint; aiming also slows you down.
    const firing = i.anyDown(b.codes('fire')) || i.anyDown(b.codes('aim'));
    c.sprint = !firing && i.anyDown(b.codes('sprint'));
    c.moveScale = MathUtils.lerp(1, this.weapon === 'launcher' ? LAUNCHER.adsMoveScale : RIFLE.adsMoveScale, this._aim);
    c.jump = i.consumeAny(b.codes('jump'));
    c.crouch = i.consumeAny(b.codes('crouch'));
    return c;
  }
}
