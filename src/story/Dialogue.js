import { LINES, SPEAKERS } from './text.he.js';

/** Seconds a subtitle stays up: enough to read it, never rushed. */
export function lineDuration(text) {
  return Math.max(2.2, 1.1 + text.length * 0.065);
}

/**
 * Subtitle queue (pure logic). Lines play one after another; `current` is what the
 * HUD shows. `onLine(line)` fires as each line starts (e.g. radio squelch sounds).
 */
export class Dialogue {
  constructor({ lines = LINES, speakers = SPEAKERS, onLine = null } = {}) {
    this.lines = lines;
    this.speakers = speakers;
    this.onLine = onLine;
    this.queue = [];
    this.current = null; // { id, speaker, name, color, radio, text, time, duration }
  }

  get idle() {
    return this.current === null && this.queue.length === 0;
  }

  /** Queue line ids. `interrupt` drops whatever is playing. */
  play(ids, { interrupt = false } = {}) {
    if (interrupt) this.clear();
    for (const id of ids) {
      const line = this.lines[id];
      if (!line) throw new Error(`Unknown dialogue line "${id}"`);
      this.queue.push(id);
    }
    if (!this.current) this._next();
  }

  clear() {
    this.queue.length = 0;
    this.current = null;
  }

  update(dt) {
    if (!this.current) return;
    this.current.time += dt;
    if (this.current.time >= this.current.duration) {
      this.current = null;
      this._next();
    }
  }

  _next() {
    const id = this.queue.shift();
    if (!id) return;
    const line = this.lines[id];
    const sp = this.speakers[line.speaker] ?? { name: line.speaker, color: '#fff' };
    this.current = {
      id,
      speaker: line.speaker,
      name: sp.name,
      color: sp.color,
      radio: !!sp.radio,
      text: line.text,
      time: 0,
      duration: line.duration ?? lineDuration(line.text),
    };
    if (this.onLine) this.onLine(this.current);
  }
}
