// The world around the mission, from recordings (public/assets/audio/): the city's distant
// traffic, a street crowd and the murmur of people on the plaza, birds, a little wind; the
// real Israeli civil-defense siren from far off across the city once the attack starts;
// a panicking crowd and screams; distant booms; radio transmissions (real Hebrew words,
// cut up and squeezed through a radio, under static) and the story's one-shot sounds.

// Bed levels (linear) at full intensity, per mission setting 0..1.
const BEDS = {
  city: { id: 'amb_city', gain: 0.45 },
  street: { id: 'amb_street', gain: 0.5, by: 'crowd' },
  crowd: { id: 'amb_crowd', gain: 0.32, by: 'crowd' },
  birds: { id: 'amb_birds', gain: 0.55, by: 'birds' },
  wind: { id: 'amb_wind', gain: 0.35 },
  panic: { id: 'amb_panic', gain: 0.42, by: 'panicLevel' },
};

// Distant sirens: far-off emitters around the city (direction, distance m, rate).
const SIRENS = [
  { dir: [-0.8, 0.1, -0.6], dist: 500, rate: 1, gain: 1 },
  { dir: [0.5, 0.1, 0.85], dist: 900, rate: 0.985, gain: 0.7 },
  { dir: [-0.3, 0.1, 0.95], dist: 1300, rate: 1.012, gain: 0.5 },
];

// Radio distortion: soft clipping.
const RADIO_CURVE = (() => {
  const n = 1024;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(x * 3.2) / Math.tanh(3.2);
  }
  return c;
})();

export class AmbientAudio {
  /** @param {import('../weapons/WeaponAudio.js').WeaponAudio} audio the game's sound (mixer, bank) */
  constructor(audio, voices = null) {
    this.audio = audio;
    this.voices = voices; // recorded slots (story/Voice.js): crowd_prayer_1..3 replace the synthesized prayer
    this.levels = { crowd: 0, birds: 0, siren: 0, panic: false, city: 1 };
    this.prayer = null; // the crowd's prayer (built on first use)
    this._prayerLevel = 0;
    this.beds = null;
    this.sirens = null;
    this._screamTimer = 2;
  }

  get ctx() {
    return this.audio.ready ? this.audio.ctx : null;
  }

  get _ready() {
    return this.audio.ready && this.audio.bank?.ready;
  }

  /** @param {{ crowd?: number, birds?: number, siren?: number, panic?: boolean, city?: number }} levels 0..1 */
  set(levels) {
    Object.assign(this.levels, levels);
    this._apply();
  }

  _start() {
    if (this.beds || !this._ready) return;
    const a = this.audio;
    this.beds = {};
    for (const [k, b] of Object.entries(BEDS)) this.beds[k] = a.loop(b.id, { gain: 0, fadeIn: 0.1 });
    this._apply();
  }

  _apply() {
    if (!this.beds) return;
    const L = this.levels;
    const lv = { crowd: L.crowd, birds: L.birds, panicLevel: L.panic ? Math.max(0.6, L.crowd) : 0 };
    for (const [k, b] of Object.entries(BEDS)) {
      let g = b.gain * (b.by ? lv[b.by] ?? 0 : L.city ?? 1);
      // In a panic the calm murmur gives way to the shouting.
      if (L.panic && (k === 'crowd' || k === 'street')) g *= 0.35;
      this.beds[k]?.setGain(g, g > 0 ? 1.2 : 2);
    }
    this._sirens(L.siren);
  }

  /** The siren from several far-off directions (a loop each, slightly out of step). */
  _sirens(level) {
    const a = this.audio;
    if (level > 0 && !this.sirens && this._ready) {
      const l = a._listener;
      this.sirens = SIRENS.map((s, i) => {
        const at = { x: l.x + s.dir[0] * s.dist, y: l.y + s.dir[1] * s.dist, z: l.z + s.dir[2] * s.dist };
        const h = a.loop('siren', { at, ref: s.dist * 0.35, gain: 0, rate: s.rate, offset: i * 2.1, bus: a.mixer.amb, lowpass: 2600 - i * 500, send: 0.5 });
        return { h, s };
      });
    }
    if (!this.sirens) return;
    for (const { h, s } of this.sirens) h?.setGain(level * s.gain * 0.9, level > 0 ? 1.5 : 3);
    if (level <= 0) {
      const old = this.sirens;
      this.sirens = null;
      setTimeout(() => old.forEach(({ h }) => h?.stop(0.5)), 9000);
    }
  }

  /** A distant explosion (the interceptions over the city): farther = duller and quieter. */
  boom(distance, strength = 1) {
    if (!this._ready) return;
    const a = this.audio;
    const level = Math.min(1.2, (strength * 300) / Math.max(distance, 150));
    // From somewhere over the city.
    const ang = Math.random() * Math.PI * 2;
    const l = a._listener;
    const at = { x: l.x + Math.cos(ang) * 60, y: l.y + 30, z: l.z + Math.sin(ang) * 60 };
    a.play('boom_far', { at, ref: 60, gain: level, rate: 0.9 + Math.random() * 0.15, lowpass: 200 + 2500 * Math.exp(-distance / 600), send: 0.45, hrtf: false });
  }

  /**
   * A line spoken over the radio: squelch in, Hebrew words (real recordings, in random order
   * with short pauses) through a radio's band and distortion under static, squelch out.
   */
  radioLine(duration) {
    const ctx = this.ctx;
    if (!ctx || !this._ready) return;
    const a = this.audio;
    const t0 = ctx.currentTime;
    this.play('radioIn');
    const bus = ctx.createGain();
    bus.gain.value = 0.42;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 380;
    const mid = ctx.createBiquadFilter();
    mid.type = 'peaking';
    mid.frequency.value = 1700;
    mid.Q.value = 0.8;
    mid.gain.value = 7;
    const shaper = ctx.createWaveShaper();
    shaper.curve = RADIO_CURVE;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3100;
    bus.connect(hp).connect(mid).connect(shaper).connect(lp).connect(a.voiceBus);
    const end = t0 + Math.max(0.6, duration - 0.3);
    // Static under the voice.
    const stat = a.bank.buffer('radio_static', 0);
    if (stat) {
      const s = ctx.createBufferSource();
      s.buffer = stat;
      s.loop = true;
      const g = ctx.createGain();
      g.gain.value = 0.22;
      s.connect(g).connect(bus);
      s.start(t0, Math.random() * stat.duration);
      s.stop(end + 0.05);
    }
    // Words, one speaker per transmission.
    const n = a.bank.count('radio_words');
    if (n) {
      const half = Math.floor(n * 0.66);
      const lo = Math.random() < 0.6 ? 0 : half;
      const hi = lo === 0 ? half : n;
      let t = t0 + 0.12;
      while (t < end - 0.25) {
        const buf = a.bank.buffer('radio_words', lo + Math.floor(Math.random() * (hi - lo)));
        if (!buf) break;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.playbackRate.value = 1.08 + Math.random() * 0.1; // radio talk is quick
        const g = ctx.createGain();
        g.gain.value = 0.9;
        src.connect(g).connect(bus);
        src.start(t);
        // Cut short if it would run past the line's end.
        const len = buf.duration / src.playbackRate.value;
        if (t + len > end) src.stop(end);
        t += len + (Math.random() < 0.25 ? 0.18 + Math.random() * 0.2 : 0.03 + Math.random() * 0.06);
      }
    }
    this.play('radioOut', end - t0);
    setTimeout(() => bus.disconnect(), (duration + 1.5) * 1000);
  }

  /** Call every frame. */
  update(dt) {
    if (!this.beds) this._start();
    if (!this.beds) return;
    if (this.sirens) {
      // The distant sirens stay put relative to the listener (they're kilometers away).
      const l = this.audio._listener;
      for (const { h, s } of this.sirens) h?.setPosition({ x: l.x + s.dir[0] * s.dist, y: l.y + s.dir[1] * s.dist, z: l.z + s.dir[2] * s.dist });
    }
    // Screams from the crowd while it panics.
    if (this.levels.panic) {
      this._screamTimer -= dt;
      if (this._screamTimer <= 0) {
        this._screamTimer = 1.5 + Math.random() * 4;
        const l = this.audio._listener;
        const ang = Math.random() * Math.PI * 2;
        const d = 12 + Math.random() * 35;
        this.audio.play('scream', { at: { x: l.x + Math.cos(ang) * d, y: l.y, z: l.z + Math.sin(ang) * d }, ref: 8, gain: 0.35 + Math.random() * 0.25, rate: 0.95 + Math.random() * 0.1, send: 0.35 });
      }
    }
  }

  /**
   * The crowd praying: a murmur of many voices that swells as the plaza fills (0..1). Recorded
   * slots `crowd_prayer_1..3` (src/assets/voice/, the recording booth) are looped and layered
   * when present; otherwise it is synthesized: voices with drifting pitch through vowel
   * formants, syllables and phrases, into the plaza's echo.
   */
  setPrayer(level) {
    const ctx = this.ctx;
    if (!ctx) return;
    if (Math.abs(level - this._prayerLevel) < 0.01 && this.prayer) return;
    this._prayerLevel = level;
    if (!this.prayer) {
      if (level <= 0.001) return;
      this.prayer = this._buildPrayer();
    }
    this.prayer.out.gain.setTargetAtTime(level * 0.11, ctx.currentTime, 1.5);
  }

  _buildPrayer() {
    const ctx = this.ctx;
    const a = this.audio;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(a.ambienceBus ?? a.mixer.sfx);
    const send = ctx.createGain();
    send.gain.value = 0.6;
    out.connect(send).connect(a.echoBus ?? a.mixer.sfx);
    const rec = ['crowd_prayer_1', 'crowd_prayer_2', 'crowd_prayer_3'].filter((id) => this.voices?.has(id));
    if (rec.length) {
      // The booth's recordings: each looped a few times over, out of step, slightly detuned.
      const start = async () => {
        for (const id of rec) {
          const buf = await this.voices._load(id);
          if (!buf) continue;
          for (let k = 0; k < 3; k++) {
            const src = ctx.createBufferSource();
            src.buffer = buf;
            src.loop = true;
            src.playbackRate.value = 0.96 + Math.random() * 0.08;
            const g = ctx.createGain();
            g.gain.value = 1.6 / (rec.length * 3);
            src.connect(g).connect(out);
            src.start(ctx.currentTime + 0.05, Math.random() * buf.duration);
          }
        }
      };
      start();
      return { out };
    }
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 2400;
    lowpass.connect(out);
    for (let i = 0; i < 16; i++) {
      const female = i % 4 === 3;
      const f0 = (female ? 190 : 98) + Math.random() * (female ? 50 : 55);
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = f0;
      // The tune: a slow wander around the reciting tone.
      const glide = ctx.createOscillator();
      glide.frequency.value = 0.07 + Math.random() * 0.12;
      const glideAmt = ctx.createGain();
      glideAmt.gain.value = f0 * 0.06;
      glide.connect(glideAmt).connect(osc.frequency);
      // Vowels: two formants, their centers drifting.
      const f1 = ctx.createBiquadFilter();
      f1.type = 'bandpass';
      f1.frequency.value = 520 + Math.random() * 220;
      f1.Q.value = 4;
      const f2 = ctx.createBiquadFilter();
      f2.type = 'bandpass';
      f2.frequency.value = 1050 + Math.random() * 500;
      f2.Q.value = 5;
      const vowel = ctx.createOscillator();
      vowel.frequency.value = 2.2 + Math.random() * 2.4;
      const vAmt = ctx.createGain();
      vAmt.gain.value = 160;
      vowel.connect(vAmt).connect(f1.frequency);
      const mix = ctx.createGain();
      mix.gain.value = 0;
      osc.connect(f1).connect(mix);
      osc.connect(f2).connect(mix);
      // Syllables (a fast pulse), gated by phrases (breathing between verses).
      const syl = ctx.createOscillator();
      syl.frequency.value = 3 + Math.random() * 2.5;
      const sylAmt = ctx.createGain();
      sylAmt.gain.value = 0.35;
      const phrase = ctx.createOscillator();
      phrase.frequency.value = 0.08 + Math.random() * 0.1;
      const phraseAmt = ctx.createGain();
      phraseAmt.gain.value = 0.45;
      const base = ctx.createConstantSource();
      base.offset.value = 0.5;
      syl.connect(sylAmt).connect(mix.gain);
      phrase.connect(phraseAmt).connect(mix.gain);
      base.connect(mix.gain);
      const pan = ctx.createStereoPanner();
      pan.pan.value = Math.random() * 1.6 - 0.8;
      mix.connect(pan).connect(lowpass);
      const t = ctx.currentTime + Math.random() * 0.5;
      for (const n of [osc, glide, vowel, syl, phrase, base]) n.start(t);
    }
    return { out };
  }

  /** Electronic beeps (the checkpoint's gate, the hand detector): [freq, start, length] each. */
  _tones(list, { gain = 0.12, type = 'square' } = {}) {
    const ctx = this.ctx;
    if (!ctx) return;
    const bus = this.audio.mixer?.sfx ?? ctx.destination;
    for (const [f, t0, dur] of list) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      const g = ctx.createGain();
      const t = ctx.currentTime + t0;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(gain, t + 0.008);
      g.gain.setValueAtTime(gain, t + Math.max(0.01, dur - 0.02));
      g.gain.linearRampToValueAtTime(0, t + dur);
      o.connect(g).connect(bus);
      o.start(t);
      o.stop(t + dur + 0.03);
    }
  }

  /** A short burst of noise (a zip, the belt's rollers). */
  _noise(dur, { gain = 0.2, freq = 3000, q = 1 } = {}) {
    const ctx = this.ctx;
    if (!ctx) return;
    const n = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (0.6 + 0.4 * Math.sin(i / 90));
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(this.audio.mixer?.sfx ?? ctx.destination);
    src.start();
  }

  /** One-shot story sounds by id, optionally `delay` seconds from now. */
  play(id, delay = 0) {
    const a = this.audio;
    if (!a.ready) return;
    const ui = { bus: a.mixer.master };
    if (id === 'radioIn' || id === 'radioOut') a.play('radio_squelch', { gain: 0.3, delay, bus: a.voiceBus, rate: id === 'radioIn' ? 1.1 : 0.95 });
    else if (id === 'radioCut') {
      // The channel dies: a long burst of static, cut off.
      const s = a.play('radio_static', { gain: 0.9, delay, bus: a.voiceBus });
      s?.src.stop(a.ctx.currentTime + delay + 0.75);
      a.play('radio_squelch', { gain: 0.6, delay: delay + 0.72, bus: a.voiceBus, rate: 0.8 });
    } else if (id === 'charge') a.charge();
    else if (id === 'resupply') a.play('resupply', { gain: 0.8, delay });
    else if (id === 'chime') a.play('chime', { gain: 0.45, delay, ...ui });
    else if (id === 'magCheck') a.magCheck();
    // The security checkpoint (synthesized).
    else if (id === 'gateBeep') this._tones([0, 1, 2, 3, 4, 5].map((k) => [k % 2 ? 660 : 880, k * 0.21, 0.19]), { gain: 0.07 });
    else if (id === 'gateClear') this._tones([[1320, 0, 0.09]], { gain: 0.035, type: 'sine' });
    else if (id === 'wand') this._tones([[1900, 0, 0.07], [1900, 0.12, 0.07], [2300, 0.26, 0.4]], { gain: 0.05 });
    else if (id === 'belt') this._noise(1.4, { gain: 0.05, freq: 180, q: 0.7 });
    else if (id === 'zip') this._noise(0.45, { gain: 0.16, freq: 3800, q: 1.4 });
  }
}
