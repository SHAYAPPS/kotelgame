// Generated ambience on the shared AudioContext (no sound files): a crowd murmur
// (filtered noise with slow swells and voice-like formant blips), birds (chirps from
// random directions), the rising-and-falling air-raid siren, distant booms, radio
// voices (a garbled "voice" through a radio filter) and one-shot story sounds.

export class AmbientAudio {
  /** @param {import('../weapons/WeaponAudio.js').WeaponAudio} audio shared context/master */
  constructor(audio) {
    this.audio = audio;
    this.crowd = 0;
    this.birds = 0;
    this.siren = 0;
    this.panic = false; // crowd voices: shouts instead of murmur
    this._sirens = null;
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

  /** @param {{ crowd?: number, birds?: number, siren?: number, panic?: boolean }} levels 0..1 */
  set(levels) {
    if (levels.crowd !== undefined) this.crowd = levels.crowd;
    if (levels.birds !== undefined) this.birds = levels.birds;
    if (levels.panic !== undefined) this.panic = levels.panic;
    if (levels.siren !== undefined) this.siren = levels.siren;
    this._start();
    if (this.crowdGain) this.crowdGain.gain.setTargetAtTime(this.crowd * 0.22, this.ctx.currentTime, 1.2);
    this._updateSiren();
  }

  /**
   * Air-raid sirens: a few horns around the city (different directions, slightly
   * detuned and out of phase), each a wailing tone that rises and falls every ~4.5 s,
   * with a wind-up at the start and a wind-down at the end, sent into the echo bus.
   */
  _updateSiren() {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    if (this.siren > 0 && !this._sirens) {
      const out = ctx.createGain();
      out.gain.value = 0;
      out.connect(this.audio.master);
      const send = ctx.createGain();
      send.gain.value = 0.9;
      out.connect(send).connect(this.audio.echoBus ?? this.audio.master);
      const horns = [];
      const places = [
        { pan: -0.7, delay: 0.0, detune: 0, level: 1 },
        { pan: 0.55, delay: 0.35, detune: 18, level: 0.7 },
        { pan: 0.1, delay: 0.9, detune: -25, level: 0.45 },
      ];
      for (const p of places) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.detune.value = p.detune;
        const osc2 = ctx.createOscillator();
        osc2.type = 'triangle';
        osc2.detune.value = p.detune + 1200; // octave: the horn's bright edge
        // Wind-up from a low growl, then the rise-and-fall wail around 560 Hz.
        const start = t + p.delay;
        osc.frequency.setValueAtTime(90, start);
        osc.frequency.exponentialRampToValueAtTime(520, start + 3.5);
        osc2.frequency.setValueAtTime(90, start);
        osc2.frequency.exponentialRampToValueAtTime(520, start + 3.5);
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.22;
        const depth = ctx.createGain();
        depth.gain.setValueAtTime(0, start);
        depth.gain.linearRampToValueAtTime(190, start + 4);
        lfo.connect(depth);
        depth.connect(osc.frequency);
        depth.connect(osc2.frequency);
        const tone = ctx.createBiquadFilter();
        tone.type = 'lowpass';
        tone.frequency.value = 2200;
        const g = ctx.createGain();
        g.gain.value = 0.11 * p.level;
        const g2 = ctx.createGain();
        g2.gain.value = 0.04 * p.level;
        // Rotating horn: a slow loudness swell.
        const rot = ctx.createOscillator();
        rot.frequency.value = 0.31 + p.delay * 0.1;
        const rotDepth = ctx.createGain();
        rotDepth.gain.value = 0.03 * p.level;
        rot.connect(rotDepth).connect(g.gain);
        const pan = ctx.createStereoPanner();
        pan.pan.value = p.pan;
        osc.connect(g);
        osc2.connect(g2);
        g.connect(tone);
        g2.connect(tone);
        tone.connect(pan).connect(out);
        for (const o of [osc, osc2, lfo, rot]) o.start(start);
        horns.push({ osc, osc2, lfo, rot });
      }
      this._sirens = { out, horns, send };
    }
    if (this._sirens) {
      const { out, horns } = this._sirens;
      out.gain.cancelScheduledValues(t);
      out.gain.setTargetAtTime(this.siren, t, this.siren > 0 ? 0.8 : 1.5);
      if (this.siren <= 0) {
        // Wind down and stop.
        for (const h of horns) {
          for (const o of [h.osc, h.osc2]) {
            o.frequency.cancelScheduledValues(t);
            o.frequency.setTargetAtTime(60, t, 1.6);
          }
          for (const o of [h.osc, h.osc2, h.lfo, h.rot]) o.stop(t + 6);
        }
        const s = this._sirens;
        setTimeout(() => {
          s.out.disconnect();
          s.send.disconnect();
        }, 6500);
        this._sirens = null;
      }
    }
  }

  /** A distant explosion: low rumble with a long echo; farther = duller and quieter. */
  boom(distance, strength = 1) {
    const ctx = this.ctx;
    if (!ctx) return;
    const a = this.audio;
    const t = ctx.currentTime;
    const level = Math.min(1, (strength * 260) / Math.max(distance, 150));
    const dull = 90 + 600 * Math.exp(-distance / 400);
    a._noise(t, { type: 'lowpass', freq: dull * 1.6, freqEnd: 60, q: 0.8, gain: 0.8 * level, attack: 0.01, decay: 1.6, rate: 0.5 });
    a._tone(t, { type: 'sine', freq: 55, freqEnd: 28, gain: 0.6 * level, decay: 1.3 });
    a._noise(t + 0.05, { type: 'lowpass', freq: dull, gain: 0.6 * level, attack: 0.05, decay: 2.2, rate: 0.4, out: a.echoBus ?? a.master });
  }

  /**
   * A line spoken over the radio: squelch in, a garbled synthesized voice (pitched
   * syllables through vowel formants) band-limited to radio range with some
   * distortion and hiss, then squelch out.
   */
  radioLine(duration) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = ctx.currentTime;
    this.play('radioIn');
    const bus = ctx.createGain();
    bus.gain.value = 0.9;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 420;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2800;
    const shaper = ctx.createWaveShaper();
    shaper.curve = RADIO_CURVE;
    bus.connect(hp).connect(shaper).connect(lp).connect(this.audio.master);
    const end = t0 + Math.max(0.6, duration - 0.35);
    // Hiss under the voice.
    const hiss = ctx.createBufferSource();
    hiss.buffer = this.audio.noise;
    hiss.loop = true;
    const hg = ctx.createGain();
    hg.gain.value = 0.02;
    hiss.connect(hg).connect(bus);
    hiss.start(t0);
    hiss.stop(end);
    // Syllables.
    let t = t0 + 0.12;
    const f0 = 105 + Math.random() * 70;
    while (t < end - 0.1) {
      const len = 0.07 + Math.random() * 0.14;
      if (Math.random() < 0.12) {
        t += 0.12 + Math.random() * 0.15; // a pause between words
        continue;
      }
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f0 * (0.9 + Math.random() * 0.25), t);
      osc.frequency.linearRampToValueAtTime(f0 * (0.85 + Math.random() * 0.3), t + len);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(0.35, t + 0.015);
      env.gain.exponentialRampToValueAtTime(0.0001, t + len);
      const v = VOWELS[Math.floor(Math.random() * VOWELS.length)];
      for (const [f, q] of v) {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = f;
        bp.Q.value = q;
        osc.connect(bp).connect(env);
      }
      env.connect(bus);
      osc.start(t);
      osc.stop(t + len + 0.02);
      t += len + Math.random() * 0.03;
    }
    this.play('radioOut', end - t0);
    setTimeout(() => bus.disconnect(), (duration + 1) * 1000);
  }

  /** Call every frame. */
  update(dt) {
    const ctx = this.ctx;
    if (!ctx) return;
    if (!this._started && (this.crowd > 0 || this.birds > 0)) this.set({});
    this._voiceTimer -= dt;
    if (this.crowd > 0 && this._voiceTimer <= 0) {
      this._voiceTimer = this.panic ? 0.06 + Math.random() * 0.2 : 0.15 + Math.random() * 0.5;
      if (this.panic) this._shout(ctx);
      else this._voice(ctx);
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

  /** A panicked shout somewhere in the crowd: a pitched, gliding vowel. */
  _shout(ctx) {
    const t = ctx.currentTime;
    const len = 0.2 + Math.random() * 0.4;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    const f = 180 + Math.random() * 220;
    osc.frequency.setValueAtTime(f, t);
    osc.frequency.linearRampToValueAtTime(f * (0.8 + Math.random() * 0.5), t + len);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.03 * this.crowd, t + 0.04);
    env.gain.exponentialRampToValueAtTime(0.0001, t + len);
    const v = VOWELS[Math.floor(Math.random() * VOWELS.length)];
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.8 - 0.9;
    for (const [fr, q] of v) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = fr;
      bp.Q.value = q;
      osc.connect(bp).connect(env);
    }
    env.connect(pan).connect(this.audio.master);
    env.connect(this.audio.echoBus ?? this.audio.master);
    osc.start(t);
    osc.stop(t + len + 0.02);
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

  /** One-shot story sounds by id, optionally `delay` seconds from now. */
  play(id, delay = 0) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const a = this.audio;
    if (id === 'radioIn' || id === 'radioOut') {
      // Squelch: a burst of band-limited static plus a click.
      a._noise(t, { type: 'bandpass', freq: 1800, q: 1.2, gain: 0.35, decay: id === 'radioIn' ? 0.12 : 0.18 });
      a._tone(t, { type: 'square', freq: 1200, freqEnd: 900, gain: 0.05, decay: 0.04 });
    } else if (id === 'radioCut') {
      // The channel dies: a harsh burst of static, cut off.
      a._noise(t, { type: 'bandpass', freq: 2200, q: 0.6, gain: 0.5, attack: 0.01, decay: 0.7 });
      a._tone(t + 0.72, { type: 'square', freq: 900, freqEnd: 500, gain: 0.06, decay: 0.05 });
    } else if (id === 'charge') {
      // Charging handle: pulled back, released forward.
      a._noise(t, { type: 'bandpass', freq: 1700, q: 3, gain: 0.4, decay: 0.03 });
      a._noise(t + 0.03, { type: 'lowpass', freq: 1200, gain: 0.3, decay: 0.12 });
      a._noise(t + 0.3, { type: 'bandpass', freq: 2400, q: 2, gain: 0.7, decay: 0.04 });
      a._tone(t + 0.3, { type: 'square', freq: 900, freqEnd: 400, gain: 0.08, decay: 0.05 });
    } else if (id === 'resupply') {
      // Magazines out of the crate, into pouches.
      for (let i = 0; i < 4; i++) {
        a._noise(t + i * 0.13, { type: 'bandpass', freq: 1200 + i * 150, q: 2, gain: 0.35, decay: 0.05 });
        a._tone(t + i * 0.13 + 0.02, { type: 'square', freq: 700, freqEnd: 350, gain: 0.04, decay: 0.04 });
      }
    } else if (id === 'chime') {
      a._tone(t, { type: 'sine', freq: 880, gain: 0.08, decay: 0.25 });
      a._tone(t + 0.12, { type: 'sine', freq: 1320, gain: 0.07, decay: 0.3 });
    } else if (id === 'magCheck') {
      a._noise(t, { type: 'bandpass', freq: 1500, q: 3, gain: 0.35, decay: 0.03 });
      a._noise(t + 0.45, { type: 'bandpass', freq: 1300, q: 3, gain: 0.45, decay: 0.03 });
    }
  }
}

// Radio distortion: soft clipping.
const RADIO_CURVE = (() => {
  const n = 1024;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(x * 3.5) / Math.tanh(3.5);
  }
  return c;
})();

// Vowel formants [frequency, Q] for the synthesized voices.
const VOWELS = [
  [[730, 6], [1090, 8]], // a
  [[530, 6], [1840, 9]], // e
  [[270, 6], [2290, 10]], // i
  [[570, 6], [840, 8]], // o
  [[300, 6], [870, 8]], // u
];
