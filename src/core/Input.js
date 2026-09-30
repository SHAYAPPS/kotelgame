// Keyboard + mouse input with pointer lock.
// Bindings use KeyboardEvent.code (physical key position), so WASD works the
// same on Hebrew and English keyboard layouts.

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

    /** @type {(locked: boolean) => void} */
    this.onLockChange = () => {};
    /** @type {(error: unknown) => void} */
    this.onLockError = () => {};

    window.addEventListener('keydown', (e) => this._onKeyDown(e));
    window.addEventListener('keyup', (e) => this.held.delete(e.code));
    window.addEventListener('blur', () => this.clear());
    document.addEventListener('mousemove', (e) => this._onMouseMove(e));
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
  }

  /** Must be called from a user gesture (click). */
  async requestLock() {
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
    if (document.pointerLockElement) document.exitPointerLock();
  }

  _onKeyDown(e) {
    if (!this.enabled) return;
    if (NO_DEFAULT.has(e.code)) e.preventDefault();
    if (!e.repeat && !this.held.has(e.code)) this.pressed.add(e.code);
    this.held.add(e.code);
  }

  _onMouseMove(e) {
    if (!this.locked || !this.enabled) return;
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
    this.locked = document.pointerLockElement === this.lockTarget;
    // The first event after locking can carry a stale jump; ignore it.
    if (this.locked) this._skipMouseEvents = 1;
    this.onLockChange(this.locked);
  }
}
