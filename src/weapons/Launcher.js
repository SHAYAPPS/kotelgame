import { MathUtils, Vector3 } from 'three';
import { LAUNCHER } from './config.js';

const _dir = new Vector3();
const _right = new Vector3();
const _up = new Vector3();
const UP = new Vector3(0, 1, 0);

/**
 * Shoulder-fired rocket launcher: one rocket loaded, a small reserve, a slow reload,
 * aim down the sight. Pure logic; `fire(origin, dir)` hands the rocket to the game.
 * `state` mirrors WeaponState's shape (ammo / reserve / reloading / cfg.magazineSize)
 * so the HUD ammo counter works for both weapons.
 */
export class Launcher {
  constructor(config = LAUNCHER) {
    this.cfg = config;
    this.state = { ammo: 0, reserve: 0, reloading: false, reloadProgress: 0, aim: 0, cfg: { magazineSize: 1 } };
    this.reloadTimer = 0;
    this.shotsFired = 0;
    this.owned = false;
    /** (origin: Vector3, dir: Vector3) => void */
    this.onFire = null;
    /** () => void, when a reload starts (sound) */
    this.onReload = null;
  }

  /** Picked up: `rockets` in total (one loaded). */
  give(rockets) {
    this.owned = true;
    const total = this.state.ammo + this.state.reserve + rockets;
    this.state.ammo = Math.min(1, total);
    this.state.reserve = total - this.state.ammo;
  }

  reset() {
    this.owned = false;
    this.state.ammo = this.state.reserve = 0;
    this.state.reloading = false;
    this.state.reloadProgress = 0;
    this.state.aim = 0;
    this.reloadTimer = 0;
  }

  get aim() {
    const a = this.state.aim;
    return a * a * (3 - 2 * a);
  }

  /**
   * Fixed step while it's the weapon in hand.
   * @param {{ trigger: boolean, aim: boolean, reload: boolean, blocked: boolean }} input
   * @param {Vector3} eye @param {Vector3} aimDir view direction
   */
  fixedUpdate(dt, input, eye, aimDir) {
    const s = this.state;
    const c = this.cfg;
    const step = dt / c.adsTime;
    s.aim = input.aim && !input.blocked ? Math.min(1, s.aim + step) : Math.max(0, s.aim - step);
    if (s.reloading) {
      this.reloadTimer -= dt;
      s.reloadProgress = 1 - this.reloadTimer / c.reloadTime;
      if (this.reloadTimer <= 0) {
        s.reloading = false;
        s.reloadProgress = 0;
        s.ammo = 1;
        s.reserve--;
      }
      return false;
    }
    // Empty tube: reload automatically (after the shot's kick settles).
    this._sinceShot = (this._sinceShot ?? 0) + dt;
    if (s.ammo === 0 && s.reserve > 0 && this._sinceShot > 0.5) {
      s.reloading = true;
      this.reloadTimer = c.reloadTime;
      if (this.onReload) this.onReload();
      return false;
    }
    if (!input.trigger || input.blocked || s.ammo === 0) return false;
    s.ammo = 0;
    this._sinceShot = 0;
    this.shotsFired++;
    // Hip fire is loose, aimed fire is dead on.
    const spread = MathUtils.lerp(c.spread * 6, c.spread, this.aim);
    _dir.copy(aimDir);
    const r = spread * Math.sqrt(Math.random());
    const a = Math.random() * Math.PI * 2;
    _right.crossVectors(_dir, UP).normalize();
    _up.crossVectors(_right, _dir);
    _dir.addScaledVector(_right, Math.cos(a) * r).addScaledVector(_up, Math.sin(a) * r).normalize();
    if (this.onFire) this.onFire(eye, _dir);
    return true;
  }

}
