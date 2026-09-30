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

  /**
   * A combat callout: plays when there is room, never interrupts, and is dropped when
   * lines are already waiting (callouts go stale fast). Returns whether it was queued.
   */
  bark(id, { next = false } = {}) {
    if (!this.lines[id]) throw new Error(`Unknown dialogue line "${id}"`);
    if (next) {
      // A direct reply: jumps the queue (plays right after the current line).
      if (!this.current) this.play([id]);
      else if (this.queue[0] !== id) this.queue.unshift(id);
      return true;
    }
    if (this.queue.length > 0) return false;
    this.play([id]);
    return true;
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
      radio: !!(line.radio ?? sp.radio),
      to: line.to ?? null, // who the speaker talks to (an NPC id); default: the player
      text: line.text,
      time: 0,
      duration: line.duration ?? lineDuration(line.text),
    };
    if (this.onLine) this.onLine(this.current);
  }
}
