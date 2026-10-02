import { ACTIONS, RESERVED, keyLabel } from '../../core/Bindings.js';
import { LIMITS } from '../../core/Settings.js';
import { EFFECTS, effectsFor } from '../../core/Graphics.js';
import { HE } from '../strings.he.js';
import { button, el, row, segments, slider, toggle } from './kit.js';

const TABS = ['controls', 'graphics', 'audio', 'gameplay'];
const pct = (v) => `${Math.round(v * 100)}%`;

/**
 * The settings (shared by the main and pause menus): controls (mouse, invert, key
 * rebinding), graphics (quality, field of view, FPS counter), audio (volumes) and gameplay
 * (difficulty, subtitles). Every change applies at once through `onChange(key, value)`
 * (Game applies and saves it).
 */
export class SettingsPanel {
  /**
   * @param {{ settings: object, bindings: import('../../core/Bindings.js').Bindings,
   *   onChange: (key: string, value: unknown) => void, onBack: () => void, touch?: boolean }} opts
   *   touch: a phone or tablet (no keys to rebind; the sensitivity is the touch look's)
   */
  constructor({ settings, bindings, onChange, onBack, touch = false }) {
    this.touch = touch;
    this.settings = settings;
    this.bindings = bindings;
    this.onChange = onChange;
    this.capturing = null; // the key button waiting for a key
    const S = HE.settings;

    this.root = el('div', 'menu-panel');
    this.root.hidden = true;
    this.root.append(el('h2', null, S.title));
    const tabs = el('div', 'menu-tabs');
    tabs.setAttribute('role', 'tablist');
    this.root.append(tabs);
    const body = el('div', 'menu-panel-body');
    this.root.append(body);
    this.tabs = {};
    this.pages = {};
    for (const id of TABS) {
      const t = el('button', 'menu-tab', S.tabs[id]);
      t.type = 'button';
      t.setAttribute('role', 'tab');
      t.addEventListener('click', () => this.show(id));
      tabs.append(t);
      this.tabs[id] = t;
      const page = el('div', 'menu-tab-page');
      page.setAttribute('role', 'tabpanel');
      body.append(page);
      this.pages[id] = page;
    }
    this._controls(this.pages.controls);
    this._graphics(this.pages.graphics);
    this._audio(this.pages.audio);
    this._gameplay(this.pages.gameplay);

    const actions = el('div', 'menu-panel-actions');
    this.back = button(HE.menu.back, 'menu-button primary', onBack);
    actions.append(this.back);
    this.root.append(actions);

    // Key capture: the next key or mouse button after clicking an action's key.
    this._onKey = (e) => {
      if (!this.capturing) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'Escape') return this._endCapture();
      if (RESERVED.has(e.code)) return this._flash(this.capturing.button);
      this._assign(e.code);
    };
    this._onMouse = (e) => {
      if (!this.capturing) return;
      e.preventDefault();
      e.stopPropagation();
      this._assign(`Mouse${e.button}`);
    };
    this._noMenu = (e) => {
      if (this.capturing) e.preventDefault();
    };
  }

  open(tab = 'controls') {
    this.root.hidden = false;
    this.refresh();
    this.show(tab);
  }

  close() {
    this._endCapture();
    this.root.hidden = true;
  }

  show(id) {
    this._endCapture();
    for (const t of TABS) {
      this.tabs[t].setAttribute('aria-selected', String(t === id));
      this.pages[t].hidden = t !== id;
    }
    this.current = id;
    this.tabs[id].focus({ preventScroll: true });
  }

  /** Every control back in line with the settings (after they changed elsewhere). */
  refresh() {
    const s = this.settings;
    this.w.sensitivity.set(s.sensitivity);
    this.w.aimSensitivity.set(s.aimSensitivity);
    this.w.invertY.set(s.invertY);
    this.w.quality.set(s.quality);
    this._effectsRefresh();
    this.w.fov.set(s.fov);
    this.w.showFps.set(s.showFps);
    for (const k of Object.keys(this.w.volumes)) this.w.volumes[k].set(s.volumes[k]);
    this.w.difficulty.set(s.difficulty);
    this.w.difficultyHint.textContent = HE.settings.difficultyHint[s.difficulty];
    this.w.subtitles.set(s.subtitles);
    this._keyLabels();
  }

  _controls(page) {
    const S = HE.settings;
    const s = this.settings;
    this.w = { volumes: {} };
    const f2 = (v) => v.toFixed(2);
    this.w.sensitivity = slider({ min: LIMITS.sensitivity[0], max: LIMITS.sensitivity[1], step: 0.05, value: s.sensitivity, format: f2, onInput: (v) => this.onChange('sensitivity', v) });
    page.append(row(this.touch ? S.lookSensitivity : S.sensitivity, this.w.sensitivity));
    this.w.aimSensitivity = slider({ min: LIMITS.aimSensitivity[0], max: LIMITS.aimSensitivity[1], step: 0.05, value: s.aimSensitivity, format: f2, onInput: (v) => this.onChange('aimSensitivity', v) });
    page.append(row(S.aimSensitivity, this.w.aimSensitivity));
    this.w.invertY = toggle(s.invertY, { on: S.on, off: S.off }, (v) => this.onChange('invertY', v));
    page.append(row(S.invertY, this.w.invertY));

    this.keyButtons = {};
    if (this.touch) return; // (the on-screen controls: no keys)
    page.append(el('h3', null, S.bindingsTitle));
    page.append(el('p', null, S.bindingsHint));
    for (const a of ACTIONS) {
      const b = el('button', 'menu-key');
      b.type = 'button';
      b.dir = 'ltr';
      b.addEventListener('click', () => this._capture(a.id, b));
      this.keyButtons[a.id] = b;
      page.append(row(HE.actions[a.id], b));
    }
    const reset = button(S.resetKeys, 'menu-button', () => {
      this.bindings.reset();
      this._keyLabels();
      this.onChange('bindings', this.bindings.changed());
    });
    const resetRow = el('div', 'menu-panel-actions');
    resetRow.append(reset);
    page.append(resetRow);

    page.append(el('h3', null, S.fixedKeys));
    const fixed = el('div', 'menu-fixed-keys');
    for (const { keys, label } of HE.fixedControls) {
      const k = el('span');
      for (const key of keys) k.append(el('kbd', null, key));
      fixed.append(row(label, k));
    }
    page.append(fixed);
  }

  _graphics(page) {
    const S = HE.settings;
    const s = this.settings;
    this.w.quality = segments(['low', 'medium', 'high', 'ultra'].map((id) => ({ id, label: HE.graphics[id] })), s.quality, (v) => {
      this.onChange('quality', v);
      this._effectsRefresh();
    });
    page.append(row(S.quality, this.w.quality, S.qualityHint));
    this.w.fov = slider({ min: LIMITS.fov[0], max: LIMITS.fov[1], step: 1, value: s.fov, format: (v) => `${Math.round(v)}°`, onInput: (v) => this.onChange('fov', Math.round(v)) });
    page.append(row(S.fov, this.w.fov));
    this.w.showFps = toggle(s.showFps, { on: S.on, off: S.off }, (v) => this.onChange('showFps', v));
    page.append(row(S.showFps, this.w.showFps));
    // Every effect on its own, over the preset (a preset resets them).
    page.append(el('h3', null, S.effectsTitle));
    page.append(el('p', null, S.effectsHint));
    this.w.effects = {};
    const set = (k, v) => this.onChange('effects', { ...this.settings.effects, [k]: v });
    const now = effectsFor(s.quality, s.effects);
    for (const k of EFFECTS) {
      const w =
        k === 'motionBlur'
          ? segments(['off', 'low', 'high'].map((id) => ({ id, label: S.motionBlurLevels[id] })), now[k], (v) => set(k, v))
          : toggle(now[k], { on: S.on, off: S.off }, (v) => set(k, v));
      this.w.effects[k] = w;
      page.append(row(S.effects[k], w));
    }
  }

  /** The effect switches as the preset and the player's own choices make them now. */
  _effectsRefresh() {
    const now = effectsFor(this.settings.quality, this.settings.effects);
    for (const k of EFFECTS) this.w.effects[k]?.set(now[k]);
  }

  _audio(page) {
    const S = HE.settings;
    for (const k of ['master', 'music', 'sfx', 'voice']) {
      const w = slider({ min: 0, max: 1, step: 0.01, value: this.settings.volumes[k], format: pct, onInput: (v) => this.onChange('volumes', { ...this.settings.volumes, [k]: v }) });
      this.w.volumes[k] = w;
      page.append(row(S.volume[k], w));
    }
  }

  _gameplay(page) {
    const S = HE.settings;
    const s = this.settings;
    this.w.difficultyHint = el('small', null, S.difficultyHint[s.difficulty]);
    this.w.difficulty = segments(['easy', 'normal', 'hard'].map((id) => ({ id, label: S.difficultyLevels[id] })), s.difficulty, (v) => {
      this.w.difficultyHint.textContent = S.difficultyHint[v];
      this.onChange('difficulty', v);
    });
    const r = row(S.difficulty, this.w.difficulty);
    r.firstChild.append(this.w.difficultyHint);
    page.append(r);
    this.w.subtitles = toggle(s.subtitles, { on: S.on, off: S.off }, (v) => this.onChange('subtitles', v));
    page.append(row(S.subtitles, this.w.subtitles));
  }

  _keyLabels() {
    for (const a of ACTIONS) if (this.keyButtons[a.id]) this.keyButtons[a.id].textContent = keyLabel(this.bindings.key(a.id));
  }

  _capture(id, b) {
    this._endCapture();
    this.capturing = { id, button: b };
    b.classList.add('listening');
    b.textContent = HE.settings.pressKey;
    // After this click is over, so the click itself isn't taken as the new key.
    setTimeout(() => {
      if (this.capturing?.button !== b) return;
      window.addEventListener('keydown', this._onKey, true);
      window.addEventListener('mousedown', this._onMouse, true);
      window.addEventListener('contextmenu', this._noMenu, true);
    }, 0);
  }

  _assign(code) {
    const { id, button: b } = this.capturing;
    const swapped = this.bindings.set(id, code);
    this._endCapture();
    this._keyLabels();
    if (swapped) this._flash(this.keyButtons[swapped]);
    this.onChange('bindings', this.bindings.changed());
    b.focus({ preventScroll: true });
  }

  _endCapture() {
    if (!this.capturing) return;
    this.capturing.button.classList.remove('listening');
    this.capturing = null;
    window.removeEventListener('keydown', this._onKey, true);
    window.removeEventListener('mousedown', this._onMouse, true);
    window.removeEventListener('contextmenu', this._noMenu, true);
    this._keyLabels();
  }

  _flash(b) {
    b.classList.add('flash');
    setTimeout(() => b.classList.remove('flash'), 700);
  }
}
