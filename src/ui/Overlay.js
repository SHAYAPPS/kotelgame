import { HE } from './strings.he.js';
import './ui.css';

const SENSITIVITY_KEY = 'kotelgame.sensitivity';
const SENSITIVITY_MIN = 0.2;
const SENSITIVITY_MAX = 3;

export function loadSensitivity() {
  try {
    const v = parseFloat(localStorage.getItem(SENSITIVITY_KEY));
    if (Number.isFinite(v)) return Math.min(SENSITIVITY_MAX, Math.max(SENSITIVITY_MIN, v));
  } catch {
    // storage unavailable (private mode etc.): use the default
  }
  return 1;
}

function saveSensitivity(v) {
  try {
    localStorage.setItem(SENSITIVITY_KEY, String(v));
  } catch {
    // ignore
  }
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Start / pause screen (Hebrew, RTL) with the controls list and mouse sensitivity. */
export class Overlay {
  /**
   * @param {{ onStart, sensitivity, onSensitivity, chapters?: { label: string }[],
   *   onChapter?: (i: number) => void }} opts chapters: start-from buttons (the mission's parts)
   */
  constructor(parent, { onStart, sensitivity, onSensitivity, chapters = [], onChapter = null, quality = 'medium', onQuality = null, volumes = null, onVolume = null }) {
    this.root = el('div', 'overlay');
    const panel = el('div', 'overlay-panel');

    panel.append(el('p', 'overlay-eyebrow', HE.buildLabel));
    this.title = el('h1', 'overlay-title', HE.gameTitle);
    panel.append(this.title);

    this.cta = el('button', 'overlay-cta', HE.start);
    this.cta.type = 'button';
    panel.append(this.cta);

    if (chapters.length && onChapter) {
      panel.append(el('h2', 'overlay-section-title', HE.chaptersTitle));
      const grid = el('div', 'overlay-chapters');
      chapters.forEach((c, i) => {
        const b = el('button', 'overlay-chapter', c.label);
        b.type = 'button';
        b.addEventListener('click', () => onChapter(i));
        grid.append(b);
      });
      panel.append(grid);
    }

    this.error = el('p', 'overlay-error', HE.lockError);
    this.error.hidden = true;
    panel.append(this.error);

    panel.append(el('h2', 'overlay-section-title', HE.controlsTitle));
    const list = el('ul', 'overlay-controls');
    for (const { keys, label } of HE.controls) {
      const item = el('li');
      item.append(el('span', null, label));
      const keysEl = el('span', 'overlay-keys');
      keysEl.dir = 'ltr'; // keep "W A S D" in reading order
      for (const k of keys) keysEl.append(el('kbd', null, k));
      item.append(keysEl);
      list.append(item);
    }
    panel.append(list);

    const setting = el('label', 'overlay-setting');
    setting.append(el('span', null, HE.sensitivity));
    const slider = el('input');
    slider.type = 'range';
    slider.min = String(SENSITIVITY_MIN);
    slider.max = String(SENSITIVITY_MAX);
    slider.step = '0.05';
    slider.value = String(sensitivity);
    const output = el('output', null, sensitivity.toFixed(2));
    slider.addEventListener('input', () => {
      const v = parseFloat(slider.value);
      output.textContent = v.toFixed(2);
      saveSensitivity(v);
      onSensitivity(v);
    });
    setting.append(slider, output);
    panel.append(setting);

    // Volume: master, music, effects, voice (0..100 %, saved by the audio).
    if (volumes && onVolume) {
      panel.append(el('h2', 'overlay-section-title', HE.volume.title));
      for (const key of ['master', 'music', 'sfx', 'voice']) {
        const row = el('label', 'overlay-setting overlay-volume');
        row.append(el('span', null, HE.volume[key]));
        const v = el('input');
        v.type = 'range';
        v.min = '0';
        v.max = '100';
        v.step = '1';
        v.value = String(Math.round((volumes[key] ?? 1) * 100));
        const out = el('output', null, `${v.value}%`);
        out.dir = 'ltr';
        v.addEventListener('input', () => {
          out.textContent = `${v.value}%`;
          onVolume(key, parseInt(v.value, 10) / 100);
        });
        row.append(v, out);
        panel.append(row);
      }
    }

    // Graphics quality: low / medium / high (medium targets 60 FPS on an average laptop).
    if (onQuality) {
      const row = el('div', 'overlay-setting overlay-quality');
      row.append(el('span', null, HE.graphics.title));
      const group = el('div', 'overlay-segments');
      group.setAttribute('role', 'radiogroup');
      const buttons = [];
      for (const q of ['low', 'medium', 'high']) {
        const b = el('button', 'overlay-segment', HE.graphics[q]);
        b.type = 'button';
        b.setAttribute('role', 'radio');
        b.addEventListener('click', () => {
          for (const o of buttons) o.setAttribute('aria-checked', String(o === b));
          onQuality(q);
        });
        b.setAttribute('aria-checked', String(q === quality));
        buttons.push(b);
        group.append(b);
      }
      row.append(group);
      panel.append(row);
    }

    // Who made the models, sounds and music (CC-BY works must be credited).
    const credits = el('a', 'overlay-credits', HE.credits);
    credits.href = `${import.meta.env?.BASE_URL ?? '/'}assets/CREDITS.md`;
    credits.target = '_blank';
    credits.rel = 'noopener';
    panel.append(credits);

    this.root.append(panel);
    parent.append(this.root);

    // Start from the button, or by clicking the dimmed backdrop around the panel.
    this.cta.addEventListener('click', () => onStart());
    this.root.addEventListener('click', (e) => {
      if (e.target === this.root) onStart();
    });
  }

  show({ paused }) {
    this.title.textContent = paused ? HE.paused : HE.gameTitle;
    this.cta.textContent = paused ? HE.resume : HE.start;
    this.root.hidden = false;
  }

  hide() {
    this.root.hidden = true;
    this.error.hidden = true;
  }

  showError() {
    this.error.hidden = false;
  }
}
