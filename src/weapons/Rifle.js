import { MathUtils, PointLight, Vector3 } from 'three';
import { RIFLE } from './config.js';
import { Recoil } from './Recoil.js';
import { WeaponState } from './WeaponState.js';

const UP = new Vector3(0, 1, 0);
const _dir = new Vector3();
const _right = new Vector3();
const _up = new Vector3();
const _p = new Vector3();

function smoothstep01(x) {
  const t = MathUtils.clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * The player's rifle: fire/reload logic, hitscan shots against the collision world,
 * recoil on the view, aim-down-sights zoom, impacts, muzzle flash and sound.
 */
export class Rifle {
  /**
   * @param {{ scene: import('three').Scene, collision: import('../world/CollisionWorld.js').CollisionWorld,
   *   view: import('../player/PlayerCamera.js').PlayerCamera, viewmodel: import('./Viewmodel.js').Viewmodel,
   *   impacts: import('./Impacts.js').Impacts, audio: import('./WeaponAudio.js').WeaponAudio }} deps
   */
  constructor({ scene, collision, view, viewmodel, impacts, audio }, config = RIFLE) {
    this.cfg = config;
    this.collision = collision;
    this.view = view;
    this.viewmodel = viewmodel;
    this.impacts = impacts;
    this.audio = audio;
    this.state = new WeaponState(config);
    this.recoil = new Recoil(config);
    this.hit = { point: new Vector3(), normal: new Vector3(), distance: 0 };
    this.shotsFired = 0;
    /** Called for every shot that hits the world: (hit, direction) => void. */
    this.onHit = null;
    /**
     * Things that can be shot besides the world (enemies): raycast(origin, dir, maxDist)
     * -> { distance, ... } | null, and hit(target, dir) to apply it.
     */
    this.targets = null;
    /** Called for every shot fired: (origin) => void (enemies hear it). */
    this.onShot = null;
    /** 'ready' or 'lowered' (safe carry: no firing or aiming; R checks the magazine). */
    this.mode = 'ready';
    this.checkTime = 0; // magazine check progress in seconds (0 = not checking)
    this.checkDuration = 1.3;
    this.chargeTime = 0; // charging-handle pull when the rifle is made ready (seconds, 0 = none)
    this.chargeDuration = 0.8;
    /** Called when a magazine check completes: () => void. */
    this.onMagCheck = null;
    this._lowInput = { trigger: false, aim: false, reload: false, blocked: true };

    // The muzzle flash briefly lights the surroundings too. The light always exists
    // (intensity 0 when idle) so toggling it never recompiles shaders.
    this.flashLight = new PointLight(0xffb45a, 0, 9, 2);
    scene.add(this.flashLight);
    this.flashTimer = 0;
  }

  /** Full magazine and reserve again (level restart). */
  reset() {
    this.state = new WeaponState(this.cfg);
    this.recoil = new Recoil(this.cfg);
    this.flashTimer = 0;
    this.checkTime = 0;
    this.chargeTime = 0;
  }

  /** Eased 0..1 aim-down-sights amount. */
  get aim() {
    return smoothstep01(this.state.aim);
  }

  /** Current bullet spread (cone half-angle, radians). */
  spread(player) {
    const cfg = this.cfg;
    const moving = MathUtils.clamp(player.horizontalSpeed / player.cfg.walkSpeed, 0, 1.5);
    let hip = cfg.hipSpread + cfg.moveSpread * moving;
    if (!player.grounded) hip += cfg.airSpread;
    if (player.crouched) hip *= 0.7;
    return MathUtils.lerp(hip, cfg.adsSpread, this.aim);
  }

  /**
   * Fixed-step update.
   * @param {number} dt
   * @param {{ trigger: boolean, aim: boolean, reload: boolean, blocked: boolean }} input
   * @param {import('../player/PlayerController.js').PlayerController} player
   */
  get lowered() {
    return this.mode === 'lowered';
  }

  /** 0..1 progress of a magazine check. */
  get checkProgress() {
    return this.checkTime > 0 ? this.checkTime / this.checkDuration : 0;
  }

  /** Racks the charging handle (the story makes the rifle ready). Looks only. */
  charge() {
    this.chargeTime = 1e-6;
  }

  /** 0..1 progress of the charging-handle pull. */
  get chargeProgress() {
    return this.chargeTime > 0 ? this.chargeTime / this.chargeDuration : 0;
  }

  fixedUpdate(dt, input, player) {
    const state = this.state;
    if (this.lowered) {
      if (input.reload && this.checkTime === 0) {
        this.checkTime = 1e-6;
        this.audio.magCheck?.();
      }
      input = this._lowInput;
    }
    if (this.chargeTime > 0) {
      this.chargeTime += dt;
      if (this.chargeTime >= this.chargeDuration) this.chargeTime = 0;
    }
    if (this.checkTime > 0) {
      this.checkTime += dt;
      if (this.checkTime >= this.checkDuration) {
        this.checkTime = 0;
        if (this.onMagCheck) this.onMagCheck();
      }
    }
    const shots = state.update(dt, input);
    if (state.dryFire) this.audio.dryFire();
    if (state.reloadStarted) this.audio.reload(this.cfg.reloadTime, { empty: state.ammo === 0 });
    for (let i = 0; i < shots; i++) this._fire(player);

    this.recoil.update(dt);
    const aim = this.aim;
    this.view.offsetPitch = this.recoil.pitch;
    this.view.offsetYaw = this.recoil.yaw;
    this.view.fovScale = MathUtils.lerp(1, this.cfg.adsZoom, aim);
    this.view.lookScale = MathUtils.lerp(1, this.cfg.adsLookScale, aim);
    this.view.aim = aim;
  }

  /** Per rendered frame: the flash light is shown for at least one frame per shot. */
  frameUpdate(dt) {
    this.flashLight.intensity = this.flashTimer > 0 ? 6 : 0;
    this.flashTimer = Math.max(0, this.flashTimer - dt);
  }

  _fire(player) {
    const view = this.view;
    view.getAimDirection(_dir);

    // Random point in the spread cone (uniform over the disc).
    const spread = this.spread(player);
    const r = spread * Math.sqrt(Math.random());
    const a = Math.random() * Math.PI * 2;
    _right.crossVectors(_dir, UP).normalize();
    _up.crossVectors(_right, _dir);
    _dir.addScaledVector(_right, Math.cos(a) * r).addScaledVector(_up, Math.sin(a) * r).normalize();

    const hit = this.collision.raycast(view.eye, _dir, this.cfg.range, this.hit);
    const target = this.targets ? this.targets.raycast(view.eye, _dir, hit ? hit.distance : this.cfg.range) : null;
    if (target) {
      _p.copy(view.eye).addScaledVector(_dir, target.distance);
      this.impacts.burst(_p, _dir, target.zone === 'head' ? [0.9, 0.05, 0.04] : [0.7, 0.04, 0.03]);
      this.targets.hit(target, _dir);
    } else if (hit) {
      this.impacts.add(hit.point, hit.normal, _dir);
      if (this.onHit) this.onHit(hit, _dir);
    }
    if (this.onShot) this.onShot(view.eye);

    this.shotsFired++;
    const aim = this.aim;
    this.recoil.kick(MathUtils.lerp(1, this.cfg.adsRecoilScale, aim) * (player.crouched ? 0.8 : 1));
    this.viewmodel.onShot(aim);
    this.audio.shot();
    this.flashTimer = 0.04;
    this.flashLight.position.copy(view.eye).addScaledVector(_dir, 0.8);
  }
}
