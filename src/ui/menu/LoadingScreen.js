import { HE } from '../strings.he.js';
import { el } from './kit.js';

const FACT_TIME = 7; // seconds per line about the Kotel

/** The loading screen: the title, a progress bar and a line about the Kotel, then "click to continue". */
export class LoadingScreen {
  constructor(parent) {
    this.root = el('div', 'loading');
    const brand = el('div', 'loading-brand');
    brand.append(el('p', 'menu-eyebrow', HE.missionName), el('h1', 'menu-title', HE.gameTitle));
    const bottom = el('div', 'loading-bottom');
    this.fact = el('p', 'loading-fact');
    const bar = el('div', 'loading-bar');
    this.fill = el('div', 'loading-fill');
    bar.append(this.fill);
    this.status = el('div', 'loading-status', HE.loading.title);
    this.status.dir = 'rtl';
    this.prompt = el('div', 'loading-continue', HE.loading.done);
    this.prompt.hidden = true;
    bottom.append(this.fact, bar, this.status, this.prompt);
    this.root.append(brand, bottom);
    parent.append(this.root);
    this.progress = 0;
    this._fact = Math.floor(Math.random() * HE.loading.facts.length);
    this._showFact();
    this._timer = setInterval(() => this._nextFact(), FACT_TIME * 1000);
  }

  _showFact() {
    this.fact.textContent = HE.loading.facts[this._fact % HE.loading.facts.length];
  }

  _nextFact() {
    this.fact.classList.add('out');
    setTimeout(() => {
      this._fact++;
      this._showFact();
      this.fact.classList.remove('out');
    }, 500);
  }

  /** 0..1 */
  setProgress(p) {
    const v = Math.max(this.progress, Math.min(1, p));
    this.progress = v;
    this.fill.style.width = `${(v * 100).toFixed(1)}%`;
    this.status.textContent = `${HE.loading.title} ⁦${Math.round(v * 100)}%⁩`;
  }

  /** Loaded: wait for a click or a key (it also unlocks the sound), then `onContinue()`. */
  ready(onContinue) {
    this.setProgress(1);
    this.status.hidden = true;
    this.prompt.hidden = false;
    this.root.classList.add('ready');
    const go = (e) => {
      if (e.type === 'keydown' && (e.repeat || e.code === 'Tab')) return;
      window.removeEventListener('keydown', go, true);
      this.root.removeEventListener('pointerdown', go);
      // A tap's click comes after its pointerdown, on whatever the menu now shows under the
      // finger: swallow it (no tap-through into New Game).
      if (e.type === 'pointerdown') {
        const swallow = (c) => {
          c.preventDefault();
          c.stopPropagation();
        };
        window.addEventListener('click', swallow, { capture: true, once: true });
        setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 700);
      }
      onContinue();
    };
    window.addEventListener('keydown', go, true);
    this.root.addEventListener('pointerdown', go);
  }

  hide() {
    clearInterval(this._timer);
    this.root.hidden = true;
  }
}
