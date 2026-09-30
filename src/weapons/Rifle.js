import { MathUtils, PointLight, Vector3 } from 'three';
import { RIFLE } from './config.js';
import { Recoil } from './Recoil.js';
import { WeaponState } from './WeaponState.js';

const UP = new Vector3(0, 1, 0);
const _dir = new Vector3();
const _right = new Vector3();
const _up = new Vector3();

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
    /** Called for every shot that hits something: (hit, direction) => void. */
    this.onHit = null;

    // The muzzle flash briefly lights the surroundings too. The light always exists
    // (intensity 0 when idle) so toggling it never recompiles shaders.
    this.flashLight = new PointLight(0xffb45a, 0, 9, 2);
    scene.add(this.flashLight);
    this.flashTimer = 0;
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
  fixedUpdate(dt, input, player) {
    const state = this.state;
    const shots = state.update(dt, input);
    if (state.dryFire) this.audio.dryFire();
    if (state.reloadStarted) this.audio.reload(this.cfg.reloadTime);
    for (let i = 0; i < shots; i++) this._fire(player);

    this.recoil.update(dt);
    const aim = this.aim;
    this.view.offsetPitch = this.recoil.pitch;
    this.view.offsetYaw = this.recoil.yaw;
    this.view.fovScale = MathUtils.lerp(1, this.cfg.adsZoom, aim);
    this.view.lookScale = MathUtils.lerp(1, this.cfg.adsLookScale, aim);
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
    if (hit) {
      this.impacts.add(hit.point, hit.normal, _dir);
      if (this.onHit) this.onHit(hit, _dir);
    }

    this.shotsFired++;
    const aim = this.aim;
    this.recoil.kick(MathUtils.lerp(1, this.cfg.adsRecoilScale, aim) * (player.crouched ? 0.8 : 1));
    this.viewmodel.onShot(aim);
    this.audio.shot();
    this.flashTimer = 0.04;
    this.flashLight.position.copy(view.eye).addScaledVector(_dir, 0.8);
  }
}
