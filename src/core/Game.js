import { ACESFilmicToneMapping, MathUtils, PCFShadowMap, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { Input } from './Input.js';
import { PlayerController } from '../player/PlayerController.js';
import { PlayerCamera } from '../player/PlayerCamera.js';
import { VIEW } from '../player/config.js';
import { CollisionWorld } from '../world/CollisionWorld.js';
import { Environment } from '../world/Environment.js';
import { createTestRange } from '../world/TestRange.js';
import { createGreyboxMaterials, createGridTexture } from '../world/greybox.js';
import { RIFLE } from '../weapons/config.js';
import { Impacts } from '../weapons/Impacts.js';
import { Rifle } from '../weapons/Rifle.js';
import { Viewmodel } from '../weapons/Viewmodel.js';
import { WeaponAudio } from '../weapons/WeaponAudio.js';
import { Hud } from '../ui/Hud.js';
import { Overlay, loadSensitivity } from '../ui/Overlay.js';

// Physics runs at a fixed rate; rendering interpolates between steps, so movement
// feels identical at 60, 144 or 240 Hz.
const FIXED_DT = 1 / 120;
const MAX_FRAME_DT = 0.1; // after a hitch, slow down instead of spiraling

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
    const grid = createGridTexture(renderer.capabilities.getMaxAnisotropy());
    const range = createTestRange(createGreyboxMaterials(grid));
    this.scene.add(range.root);
    this.environment = new Environment(this.scene, renderer, { shadowCenter: [0, 0, -8], shadowExtent: 36 });
    this.collision = new CollisionWorld().build(range.collisionRoots);

    // Player
    this.player = new PlayerController(this.collision);
    this.player.setSpawn(range.spawn.position, range.spawn.yaw);
    this.view = new PlayerCamera(this.camera, this.player);
    this.view.sensitivity = loadSensitivity();

    // Weapon
    this.viewmodel = new Viewmodel();
    this.viewmodel.setAspect(this.camera.aspect);
    this.impacts = new Impacts(this.scene);
    this.audio = new WeaponAudio();
    this.rifle = new Rifle({
      scene: this.scene,
      collision: this.collision,
      view: this.view,
      viewmodel: this.viewmodel,
      impacts: this.impacts,
      audio: this.audio,
    });

    // Input + UI
    this.input = new Input(renderer.domElement);
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
        this.player.yaw = this.view.yaw;
        this.player.update(FIXED_DT, this._readControls());
        this.view.fixedUpdate(FIXED_DT);
        this.rifle.fixedUpdate(FIXED_DT, this._readWeaponInput(), this.player);
        this.accumulator -= FIXED_DT;
      }
    }

    this.view.render(this.active ? this.accumulator / FIXED_DT : 1);
    this.environment.update(this.camera);
    this.viewmodel.update(dt, {
      aim: this.rifle.state.aim,
      reload: this.rifle.state.reloadProgress,
      sprinting: this.player.sprinting,
      lookX: m.x,
      lookY: m.y,
      bobPhase: this.view.bobPhase,
      bobWeight: this.view.bobWeight,
      dip: this.view.dip,
    });
    this.rifle.frameUpdate(dt);
    this.impacts.update(dt);
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

  _updateHud(dt) {
    const hud = this.hud;
    const aim = this.rifle.aim;
    // Crosshair gap = the spread cone projected to pixels; hidden when aiming or sprinting.
    const halfFov = MathUtils.degToRad(this.camera.fov) / 2;
    const gap = (Math.tan(this.rifle.spread(this.player)) / Math.tan(halfFov)) * (window.innerHeight / 2);
    hud.setCrosshair(gap + 4, this.player.sprinting ? 0 : MathUtils.clamp(1 - aim * 2.5, 0, 1));
    hud.setAmmo(this.rifle.state);
    hud.update(dt, { player: this.player, drawCalls: this.renderer.info.render.calls });
  }

  _readWeaponInput() {
    const w = this._weaponInput;
    w.trigger = this.input.isDown('Mouse0');
    w.aim = this.input.isDown('Mouse2');
    w.reload = this.input.consumePress('KeyR');
    w.blocked = this.player.sprinting;
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
