import { GAME_CREDITS } from '../gameCredits.he.js';
import { HE } from '../strings.he.js';
import { buildRoll, parseCredits } from './creditsRoll.js';
import { el } from './kit.js';

const SPEED = 42; // px per second
const BASE = import.meta.env?.BASE_URL ?? '/';

/**
 * The credits: the game's own (gameCredits.he.js: who made it, the voices), then every asset
 * from CREDITS.md with its author and license, rolling up the screen. The wheel or the arrow
 * keys scroll it by hand; Esc or a click goes back.
 */
export class CreditsScreen {
  constructor(parent, { onClose }) {
    this.onClose = onClose;
    this.root = el('div', 'credits');
    this.root.hidden = true;
    this.roll = el('div', 'credits-roll');
    this.root.append(this.roll, el('div', 'credits-hint', HE.creditsScreen.hint));
    parent.append(this.root);
    this._built = false;
    this._raf = 0;
    this.root.addEventListener('click', () => this.onClose());
    this.root.addEventListener('wheel', (e) => {
      this.y -= e.deltaY * 0.6;
      e.preventDefault();
    }, { passive: false });
  }

  async open() {
    this.root.hidden = false;
    this.y = window.innerHeight * 0.85;
    if (!this._built) {
      this._built = true;
      let roll = [];
      try {
        const md = await fetch(`${BASE}assets/CREDITS.md`).then((r) => (r.ok ? r.text() : ''));
        roll = buildRoll(parseCredits(md));
      } catch {
        roll = [];
      }
      this._build(roll);
    }
    let last = performance.now();
    const tick = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      this.y -= SPEED * dt;
      const h = this.roll.offsetHeight;
      if (this.y < -h) this.y = window.innerHeight; // round again
      this.roll.style.transform = `translateY(${this.y.toFixed(1)}px)`;
      this._raf = requestAnimationFrame(tick);
    };
    cancelAnimationFrame(this._raf);
    this._raf = requestAnimationFrame(tick);
  }

  /** Arrow keys: scroll by hand. */
  key(code) {
    if (code === 'ArrowDown' || code === 'PageDown') this.y -= 120;
    else if (code === 'ArrowUp' || code === 'PageUp') this.y += 120;
  }

  close() {
    cancelAnimationFrame(this._raf);
    this.root.hidden = true;
  }

  _build(roll) {
    const r = this.roll;
    const C = GAME_CREDITS;
    r.append(el('p', 'menu-eyebrow', HE.missionName), el('h1', 'credits-title', HE.gameTitle));
    r.append(el('div', 'credits-heading', C.createdBy.label));
    for (const n of C.createdBy.names) r.append(entry(n));
    r.append(el('div', 'credits-heading', C.voices.label));
    for (const v of C.voices.roles) r.append(entry(v.name, v.role));
    for (const s of roll) {
      r.append(el('div', 'credits-heading', s.heading));
      for (const e of s.entries) r.append(entry(e.title, e.by, e.license, true));
      for (const n of s.notices) {
        const p = el('p', 'credits-notice', n);
        p.dir = 'ltr';
        r.append(p);
      }
    }
    r.append(el('div', 'credits-heading', HE.creditsScreen.software));
    for (const s of C.software) r.append(entry(s.title, s.by, s.license, true));
    r.append(el('div', 'credits-thanks', C.thanks));
  }
}

function entry(title, by = '', license = '', ltr = false) {
  const d = el('div', 'credits-entry');
  if (ltr) d.dir = 'ltr';
  d.append(el('b', null, title));
  if (by) d.append(el('span', null, by));
  if (license) d.append(el('i', null, license));
  return d;
}
