import { HE } from './strings.he.js';
import './ui.css';

const REFRESH_SECONDS = 0.25;

// Numbers inside Hebrew (RTL) text: isolate them as LTR so signs and units stay put.
function num(value, digits) {
  const v = Math.abs(value) < 0.5 * 10 ** -digits ? 0 : value;
  return `\u2066${v.toFixed(digits)}\u2069`;
}

/** Crosshair + a small performance/movement readout (toggle with the ` key). */
export class Hud {
  constructor(parent, { showDebug = true } = {}) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.hidden = true;
    this.crosshair = document.createElement('div');
    this.crosshair.className = 'crosshair';
    for (let i = 0; i < 5; i++) this.crosshair.append(document.createElement('i'));
    this.root.append(this.crosshair);
    this._gap = -1;
    this._crosshairOpacity = -1;

    this.ammo = document.createElement('div');
    this.ammo.className = 'ammo';
    this.ammo.dir = 'rtl';
    this.ammoCount = document.createElement('div');
    this.ammoCount.className = 'ammo-count';
    this.ammoCount.dir = 'ltr';
    this.ammoStatus = document.createElement('div');
    this.ammoStatus.className = 'ammo-status';
    this.ammo.append(this.ammoCount, this.ammoStatus);
    this.root.append(this.ammo);
    this._ammoKey = '';

    this.debug = document.createElement('pre');
    this.debug.className = 'debug';
    this.debug.dir = 'rtl';
    this.debug.hidden = !showDebug;

    parent.append(this.root, this.debug);

    this._frames = 0;
    this._time = 0;
    this._worstFrame = 0;

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Backquote' && !e.repeat) this.debug.hidden = !this.debug.hidden;
    });
  }

  setPlaying(playing) {
    this.root.hidden = !playing;
  }

  /** @param {number} gapPx distance of the ticks from the center @param {number} opacity */
  setCrosshair(gapPx, opacity) {
    const gap = Math.round(gapPx);
    if (gap !== this._gap) {
      this._gap = gap;
      this.crosshair.style.setProperty('--gap', `${gap}px`);
    }
    const o = Math.round(opacity * 20) / 20;
    if (o !== this._crosshairOpacity) {
      this._crosshairOpacity = o;
      this.crosshair.style.opacity = String(o);
    }
  }

  /** @param {import('../weapons/WeaponState.js').WeaponState} weapon */
  setAmmo(weapon) {
    const low = weapon.ammo <= Math.floor(weapon.cfg.magazineSize / 4);
    let status = '';
    if (weapon.reloading) status = HE.ammo.reloading;
    else if (weapon.ammo === 0 && weapon.reserve === 0) status = HE.ammo.empty;
    else if (low && weapon.reserve > 0) status = HE.ammo.reloadHint;
    const key = `${weapon.ammo}|${weapon.reserve}|${status}`;
    if (key === this._ammoKey) return;
    this._ammoKey = key;
    this.ammoCount.replaceChildren(String(weapon.ammo), ' ');
    const reserve = document.createElement('small');
    reserve.textContent = `/ ${weapon.reserve}`;
    this.ammoCount.append(reserve);
    this.ammoStatus.textContent = status;
    this.ammo.classList.toggle('low', low);
  }

  /**
   * @param {number} frameSeconds real time since the previous frame
   * @param {{ player: import('../player/PlayerController.js').PlayerController, drawCalls: number }} stats
   */
  update(frameSeconds, { player, drawCalls }) {
    this._frames++;
    this._time += frameSeconds;
    this._worstFrame = Math.max(this._worstFrame, frameSeconds);
    if (this._time < REFRESH_SECONDS || this.debug.hidden) return;

    const fps = this._frames / this._time;
    const h = HE.hud;
    const stance = player.crouched ? h.crouching : player.sprinting ? h.sprinting : h.standing;
    this.debug.textContent = [
      `\u2066${h.fps} ${fps.toFixed(0)} (${((this._time / this._frames) * 1000).toFixed(1)}ms, max ${(this._worstFrame * 1000).toFixed(1)}ms)\u2069`,
      `${h.speed}: ${num(player.horizontalSpeed, 2)} ${h.metersPerSecond}`,
      `${h.height}: ${num(player.position.y, 2)} ${h.meters}`,
      `${player.grounded ? h.grounded : h.airborne} · ${stance}`,
      `${h.drawCalls}: ${num(drawCalls, 0)}`,
    ].join('\n');

    this._frames = 0;
    this._time = 0;
    this._worstFrame = 0;
  }
}
