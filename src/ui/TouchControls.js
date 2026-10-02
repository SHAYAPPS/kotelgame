import './touch.css';

// Line icons (24x24, stroked with the button's color).
const ICONS = {
  fire: '<circle cx="12" cy="12" r="7"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>',
  aim: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.5"/><path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3"/>',
  jump: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  crouch: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  reload: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 3.5v5h-5"/>',
  grenade: '<circle cx="12" cy="14" r="6.5"/><path d="M10 7.5V5h4v2.5M14 5l3-2"/>',
  swap: '<path d="M4 8h14l-3.5-3.5M20 16H6l3.5 3.5"/>',
  pause: '<path d="M9 5v14M15 5v14"/>',
};

// The buttons: hold (down while the finger is), toggle (each tap), press (a tap: the game reads
// the press). `look`: dragging the finger on the button turns the view too.
const BUTTONS = [
  { id: 'fire', type: 'hold', look: true },
  { id: 'aim', type: 'toggle' },
  { id: 'jump', type: 'press' },
  { id: 'crouch', type: 'press' },
  { id: 'reload', type: 'press' },
  { id: 'grenade', type: 'hold', look: true },
  { id: 'swap', type: 'press', code: 'WheelDown' },
  { id: 'pause', type: 'pause' },
];

// The left share of the screen is the stick's (it starts where the thumb lands); the rest drags
// the view.
const STICK_SHARE = 0.42;
const DEAD_ZONE = 0.12;
// Sprint: the thumb pushed past the stick's rim, close to straight ahead.
const SPRINT_PUSH = 1.12;
const SPRINT_CONE = 0.8; // forward share of the push (cos of ~37 degrees)
// A drag across the whole screen's width turns the view ~170 degrees at sensitivity 1.
const LOOK_SCREEN = 1500;

function svgIcon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
}

/**
 * On-screen controls for phones and tablets (Input.touch): a stick wherever the left thumb
 * lands (move; pushed past its rim straight ahead: sprint), the right side drags the view, and
 * buttons for fire, aim (on / off), jump, crouch, reload (the magazine check with the weapon
 * lowered), grenade (hold to aim the throw, release to throw), the weapon swap and pause. They
 * press the player's bound codes in `input`, so the game reads them like keys and mouse
 * buttons. Fire and grenade turn the view too while the finger drags. Shown while playing.
 */
export class TouchControls {
  /**
   * @param {HTMLElement} parent
   * @param {{ input: import('../core/Input.js').Input, bindings: import('../core/Bindings.js').Bindings,
   *   onPause: () => void }} o
   */
  constructor(parent, { input, bindings, onPause }) {
    this.input = input;
    this.bindings = bindings;
    this.onPause = onPause;
    this.pointers = new Map(); // pointerId -> { kind: 'stick' | 'look' | 'button', ... }
    this.aimOn = false;
    this.sprinting = false;
    this.visible = false;

    this.root = document.createElement('div');
    this.root.className = 'touch-controls';
    this.root.hidden = true;
    this.root.dir = 'ltr';

    this.stick = document.createElement('div');
    this.stick.className = 'touch-stick idle';
    this.knob = document.createElement('div');
    this.knob.className = 'touch-stick-knob';
    this.stick.append(this.knob);
    this.root.append(this.stick);

    this.buttons = {};
    for (const b of BUTTONS) {
      const e = document.createElement('div');
      e.className = `touch-btn touch-${b.id}`;
      e.dataset.action = b.id;
      e.innerHTML = svgIcon(b.id);
      this.root.append(e);
      this.buttons[b.id] = e;
    }

    // Portrait: ask for landscape (shown over everything, menus too).
    this.rotate = document.createElement('div');
    this.rotate.className = 'touch-rotate';
    this.rotate.innerHTML = `<div class="touch-rotate-icon">${'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M3 9a9 9 0 0 1 4-5M21 15a9 9 0 0 1-4 5"/></svg>'}</div><div class="touch-rotate-text" dir="rtl">סובבו את המכשיר לרוחב</div>`;
    parent.append(this.root, this.rotate);

    this.root.addEventListener('pointerdown', (e) => this._down(e));
    this.root.addEventListener('pointermove', (e) => this._move(e));
    this.root.addEventListener('pointerup', (e) => this._up(e));
    this.root.addEventListener('pointercancel', (e) => this._up(e));
    // (No long-press menus, no text selection.)
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Playing or not: hidden (and everything let go) in the menus. */
  setVisible(v) {
    if (v === this.visible) return;
    this.visible = v;
    this.root.hidden = !v;
    if (!v) this.reset();
  }

  /** Let go of everything (the game's input is cleared separately). */
  reset() {
    for (const [, p] of this.pointers) if (p.kind === 'button') this._buttonUp(p);
    this.pointers.clear();
    this._stickEnd();
    this._setAim(false);
  }

  /**
   * Per frame: which buttons the moment has. `armed`: the weapon is up (fire, aim, grenade);
   * `canReload`: reload / the magazine check; `launcher`: a second weapon to swap to;
   * `grenades`: how many are left.
   */
  update({ armed, canReload, launcher, grenades }) {
    const show = (id, on) => {
      const b = this.buttons[id];
      if (b.hidden === !on) return;
      b.hidden = !on;
    };
    show('fire', armed);
    show('aim', armed);
    show('grenade', armed && grenades > 0);
    show('swap', armed && launcher);
    show('reload', canReload);
    if (!armed && this.aimOn) this._setAim(false);
  }

  /** A tap on the talk prompt's button: 'E' (use, talk) or 'F' (stop / confiscate). */
  tapKey(key) {
    this._press(key === 'F' ? 'deny' : 'interact');
  }

  // ---------------------------------------------------------------------------

  _code(id) {
    return this.bindings.codes(id)[0];
  }

  /** A press the game reads once (and no hold). */
  _press(id, code = this._code(id)) {
    if (code) this.input.pressed.add(code);
  }

  _hold(code, on) {
    if (!code) return;
    const i = this.input;
    if (on) {
      if (!i.held.has(code)) i.pressed.add(code);
      i.held.add(code);
    } else i.held.delete(code);
  }

  _setAim(on) {
    this.aimOn = on;
    this._hold(this._code('aim'), on);
    this.buttons.aim.classList.toggle('on', on);
  }

  _down(e) {
    e.preventDefault(); // (no emulated mouse events, no scrolling or zoom)
    if (this.pointers.has(e.pointerId)) return;
    const target = e.target instanceof Element ? e.target.closest('[data-action]') : null;
    if (target) {
      const def = BUTTONS.find((b) => b.id === target.dataset.action);
      const p = { kind: 'button', def, el: target, x: e.clientX, y: e.clientY };
      this.pointers.set(e.pointerId, p);
      this._buttonDown(p);
      return;
    }
    if (e.clientX < window.innerWidth * STICK_SHARE && !this._stickPointer) {
      this._stickStart(e);
      return;
    }
    this.pointers.set(e.pointerId, { kind: 'look', x: e.clientX, y: e.clientY });
  }

  _move(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    e.preventDefault();
    if (p.kind === 'stick') {
      this._stickMove(e.clientX, e.clientY);
      return;
    }
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (p.kind === 'look' || p.def?.look) {
      const k = LOOK_SCREEN / Math.max(320, window.innerWidth);
      this.input.mouseDX += dx * k;
      this.input.mouseDY += dy * k;
    }
  }

  _up(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    this.pointers.delete(e.pointerId);
    if (p.kind === 'stick') this._stickEnd();
    else if (p.kind === 'button') this._buttonUp(p);
  }

  _buttonDown(p) {
    const { def, el } = p;
    el.classList.add('down');
    if (def.type === 'pause') this.onPause();
    else if (def.type === 'toggle') this._setAim(!this.aimOn);
    else if (def.type === 'press' && def.code) this._press(def.id, def.code);
    else this._hold(def.code ?? this._code(def.id), true);
  }

  _buttonUp(p) {
    const { def, el } = p;
    el.classList.remove('down');
    if (def.type === 'hold' || (def.type === 'press' && !def.code)) this._hold(def.code ?? this._code(def.id), false);
  }

  // --- The stick -------------------------------------------------------------

  _radius() {
    return Math.min(64, window.innerHeight * 0.16);
  }

  _stickStart(e) {
    const R = this._radius();
    // The base where the thumb landed, kept on screen.
    this._ox = Math.max(R + 8, e.clientX);
    this._oy = Math.min(window.innerHeight - R - 8, Math.max(R + 8, e.clientY));
    this._stickPointer = e.pointerId;
    this.pointers.set(e.pointerId, { kind: 'stick' });
    this.stick.classList.remove('idle');
    this.stick.style.left = `${this._ox}px`;
    this.stick.style.top = `${this._oy}px`;
    this.stick.style.bottom = 'auto';
    this._stickMove(e.clientX, e.clientY);
  }

  _stickMove(x, y) {
    const R = this._radius();
    let dx = x - this._ox;
    let dy = y - this._oy;
    const len = Math.hypot(dx, dy);
    // Sprint: pushed past the rim, straight ahead.
    const sprint = len > R * SPRINT_PUSH && -dy / len > SPRINT_CONE;
    if (len > R) {
      dx *= R / len;
      dy *= R / len;
    }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const nx = dx / R;
    const ny = dy / R;
    const m = Math.hypot(nx, ny);
    const k = m < DEAD_ZONE ? 0 : (m - DEAD_ZONE) / (1 - DEAD_ZONE) / m;
    this.input.axisX = nx * k;
    this.input.axisY = -ny * k;
    this._setSprint(sprint);
  }

  _stickEnd() {
    this._stickPointer = undefined;
    this.input.axisX = 0;
    this.input.axisY = 0;
    this._setSprint(false);
    this.knob.style.transform = '';
    this.stick.classList.add('idle');
    this.stick.style.left = '';
    this.stick.style.top = '';
    this.stick.style.bottom = '';
  }

  _setSprint(on) {
    if (on === this.sprinting) return;
    this.sprinting = on;
    this.stick.classList.toggle('sprint', on);
    // Sprinting lowers the sights (as on a keyboard: aiming holds the sprint off).
    if (on && this.aimOn) this._setAim(false);
    this._hold(this._code('sprint'), on);
  }
}
