import { Vector3 } from 'three';
import { CARDS, HINTS, OBJECTIVES, STORY_UI } from '../story/text.he.js';
import './ui.css';

const _v = new Vector3();

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

/**
 * Story HUD (Hebrew, RTL): objective, 3D waypoint marker with distance, subtitles with
 * speaker names, key hints, the talk prompt, title / end cards, the mission-failed
 * screen and the F2 step menu (dev tool).
 */
export class StoryHud {
  constructor(parent) {
    this.root = el('div', 'story-hud');
    this.root.dir = 'rtl';

    this.objective = el('div', 'objective');
    this.objectiveLabel = el('span', 'objective-label', STORY_UI.objectivePrefix);
    this.objectiveText = el('span', 'objective-text');
    this.objectiveCount = el('span', 'objective-count');
    this.objectiveCount.hidden = true;
    this.objective.append(this.objectiveLabel, this.objectiveText, this.objectiveCount);
    this._countKey = null;
    this.objective.hidden = true;

    this.marker = el('div', 'waypoint');
    this.markerIcon = el('div', 'waypoint-icon');
    this.markerDist = el('div', 'waypoint-dist');
    this.markerDist.dir = 'rtl';
    this.marker.append(this.markerIcon, this.markerDist);
    this.marker.hidden = true;

    this.subtitle = el('div', 'subtitle');
    this.subtitleName = el('span', 'subtitle-name');
    this.subtitleText = el('span', 'subtitle-text');
    this.subtitle.append(this.subtitleName, this.subtitleText);
    this.subtitle.hidden = true;

    this.hint = el('div', 'story-hint');
    this.hint.hidden = true;

    this.prompt = el('div', 'talk-prompt');
    this.prompt.hidden = true;

    this.card = el('div', 'title-card');
    this.card.hidden = true;

    this.fail = el('div', 'mission-failed');
    this.failTitle = el('div', 'mission-failed-title', STORY_UI.failedTitle);
    this.failReason = el('div', 'mission-failed-reason');
    this.fail.append(this.failTitle, this.failReason, el('div', 'mission-failed-retry', STORY_UI.retry));
    this.fail.hidden = true;

    this.fadeLayer = el('div', 'story-fade');
    this.fadeLayer.hidden = true;
    this._fade = -1;

    this.checkpointToast = el('div', 'checkpoint-toast', STORY_UI.checkpoint);
    this.checkpointToast.hidden = true;

    this.root.append(this.objective, this.marker, this.subtitle, this.hint, this.prompt, this.checkpointToast);
    parent.append(this.fadeLayer, this.root, this.card, this.fail);

    this.menu = null;
    this._objectiveKey = null;
    this._subtitleId = null;
    this._cardTimer = 0;
    this._toastTimer = 0;
  }

  setVisible(v) {
    this.root.hidden = !v;
  }

  setObjective(textId) {
    if (textId === this._objectiveKey) return;
    this._objectiveKey = textId;
    this.objective.hidden = !textId;
    if (textId) {
      this.objectiveText.textContent = OBJECTIVES[textId] ?? textId;
      // Retrigger the "new objective" highlight.
      this.objective.classList.remove('fresh');
      void this.objective.offsetWidth;
      this.objective.classList.add('fresh');
    }
  }

  /** Counter under the objective ("civilians left: 7"), or hidden with label null. */
  setObjectiveCount(label, n) {
    const key = label ? `${label}|${n}` : null;
    if (key === this._countKey) return;
    this._countKey = key;
    this.objectiveCount.hidden = !label;
    if (label) this.objectiveCount.textContent = `${label}: \u2066${n}\u2069`;
  }

  setHint(id) {
    this.hint.hidden = !id;
    if (!id) return;
    const h = HINTS[id];
    this.hint.replaceChildren();
    const keys = el('span', 'story-hint-keys');
    keys.dir = 'ltr';
    for (const k of h.keys) keys.append(el('kbd', null, k));
    this.hint.append(keys, el('span', null, h.text));
  }

  /** "[E] <label>" near the crosshair, or hidden with null. */
  setPrompt(label) {
    if (label === this._promptLabel) return;
    this._promptLabel = label;
    this.prompt.hidden = !label;
    if (!label) return;
    this.prompt.replaceChildren();
    const k = el('kbd', null, 'E');
    this.prompt.append(k, el('span', null, label));
  }

  /** @param {{ id, name, color, radio, text } | null} line */
  setSubtitle(line) {
    const id = line ? line.id : null;
    if (id === this._subtitleId) return;
    this._subtitleId = id;
    this.subtitle.hidden = !line;
    if (!line) return;
    this.subtitleName.textContent = `${line.radio ? '📻 ' : ''}${line.name}:`;
    this.subtitleName.style.color = line.color;
    this.subtitleText.textContent = line.text;
    this.subtitle.classList.toggle('radio', line.radio);
  }

  showCard(cardId, seconds) {
    const lines = CARDS[cardId] ?? [cardId];
    this.card.replaceChildren(...lines.map((t, i) => el('div', i === 0 ? 'title-card-main' : 'title-card-sub', t)));
    this.card.dir = 'rtl';
    this.card.hidden = false;
    this.card.classList.remove('out');
    this._cardTimer = seconds;
  }

  /** Black fade over the world (0 = clear, 1 = black). */
  setFade(v) {
    const r = Math.round(v * 60) / 60;
    if (r === this._fade) return;
    this._fade = r;
    this.fadeLayer.hidden = r <= 0;
    this.fadeLayer.style.opacity = String(r);
  }

  hideCard() {
    this.card.hidden = true;
    this._cardTimer = 0;
  }

  showFailed(reason) {
    this.failReason.textContent = reason;
    this.fail.hidden = false;
  }

  hideFailed() {
    this.fail.hidden = true;
  }

  flashCheckpoint() {
    this.checkpointToast.hidden = false;
    this._toastTimer = 2;
  }

  /**
   * Per frame: waypoint marker position and timers.
   * @param {Vector3 | null} target world position of the objective
   * @param {import('three').Camera} camera
   * @param {Vector3} playerPos
   */
  update(dt, target, camera, playerPos) {
    if (this._cardTimer > 0) {
      this._cardTimer -= dt;
      if (this._cardTimer <= 1) this.card.classList.add('out');
      if (this._cardTimer <= 0) this.card.hidden = true;
    }
    if (this._toastTimer > 0) {
      this._toastTimer -= dt;
      if (this._toastTimer <= 0) this.checkpointToast.hidden = true;
    }
    if (!target) {
      this.marker.hidden = true;
      return;
    }
    this.marker.hidden = false;
    const w = window.innerWidth;
    const h = window.innerHeight;
    _v.copy(target).project(camera);
    let x = (_v.x + 1) / 2;
    let y = (1 - _v.y) / 2;
    const behind = _v.z > 1;
    if (behind) {
      // Behind you: pin to the bottom edge on the side it is on.
      x = x < 0.5 ? 0.97 : 0.03;
      y = 0.9;
    }
    const m = 0.04;
    const clamped = behind || x < m || x > 1 - m || y < m || y > 1 - m;
    x = Math.min(1 - m, Math.max(m, x));
    y = Math.min(1 - m, Math.max(m, y));
    this.marker.style.transform = `translate(${x * w}px, ${y * h}px)`;
    this.marker.classList.toggle('edge', clamped);
    const d = Math.hypot(target.x - playerPos.x, target.z - playerPos.z);
    this.markerDist.textContent = `⁦${Math.round(d)}⁩ ${STORY_UI.meters}`;
  }

  /** F2 menu: steps to jump to plus a weapon toggle for testing. */
  toggleMenu(steps, currentIndex, { onJump, onWeapon, onClose }) {
    if (this.menu) {
      this.menu.remove();
      this.menu = null;
      onClose();
      return false;
    }
    const m = el('div', 'dev-menu');
    m.dir = 'rtl';
    m.append(el('h2', null, STORY_UI.devMenuTitle));
    const list = el('ol', 'dev-menu-list');
    steps.forEach((s, i) => {
      const li = el('li');
      const b = el('button', i === currentIndex ? 'current' : '', s.label ?? s.id);
      b.type = 'button';
      b.addEventListener('click', () => {
        this.toggleMenu(steps, i, { onJump, onWeapon, onClose });
        onJump(i);
      });
      li.append(b);
      list.append(li);
    });
    m.append(list);
    const row = el('div', 'dev-menu-row');
    const weapon = el('button', null, STORY_UI.devWeapon);
    weapon.type = 'button';
    weapon.addEventListener('click', () => {
      this.toggleMenu(steps, currentIndex, { onJump, onWeapon, onClose });
      onWeapon();
    });
    const close = el('button', null, STORY_UI.devClose);
    close.type = 'button';
    close.addEventListener('click', () => this.toggleMenu(steps, currentIndex, { onJump, onWeapon, onClose }));
    row.append(weapon, close);
    m.append(row);
    document.body.append(m);
    this.menu = m;
    return true;
  }
}
