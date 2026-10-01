// The score: one track per mood (public/assets/audio/music/, Kevin MacLeod, CC-BY 4.0),
// streamed through <audio> elements into the music bus, crossfaded when the mood changes.
//   calm (the shift) -> tense (after the radio chatter) -> combat -> push (the final assault)
//   -> end (quiet), or null (silence).

const FADE_IN = 3.5;
const FADE_OUT = 2.5;

export class Music {
  /** @param {import('./Mixer.js').Mixer} mixer @param {string} base audio folder URL @param {object} tracks manifest.music */
  constructor(mixer, base, tracks) {
    this.mixer = mixer;
    this.ctx = mixer.ctx;
    this.base = base;
    this.tracks = tracks ?? {};
    this.players = new Map(); // state -> { el, gain }
    this.state = null;
  }

  _player(state) {
    let p = this.players.get(state);
    if (p) return p;
    const t = this.tracks[state];
    if (!t) return null;
    const el = new Audio(`${this.base}${t.file}`);
    el.loop = state !== 'end';
    el.preload = 'auto';
    el.crossOrigin = 'anonymous';
    const src = this.ctx.createMediaElementSource(el);
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    src.connect(gain).connect(this.mixer.music);
    p = { el, gain };
    this.players.set(state, p);
    return p;
  }

  /** Change the mood (null = silence). Same mood: nothing happens. */
  setState(state, { volume = 1 } = {}) {
    if (state === this.state) return;
    const t = this.ctx.currentTime;
    const old = this.state ? this.players.get(this.state) : null;
    if (old) {
      old.gain.gain.cancelScheduledValues(t);
      old.gain.gain.setTargetAtTime(0, t, FADE_OUT / 4);
      const el = old.el;
      clearTimeout(old.stopTimer);
      old.stopTimer = setTimeout(() => el.pause(), FADE_OUT * 1000 + 500);
    }
    this.state = state;
    if (!state) return;
    const p = this._player(state);
    if (!p) return;
    clearTimeout(p.stopTimer);
    if (p.el.paused) {
      if (state === 'end') p.el.currentTime = 0;
      p.el.play().catch(() => {});
    }
    p.gain.gain.cancelScheduledValues(t);
    p.gain.gain.setTargetAtTime(volume, t, FADE_IN / 4);
  }

  /** Stop everything at once (restart). */
  stop() {
    for (const p of this.players.values()) {
      p.gain.gain.cancelScheduledValues(this.ctx.currentTime);
      p.gain.gain.value = 0;
      p.el.pause();
    }
    this.state = null;
  }
}
