// Procedural weapon sounds with the Web Audio API (no sound files).
// The AudioContext can only start after a user gesture: call unlock() from a click.

export class WeaponAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noise = null;
  }

  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      this.ctx = ctx;

      // Master chain: gain -> compressor (keeps full-auto from clipping).
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 8;
      comp.ratio.value = 6;
      comp.attack.value = 0.002;
      comp.release.value = 0.12;
      comp.connect(ctx.destination);
      this.master = ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(comp);

      // One second of white noise, reused by every sound.
      const len = ctx.sampleRate;
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  get ready() {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  /** Noise burst through a filter with an exponential decay envelope. */
  _noise(t, { type, freq, q = 0.7, gain, attack = 0.001, decay, freqEnd, rate = 1 }) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = rate;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t);
    if (freqEnd) filter.frequency.exponentialRampToValueAtTime(freqEnd, t + decay);
    filter.Q.value = q;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    src.connect(filter).connect(env).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + attack + decay + 0.02);
  }

  /** Pitched blip (for thumps and metallic clicks). */
  _tone(t, { type = 'sine', freq, freqEnd, gain, decay }) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, t + decay);
    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    osc.connect(env).connect(this.master);
    osc.start(t);
    osc.stop(t + decay + 0.02);
  }

  shot() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const v = 0.9 + Math.random() * 0.2; // small variation so full-auto isn't robotic
    // Supersonic crack, body, low thump, then a short tail off the surroundings.
    this._noise(t, { type: 'highpass', freq: 2500, gain: 0.7, decay: 0.035, rate: v });
    this._noise(t, { type: 'lowpass', freq: 3200, freqEnd: 350, q: 1, gain: 1.0, decay: 0.16, rate: v });
    this._tone(t, { freq: 150 * v, freqEnd: 42, gain: 0.9, decay: 0.12 });
    this._noise(t + 0.02, { type: 'bandpass', freq: 520, q: 0.6, gain: 0.18, attack: 0.02, decay: 0.45 });
  }

  _click(t, freq, gain = 0.35) {
    this._noise(t, { type: 'bandpass', freq, q: 3, gain, decay: 0.03 });
    this._tone(t, { type: 'square', freq: freq * 0.5, freqEnd: freq * 0.3, gain: gain * 0.25, decay: 0.035 });
  }

  dryFire() {
    if (!this.ready) return;
    this._click(this.ctx.currentTime, 3200, 0.7);
  }

  /** Magazine out, magazine in, bolt release, timed to the reload animation. */
  reload(duration) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this._click(t + duration * 0.2, 1800, 0.6); // mag release
    this._noise(t + duration * 0.24, { type: 'lowpass', freq: 900, gain: 0.5, decay: 0.08 }); // mag slides out
    this._noise(t + duration * 0.56, { type: 'lowpass', freq: 1100, gain: 0.6, decay: 0.06 }); // new mag slides in
    this._click(t + duration * 0.6, 1400, 0.9); // mag seats
    this._click(t + duration * 0.82, 2600, 0.8); // bolt release
    this._click(t + duration * 0.84, 1200, 0.7);
  }
}
