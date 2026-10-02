// Keyboard + mouse input with pointer lock.
// Bindings use KeyboardEvent.code (physical key position), so WASD works the
// same on Hebrew and English keyboard layouts. Game reads actions through the player's
// bindings (core/Bindings.js): anyDown(codes) / consumeAny(codes).
// On a touch device (`touch`) the on-screen controls (ui/TouchControls.js) press the same
// codes, move the analog `axisX` / `axisY` (the stick) and add look deltas; there is no
// pointer lock: requestLock() / exitLock() just start and stop playing.

const NO_DEFAULT = new Set([
  'Space',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Tab',
  'ShiftLeft',
  'ShiftRight',
]);

// While playing, every other key's browser default is blocked too (a rebound key could open
// quick find, scroll...), except these.
const KEEP_DEFAULT = new Set(['F5', 'F11', 'F12']);

// Occasional single-event mouse spikes (browser/OS glitches) are dropped.
const MAX_MOUSE_EVENT_DELTA = 800;

export class Input {
  /** @param {HTMLElement} lockTarget element that receives pointer lock (the canvas) */
  constructor(lockTarget) {
    this.lockTarget = lockTarget;
    this.enabled = false; // gameplay input is only read while playing
    this.locked = false;
    this.held = new Set();
    this.pressed = new Set(); // key presses not yet consumed
    this.mouseDX = 0;
    this.mouseDY = 0;
    this._skipMouseEvents = 0;
    this.touch = false; // on-screen controls, no pointer lock (set by Game)
    // The touch stick: right / forward, -1..1 (added to the movement keys).
    this.axisX = 0;
    this.axisY = 0;

    /** @type {(locked: boolean) => void} */
    this.onLockChange = () => {};
    /** @type {(error: unknown) => void} */
    this.onLockError = () => {};

    window.addEventListener('keydown', (e) => this._onKeyDown(e));
    window.addEventListener('keyup', (e) => this.held.delete(e.code));
    window.addEventListener('blur', () => this.clear());
    document.addEventListener('mousemove', (e) => this._onMouseMove(e));
    // Mouse buttons share the key sets as 'Mouse0' (left), 'Mouse1', 'Mouse2' (right).
    document.addEventListener('mousedown', (e) => this._onMouseDown(e));
    document.addEventListener('mouseup', (e) => {
      if (this.touch) return; // (the touch buttons hold Mouse0 / Mouse2 themselves)
      this.held.delete(`Mouse${e.button}`);
      // The side buttons would go back / forward in the browser's history.
      if (this.enabled && e.button > 2) e.preventDefault();
    });
    // Mouse wheel: one press of 'WheelUp' / 'WheelDown' per notch (weapon switching).
    document.addEventListener(
      'wheel',
      (e) => {
        if (!this.enabled || !this.locked || e.deltaY === 0) return;
        this.pressed.add(e.deltaY > 0 ? 'WheelDown' : 'WheelUp');
        e.preventDefault();
      },
      { passive: false },
    );
    document.addEventListener('contextmenu', (e) => {
      if (this.enabled) e.preventDefault();
    });
    document.addEventListener('pointerlockchange', () => this._onLockChange());
    document.addEventListener('pointerlockerror', (e) => this.onLockError(e));
  }

  isDown(code) {
    return this.held.has(code);
  }

  /** True once per physical press. */
  consumePress(code) {
    if (!this.pressed.has(code)) return false;
    this.pressed.delete(code);
    return true;
  }

  /** Any of `codes` held (an action's keys). */
  anyDown(codes) {
    for (const c of codes) if (this.held.has(c)) return true;
    return false;
  }

  /** A press of any of `codes` since the last check (consumed). */
  consumeAny(codes) {
    let hit = false;
    for (const c of codes) if (this.pressed.delete(c)) hit = true;
    return hit;
  }

  /** Mouse movement since the last call, in pixels (raw counts when supported). */
  consumeMouse(out) {
    out.x = this.mouseDX;
    out.y = this.mouseDY;
    this.mouseDX = 0;
    this.mouseDY = 0;
    return out;
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) this.clear();
  }

  clear() {
    this.held.clear();
    this.pressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.axisX = 0;
    this.axisY = 0;
  }

  /** Must be called from a user gesture (click). On touch: just playing. */
  async requestLock() {
    if (this.touch) {
      if (!this.locked) {
        this.locked = true;
        this.onLockChange(true);
      }
      return;
    }
    try {
      // Raw mouse input (no OS acceleration) where the browser supports it.
      await this.lockTarget.requestPointerLock({ unadjustedMovement: true });
    } catch {
      try {
        await this.lockTarget.requestPointerLock();
      } catch (error) {
        this.onLockError(error);
      }
    }
  }

  exitLock() {
    if (this.touch) {
      if (this.locked) {
        this.locked = false;
        this.onLockChange(false);
      }
      return;
    }
    if (document.pointerLockElement) document.exitPointerLock();
  }

  _onKeyDown(e) {
    if (!this.enabled) return;
    if (NO_DEFAULT.has(e.code) || (this.locked && !KEEP_DEFAULT.has(e.code))) e.preventDefault();
    if (!e.repeat && !this.held.has(e.code)) this.pressed.add(e.code);
    this.held.add(e.code);
  }

  _onMouseDown(e) {
    // (On touch the on-screen buttons press the codes; a tap's emulated mouse events don't.)
    if (!this.enabled || !this.locked || this.touch) return;
    const code = `Mouse${e.button}`;
    if (e.button > 2) e.preventDefault();
    if (!this.held.has(code)) this.pressed.add(code);
    this.held.add(code);
    e.preventDefault();
  }

  _onMouseMove(e) {
    if (!this.locked || !this.enabled || this.touch) return;
    if (this._skipMouseEvents > 0) {
      this._skipMouseEvents--;
      return;
    }
    const dx = e.movementX;
    const dy = e.movementY;
    if (Math.abs(dx) > MAX_MOUSE_EVENT_DELTA || Math.abs(dy) > MAX_MOUSE_EVENT_DELTA) return;
    this.mouseDX += dx;
    this.mouseDY += dy;
  }

  _onLockChange() {
    if (this.touch) return;
    this.locked = document.pointerLockElement === this.lockTarget;
    // The first event after locking can carry a stale jump; ignore it.
    if (this.locked) this._skipMouseEvents = 1;
    this.onLockChange(this.locked);
  }
}
