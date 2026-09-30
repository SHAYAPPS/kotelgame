import { HE } from './strings.he.js';
import './ui.css';

const MAX_INDICATORS = 6;

/**
 * Screen feedback for player health: red edges that deepen as you get hurt, a flash
 * on each hit, arcs around the crosshair pointing at whoever shot you, a hit marker
 * when your shots land, and the death fade.
 */
export class DamageOverlay {
  constructor(parent) {
    this.vignette = el('div', 'damage-vignette');
    this.flash = el('div', 'damage-flash');
    this.ring = el('div', 'hit-ring');
    this.arcs = Array.from({ length: MAX_INDICATORS }, () => {
      const a = el('div', 'hit-arc');
      this.ring.append(a);
      return a;
    });
    this.marker = el('div', 'hitmarker');
    for (let i = 0; i < 4; i++) this.marker.append(document.createElement('i'));
    this.death = el('div', 'death-fade');
    this.death.dir = 'rtl';
    const title = el('div', 'death-title');
    title.textContent = HE.death.title;
    const sub = el('div', 'death-sub');
    sub.textContent = HE.death.subtitle;
    this.death.append(title, sub);
    parent.append(this.vignette, this.flash, this.ring, this.marker, this.death);
    for (const e of [this.vignette, this.flash, this.ring, this.marker, this.death]) e.hidden = true;
    this.markerTimer = 0;
    this._last = { v: -1, f: -1, d: -1 };
  }

  /** Your shot hit an enemy. */
  showHitmarker(killed) {
    this.markerTimer = killed ? 0.35 : 0.18;
    this.marker.classList.toggle('kill', killed);
  }

  /**
   * @param {number} dt
   * @param {import('../player/PlayerHealth.js').PlayerHealth} health
   * @param {{ x: number, z: number }} playerPos
   * @param {number} viewYaw
   * @param {number} deathFade 0..1
   */
  update(dt, health, playerPos, viewYaw, deathFade) {
    const hurt = health.hurt;
    setOpacity(this.vignette, Math.min(1, Math.pow(hurt, 0.8) * 1.15), this._last, 'v');
    setOpacity(this.flash, health.hitFlash * 0.55, this._last, 'f');
    setOpacity(this.death, deathFade, this._last, 'd');

    // Direction arcs: 0 deg = in front (top of the screen), clockwise = to your right.
    const inds = health.indicators;
    for (let i = 0; i < MAX_INDICATORS; i++) {
      const arc = this.arcs[i];
      const ind = inds[i];
      if (!ind) {
        arc.style.opacity = '0';
        continue;
      }
      const toYaw = Math.atan2(-(ind.x - playerPos.x), -(ind.z - playerPos.z));
      const rel = Math.atan2(Math.sin(toYaw - viewYaw), Math.cos(toYaw - viewYaw));
      arc.style.transform = `rotate(${(-rel * 180) / Math.PI}deg)`;
      arc.style.opacity = String(Math.max(0, 1 - ind.age / health.cfg.indicatorTime));
    }

    this.markerTimer = Math.max(0, this.markerTimer - dt);
    this.marker.hidden = this.markerTimer <= 0;
    this.ring.hidden = inds.length === 0;
  }
}

function el(tag, className) {
  const e = document.createElement(tag);
  e.className = className;
  return e;
}

function setOpacity(elem, value, cache, key) {
  const v = Math.round(value * 50) / 50;
  if (cache[key] === v) return;
  cache[key] = v;
  elem.style.opacity = String(v);
  elem.hidden = v === 0; // fully hidden layers cost nothing to composite
}
