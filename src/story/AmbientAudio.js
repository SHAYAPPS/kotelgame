// Generated ambience on the shared AudioContext (no sound files): a crowd murmur
// (filtered noise with slow swells and voice-like formant blips), birds (chirps from
// random directions), and one-shot story sounds (radio squelch, objective chime).

export class AmbientAudio {
  /** @param {import('../weapons/WeaponAudio.js').WeaponAudio} audio shared context/master */
  constructor(audio) {
    this.audio = audio;
    this.crowd = 0;
    this.birds = 0;
    this._started = false;
    this._birdTimer = 1;
    this._voiceTimer = 0.3;
  }

  get ctx() {
    return this.audio.ready ? this.audio.ctx : null;
  }

  _start() {
    const ctx = this.ctx;
    if (!ctx || this._started) return;
    this._started = true;
    // Crowd bed: looping noise through a voice-range band, gently swelling.
    const src = ctx.createBufferSource();
    src.buffer = this.audio.noise;
    src.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 520;
    band.Q.value = 0.55;
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 1600;
    this.crowdGain = ctx.createGain();
    this.crowdGain.gain.value = 0;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.13;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.25;
    this.swell = ctx.createGain();
    this.swell.gain.value = 0.75;
    lfo.connect(lfoGain).connect(this.swell.gain);
    src.connect(band).connect(low).connect(this.swell).connect(this.crowdGain).connect(this.audio.master);
    src.start();
    lfo.start();
  }

  /** @param {{ crowd?: number, birds?: number }} levels 0..1 */
  set(levels) {
    if (levels.crowd !== undefined) this.crowd = levels.crowd;
    if (levels.birds !== undefined) this.birds = levels.birds;
    this._start();
    if (this.crowdGain) this.crowdGain.gain.setTargetAtTime(this.crowd * 0.22, this.ctx.currentTime, 1.2);
  }

  /** Call every frame. */
  update(dt) {
    const ctx = this.ctx;
    if (!ctx) return;
    if (!this._started && (this.crowd > 0 || this.birds > 0)) this.set({});
    this._voiceTimer -= dt;
    if (this.crowd > 0 && this._voiceTimer <= 0) {
      this._voiceTimer = 0.15 + Math.random() * 0.5;
      this._voice(ctx);
    }
    this._birdTimer -= dt;
    if (this.birds > 0 && this._birdTimer <= 0) {
      this._birdTimer = (1.5 + Math.random() * 5) / (0.3 + this.birds);
      this._bird(ctx);
    }
  }

  /** A murmured syllable somewhere in the crowd: two formants with a soft envelope. */
  _voice(ctx) {
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.audio.noise;
    const f1 = ctx.createBiquadFilter();
    f1.type = 'bandpass';
    f1.frequency.value = 350 + Math.random() * 450;
    f1.Q.value = 6;
    const env = ctx.createGain();
    const peak = 0.05 * this.crowd;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(peak, t + 0.05);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.18 + Math.random() * 0.2);
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.6 - 0.8;
    src.connect(f1).connect(env).connect(pan).connect(this.audio.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + 0.5);
  }

  /** A short bird call: a few quick sine sweeps from one side. */
  _bird(ctx) {
    const t = ctx.currentTime;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.8 - 0.9;
    pan.connect(this.audio.master);
    const base = 2600 + Math.random() * 2400;
    const n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const s = t + i * (0.09 + Math.random() * 0.05);
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(base, s);
      osc.frequency.exponentialRampToValueAtTime(base * (1.3 + Math.random() * 0.4), s + 0.05);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.05 * this.birds, s + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.07);
      osc.connect(g).connect(pan);
      osc.start(s);
      osc.stop(s + 0.09);
    }
    setTimeout(() => pan.disconnect(), 1500);
  }

  /** One-shot story sounds by id. */
  play(id) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const a = this.audio;
    if (id === 'radioIn' || id === 'radioOut') {
      // Squelch: a burst of band-limited static plus a click.
      a._noise(t, { type: 'bandpass', freq: 1800, q: 1.2, gain: 0.35, decay: id === 'radioIn' ? 0.12 : 0.18 });
      a._tone(t, { type: 'square', freq: 1200, freqEnd: 900, gain: 0.05, decay: 0.04 });
    } else if (id === 'chime') {
      a._tone(t, { type: 'sine', freq: 880, gain: 0.08, decay: 0.25 });
      a._tone(t + 0.12, { type: 'sine', freq: 1320, gain: 0.07, decay: 0.3 });
    } else if (id === 'magCheck') {
      a._noise(t, { type: 'bandpass', freq: 1500, q: 3, gain: 0.35, decay: 0.03 });
      a._noise(t + 0.45, { type: 'bandpass', freq: 1300, q: 3, gain: 0.45, decay: 0.03 });
    }
  }
}
