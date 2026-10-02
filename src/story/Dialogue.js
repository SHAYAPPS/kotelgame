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
  constructor({ lines = LINES, speakers = SPEAKERS, onLine = null, onQueue = null } = {}) {
    this.lines = lines;
    this.speakers = speakers;
    this.onLine = onLine;
    this.onQueue = onQueue; // (id) => void as a line is queued (e.g. decode its recording ahead)
    this.queue = [];
    this.current = null; // { id, speaker, name, color, radio, text, time, duration }
  }

  get idle() {
    return this.current === null && this.queue.length === 0;
  }

  /**
   * Queue lines: ids, or { id, who } where `who` is the NPC (id) who says it (a passer-by
   * with a generic speaker). `interrupt` drops whatever is playing.
   */
  play(ids, { interrupt = false } = {}) {
    if (interrupt) this.clear();
    for (const item of ids) {
      const id = typeof item === 'string' ? item : item.id;
      const line = this.lines[id];
      if (!line) throw new Error(`Unknown dialogue line "${id}"`);
      this.queue.push(item);
      this.onQueue?.(id);
    }
    if (!this.current) this._next();
  }

  /**
   * A combat callout: plays when there is room, never interrupts, and is dropped when
   * lines are already waiting (callouts go stale fast). Returns whether it was queued.
   */
  bark(id, { next = false, who = null } = {}) {
    if (!this.lines[id]) throw new Error(`Unknown dialogue line "${id}"`);
    const item = who ? { id, who } : id;
    if (next) {
      // A direct reply: jumps the queue (plays right after the current line).
      if (!this.current) this.play([item]);
      else if (this.queue[0] !== item) {
        this.queue.unshift(item);
        this.onQueue?.(id);
      }
      return true;
    }
    if (this.queue.length > 0) return false;
    this.play([item]);
    return true;
  }

  clear() {
    this.queue.length = 0;
    this.current = null;
  }

  /** Whether a queued item (as passed to play) is playing or still waiting. */
  pending(item) {
    return this.current?.item === item || this.queue.includes(item);
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
    const item = this.queue.shift();
    if (!item) return;
    const id = typeof item === 'string' ? item : item.id;
    const line = this.lines[id];
    const sp = this.speakers[line.speaker] ?? { name: line.speaker, color: '#fff' };
    this.current = {
      id,
      speaker: line.speaker,
      name: sp.name,
      color: sp.color,
      radio: !!(line.radio ?? sp.radio),
      to: line.to ?? null, // who the speaker talks to (an NPC id); default: the player
      who: typeof item === 'string' ? null : item.who ?? null, // the NPC saying it (generic speakers)
      item: typeof item === 'string' ? null : item, // the queued item (extras: an act, a flash)
      text: line.text,
      time: 0,
      duration: line.duration ?? lineDuration(line.text),
    };
    if (this.onLine) this.onLine(this.current);
  }
}
