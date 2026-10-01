// Rebindable controls (Settings > Controls). Each action has one key the player can change,
// plus fixed alternates (the arrow keys, the right Shift) that drop out when another action
// takes them. Codes are KeyboardEvent.code (physical keys, so a Hebrew layout plays the same)
// or Mouse0..Mouse4 (left, middle, right, back, forward). Pure.

export const ACTIONS = [
  { id: 'forward', key: 'KeyW', alt: ['ArrowUp'] },
  { id: 'back', key: 'KeyS', alt: ['ArrowDown'] },
  { id: 'left', key: 'KeyA', alt: ['ArrowLeft'] },
  { id: 'right', key: 'KeyD', alt: ['ArrowRight'] },
  { id: 'jump', key: 'Space' },
  { id: 'sprint', key: 'ShiftLeft', alt: ['ShiftRight'] },
  { id: 'crouch', key: 'KeyC' },
  { id: 'fire', key: 'Mouse0' },
  { id: 'aim', key: 'Mouse2' },
  { id: 'reload', key: 'KeyR' },
  { id: 'grenade', key: 'KeyG' },
  { id: 'interact', key: 'KeyE' },
  { id: 'deny', key: 'KeyF' }, // stop / confiscate (the security checkpoint)
  { id: 'weapon1', key: 'Digit1' },
  { id: 'weapon2', key: 'Digit2' },
];

// Keys the game keeps for itself: pause, the performance readout, screenshots, dev tools.
export const RESERVED = new Set(['Escape', 'Backquote', 'KeyP', 'F1', 'F2', 'F5', 'F11', 'F12', 'MetaLeft', 'MetaRight']);

const BY_ID = new Map(ACTIONS.map((a) => [a.id, a]));

export function bindable(code) {
  return typeof code === 'string' && !RESERVED.has(code) && (/^Mouse[0-4]$/.test(code) || /^[A-Z][A-Za-z0-9]+$/.test(code));
}

export class Bindings {
  /** @param {Record<string, string>} saved action -> code (Settings.bindings) */
  constructor(saved = {}) {
    this.keys = {};
    for (const a of ACTIONS) this.keys[a.id] = a.key;
    this._build();
    // The saved changes, in order, each as a rebind (swaps included): never two actions on one key.
    for (const a of ACTIONS) if (saved && bindable(saved[a.id])) this.set(a.id, saved[a.id]);
  }

  /** The action's key. */
  key(id) {
    return this.keys[id];
  }

  /** Every code that triggers the action (its key, then its alternates no other action uses). */
  codes(id) {
    return this._codes[id] ?? [];
  }

  /**
   * Bind `code` to action `id`. If another action had that key, it gets this one's old key (a
   * swap, so nothing is left unbound). Returns the other action's id, or null.
   */
  set(id, code) {
    if (!BY_ID.has(id) || !bindable(code)) return null;
    const old = this.keys[id];
    let swapped = null;
    for (const a of ACTIONS) {
      if (a.id !== id && this.keys[a.id] === code) {
        this.keys[a.id] = old;
        swapped = a.id;
      }
    }
    this.keys[id] = code;
    this._build();
    return swapped;
  }

  reset() {
    for (const a of ACTIONS) this.keys[a.id] = a.key;
    this._build();
  }

  /** Only the keys changed from the defaults (what the settings save). */
  changed() {
    const out = {};
    for (const a of ACTIONS) if (this.keys[a.id] !== a.key) out[a.id] = this.keys[a.id];
    return out;
  }

  _build() {
    const taken = new Set(Object.values(this.keys));
    this._codes = {};
    for (const a of ACTIONS) this._codes[a.id] = [this.keys[a.id], ...(a.alt ?? []).filter((c) => !taken.has(c))];
  }
}

const NAMED = {
  Space: 'רווח',
  ShiftLeft: 'Shift',
  ShiftRight: 'Shift ימני',
  ControlLeft: 'Ctrl',
  ControlRight: 'Ctrl ימני',
  AltLeft: 'Alt',
  AltRight: 'Alt ימני',
  Tab: 'Tab',
  CapsLock: 'Caps Lock',
  Enter: 'Enter',
  Backspace: 'Backspace',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Mouse0: 'לחיצה שמאלית',
  Mouse1: 'לחיצת גלגלת',
  Mouse2: 'לחיצה ימנית',
  Mouse3: 'כפתור צד אחורי',
  Mouse4: 'כפתור צד קדמי',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backslash: '\\',
  Insert: 'Insert',
  Delete: 'Delete',
  Home: 'Home',
  End: 'End',
  PageUp: 'Page Up',
  PageDown: 'Page Down',
};

/** A key's name on screen (the US key cap: codes are physical positions). */
export function keyLabel(code) {
  if (!code) return '';
  if (NAMED[code]) return NAMED[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  return code;
}
