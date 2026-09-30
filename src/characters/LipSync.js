// How far a speaker's mouth is open while a line plays (0 closed .. 1 wide). Pure logic.
//
// Without a recording the mouth follows the subtitle text: a rhythm of syllables (estimated
// from the words; Hebrew is mostly written without vowels, so ~one syllable per two letters),
// each opening and closing with its own length and height, short closures between words and
// pauses at punctuation. With a recording (a voice line, see story/Voice.js) the mouth follows
// the audio's loudness instead.

const SYLLABLE = 0.165; // s, a relaxed speaking rate (~6 syllables a second)
const PAUSE = { ',': 0.16, ';': 0.2, ':': 0.18, '.': 0.3, '!': 0.3, '?': 0.3, '…': 0.36, '-': 0.12, '—': 0.2, '–': 0.2 };

/**
 * The line as mouth events: syllables { t, dur, amp } with gaps for word breaks and pauses.
 * @param {string} text
 * @param {() => number} rand
 * @returns {{ events: { t: number, dur: number, amp: number }[], length: number }}
 */
export function speechSchedule(text, rand = Math.random) {
  const events = [];
  let t = 0.06; // the mouth starts just after the line appears
  let count = 0;
  const words = text.split(/(\s+|[,;:.!?…—–-])/).filter((w) => w && !/^\s+$/.test(w));
  for (const w of words) {
    if (PAUSE[w] !== undefined) {
      t += PAUSE[w] * (0.8 + rand() * 0.4);
      continue;
    }
    const letters = w.replace(/[^\p{L}\p{N}]/gu, '').length;
    if (!letters) continue;
    const n = Math.max(1, Math.round(letters * 0.5 + (rand() - 0.5) * 0.6));
    for (let k = 0; k < n; k++) {
      const dur = SYLLABLE * (0.72 + rand() * 0.6);
      // Stress: now and then a bigger one; the last syllable of a word a bit smaller.
      let amp = 0.42 + rand() * 0.38;
      if (count % 3 === 0 && rand() < 0.6) amp += 0.18;
      if (k === n - 1 && n > 1) amp *= 0.85;
      events.push({ t, dur, amp: Math.min(1, amp) });
      t += dur;
      count++;
    }
    t += 0.03 + rand() * 0.05; // a short closure between words
  }
  return { events, length: t };
}

export class LipSync {
  constructor(rand = Math.random) {
    this.rand = rand;
    this.events = [];
    this.time = 0;
    this.length = 0;
    this.index = 0;
    this.level = null; // () => loudness 0..1, when a recording plays
    this.open = 0; // smoothed output
  }

  get speaking() {
    return this.level !== null || this.time < this.length;
  }

  /**
   * Speak a line from its text. If the natural pace is longer than `duration` (the line's time
   * on screen) it speeds up to fit.
   */
  speak(text, duration = Infinity) {
    const { events, length } = speechSchedule(text, this.rand);
    const fit = Math.min(1, (duration * 0.92) / Math.max(length, 0.01));
    for (const e of events) {
      e.t *= fit;
      e.dur *= fit;
    }
    this.events = events;
    this.length = length * fit;
    this.time = 0;
    this.index = 0;
    this.level = null;
  }

  /** Speak from a recording: `level()` = its current loudness (RMS, 0..1). */
  speakLevel(level) {
    this.level = level;
    this.events = [];
    this.length = 0;
  }

  stop() {
    this.level = null;
    this.events = [];
    this.length = 0;
    this.time = 0;
  }

  /** Advance and return the mouth opening (0..1). */
  update(dt) {
    let target = 0;
    if (this.level) {
      // Loudness to opening: a noise gate, then roughly linear.
      target = Math.min(1, Math.max(0, (this.level() - 0.02) * 7));
    } else if (this.time < this.length) {
      this.time += dt;
      const t = this.time;
      while (this.index < this.events.length && this.events[this.index].t + this.events[this.index].dur < t) this.index++;
      const e = this.events[this.index];
      if (e && t >= e.t) {
        // Open fast, close slower (a syllable's shape).
        const u = (t - e.t) / e.dur;
        target = e.amp * (u < 0.35 ? Math.sin((u / 0.35) * Math.PI * 0.5) : Math.cos(((u - 0.35) / 0.65) * Math.PI * 0.5));
      }
    }
    const rate = target > this.open ? 30 : 16;
    this.open += (target - this.open) * (1 - Math.exp(-rate * dt));
    if (this.open < 0.001) this.open = 0;
    return this.open;
  }
}
