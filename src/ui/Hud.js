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
    const crosshair = document.createElement('div');
    crosshair.className = 'crosshair';
    this.root.append(crosshair);

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
