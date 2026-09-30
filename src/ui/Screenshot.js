import { HE } from './strings.he.js';

const pad = (n) => String(n).padStart(2, '0');

/** File name from the local time: kotel-2026-09-30_21-45-07.png */
export function screenshotName(date = new Date()) {
  const d = date;
  return `kotel-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}.png`;
}

/**
 * P: save what the game shows (the 3D view with the weapon, no HUD) as a PNG. The dev server
 * writes it into the project (`screenshots/game/`, see vite.config.js); a production build
 * (or a failed upload) downloads it instead.
 */
export class Screenshot {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas, parent = document.body) {
    this.canvas = canvas;
    this.pending = false;
    this.toast = document.createElement('div');
    this.toast.className = 'shot-toast';
    this.toast.hidden = true;
    parent.append(this.toast);
    this._hideTimer = 0;
  }

  /** Take one on the next rendered frame. */
  request() {
    this.pending = true;
  }

  /**
   * Call right after the frame is drawn: the WebGL drawing buffer is only readable until the
   * browser presents it.
   */
  capture() {
    if (!this.pending) return;
    this.pending = false;
    const name = screenshotName();
    this.canvas.toBlob((blob) => {
      if (blob) this._save(blob, name);
    }, 'image/png');
  }

  async _save(blob, name) {
    if (import.meta.env.DEV) {
      try {
        const r = await fetch(`/__screenshot?name=${encodeURIComponent(name)}`, { method: 'POST', body: blob });
        if (r.ok) {
          const { path } = await r.json();
          this._show(`${HE.screenshot.savedTo} ⁦${path}⁩`);
          return;
        }
      } catch {
        // No dev endpoint (e.g. `vite preview`): download it.
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    this._show(HE.screenshot.downloaded);
  }

  _show(text) {
    this.toast.textContent = text;
    this.toast.hidden = false;
    clearTimeout(this._hideTimer);
    this._hideTimer = setTimeout(() => {
      this.toast.hidden = true;
    }, 2500);
  }
}
