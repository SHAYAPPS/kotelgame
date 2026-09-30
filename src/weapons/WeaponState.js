import { RIFLE } from './config.js';

/**
 * Magazine, fire-rate and reload logic for one weapon (pure, no DOM/three).
 * Call update() every fixed step; it returns how many rounds fired this step
 * and flags one-shot events (dryFire, reloadStarted, reloadFinished).
 */
export class WeaponState {
  constructor(config = RIFLE) {
    this.cfg = config;
    this.ammo = config.magazineSize;
    this.reserve = config.reserveAmmo;
    this.cooldown = 0; // time until the next round can fire
    this.reloading = false;
    this.reloadTimer = 0;
    this.aim = 0; // 0 = hip, 1 = fully aimed down sights

    this.dryFire = false;
    this.reloadStarted = false;
    this.reloadFinished = false;
    this._triggerWasDown = false;
  }

  /** 0..1 progress of the current reload (0 when not reloading). */
  get reloadProgress() {
    return this.reloading ? 1 - this.reloadTimer / this.cfg.reloadTime : 0;
  }

  get canReload() {
    return !this.reloading && this.ammo < this.cfg.magazineSize && this.reserve > 0;
  }

  /**
   * @param {number} dt
   * @param {{ trigger: boolean, aim: boolean, reload: boolean, blocked?: boolean }} input
   *   trigger/aim are held; reload is "pressed this step"; blocked stops firing (e.g. sprinting).
   * @returns {number} rounds fired this step
   */
  update(dt, input) {
    const cfg = this.cfg;
    this.dryFire = false;
    this.reloadStarted = false;
    this.reloadFinished = false;

    // Aim down sights (eases in/out linearly; the view adds smoothing).
    const aimStep = dt / cfg.adsTime;
    this.aim = input.aim ? Math.min(1, this.aim + aimStep) : Math.max(0, this.aim - aimStep);

    if (input.reload && this.canReload) this._startReload();

    if (this.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        const moved = Math.min(cfg.magazineSize - this.ammo, this.reserve);
        this.ammo += moved;
        this.reserve -= moved;
        this.reloading = false;
        this.reloadTimer = 0;
        this.reloadFinished = true;
      }
    }

    const pressedNow = input.trigger && !this._triggerWasDown;
    this._triggerWasDown = input.trigger;
    this.cooldown = Math.max(this.cooldown - dt, -dt); // allow carry-over within one step only

    if (!input.trigger || input.blocked || this.reloading) {
      if (this.cooldown < 0) this.cooldown = 0;
      return 0;
    }

    if (this.ammo === 0) {
      if (pressedNow) {
        this.dryFire = true;
        if (this.canReload) this._startReload(); // empty: pulling the trigger reloads
      }
      return 0;
    }

    let shots = 0;
    while (this.cooldown <= 0 && this.ammo > 0) {
      this.ammo--;
      shots++;
      this.cooldown += 1 / cfg.fireRate;
    }
    return shots;
  }

  _startReload() {
    this.reloading = true;
    this.reloadTimer = this.cfg.reloadTime;
    this.reloadStarted = true;
  }
}
