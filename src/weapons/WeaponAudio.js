// Procedural weapon sounds with the Web Audio API (no sound files).
// The AudioContext can only start after a user gesture: call unlock() from a click.

export class WeaponAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noise = null;
    this._lx = 0;
    this._ly = 0;
    this._lz = 0;
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

      // Echo bus: the stone plaza. A generated impulse response (slapback off the wall
      // and the terraces, then a long diffuse tail); sounds send part of their signal here.
      this.echo = ctx.createGain();
      const verb = ctx.createConvolver();
      verb.buffer = this._plazaImpulse(ctx);
      const wet = ctx.createGain();
      wet.gain.value = 0.55;
      this.echo.connect(verb).connect(wet).connect(this.master);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  /** Stereo impulse response: discrete stone reflections plus a decaying tail. */
  _plazaImpulse(ctx) {
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * 2.6);
    const buf = ctx.createBuffer(2, len, rate);
    const taps = [
      [0.045, 0.5, 0.2],
      [0.11, 0.42, 0.6],
      [0.19, 0.34, 0.35],
      [0.29, 0.26, 0.8],
      [0.42, 0.18, 0.5],
    ];
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / rate;
        // Duller as it decays (a one-pole lowpass on the noise).
        const n = Math.random() * 2 - 1;
        lp += (n - lp) * (0.5 * Math.exp(-t / 0.9) + 0.08);
        d[i] = lp * 0.35 * Math.exp(-t / 0.6) * Math.min(1, t / 0.03);
      }
      for (const [t, g, pan] of taps) {
        const side = ch === 0 ? 1 - pan : pan;
        const i = Math.floor((t + (ch ? 0.004 : 0)) * rate);
        for (let k = 0; k < 240; k++) d[i + k] += (Math.random() * 2 - 1) * g * side * Math.exp(-k / 60);
      }
    }
    return buf;
  }

  /** Where the echo send goes (the master when there is no echo bus). */
  get echoBus() {
    return this.echo ?? this.master;
  }

  get ready() {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  /** Noise burst through a filter with an exponential decay envelope. */
  _noise(t, { type, freq, q = 0.7, gain, attack = 0.001, decay, freqEnd, rate = 1, out = this.master }) {
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
    src.connect(filter).connect(env).connect(out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + attack + decay + 0.02);
  }

  /** Pitched blip (for thumps and metallic clicks). */
  _tone(t, { type = 'sine', freq, freqEnd, gain, decay, out = this.master }) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, t + decay);
    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    osc.connect(env).connect(out);
    osc.start(t);
    osc.stop(t + decay + 0.02);
  }

  shot() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this._shotLayers(t, this.master, 1);
    // The crack comes back off the stone.
    this._noise(t, { type: 'bandpass', freq: 1400, q: 0.5, gain: 0.5, decay: 0.12, out: this.echoBus });
  }

  /** The layered gunshot (crack, body, thump, tail) into `out`. */
  _shotLayers(t, out, level, tail = 0.18) {
    const v = 0.9 + Math.random() * 0.2; // small variation so full-auto isn't robotic
    this._noise(t, { type: 'highpass', freq: 2500, gain: 0.7 * level, decay: 0.035, rate: v, out });
    this._noise(t, { type: 'lowpass', freq: 3200, freqEnd: 350, q: 1, gain: 1.0 * level, decay: 0.16, rate: v, out });
    this._tone(t, { freq: 150 * v, freqEnd: 42, gain: 0.9 * level, decay: 0.12, out });
    this._noise(t + 0.02, { type: 'bandpass', freq: 520, q: 0.6, gain: tail * level, attack: 0.02, decay: 0.45, out });
  }

  /**
   * A gunshot somewhere in the world: HRTF-panned from its position, quieter and
   * duller with distance, with a longer echo off the plaza walls far away.
   */
  shotAt(position) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const dist = Math.max(1, Math.hypot(position.x - this._lx, position.y - this._ly, position.z - this._lz));
    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 6;
    panner.rolloffFactor = 1.1;
    panner.maxDistance = 600;
    if (panner.positionX) {
      panner.positionX.value = position.x;
      panner.positionY.value = position.y;
      panner.positionZ.value = position.z;
    } else {
      panner.setPosition(position.x, position.y, position.z);
    }
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 900 + 15000 * Math.exp(-dist / 45);
    lowpass.connect(panner).connect(this.master);
    // Echo send: farther shots are more echo than direct sound.
    const send = ctx.createGain();
    send.gain.value = Math.min(0.9, 0.25 + dist / 90) * Math.min(1, 12 / dist + 0.3);
    lowpass.connect(send).connect(this.echoBus);
    this._shotLayers(t, lowpass, 1.1, 0.18 + Math.min(0.5, dist / 120));
    setTimeout(() => {
      panner.disconnect();
      send.disconnect();
    }, 1500);
  }

  _panner(position, refDistance = 6) {
    const panner = this.ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = refDistance;
    panner.rolloffFactor = 1;
    panner.maxDistance = 800;
    if (panner.positionX) {
      panner.positionX.value = position.x;
      panner.positionY.value = position.y;
      panner.positionZ.value = position.z;
    } else {
      panner.setPosition(position.x, position.y, position.z);
    }
    return panner;
  }

  /** A grenade going off: a sharp crack, a heavy thump and a long rumble off the stone. */
  explosion(position) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const dist = Math.max(1, Math.hypot(position.x - this._lx, position.y - this._ly, position.z - this._lz));
    const panner = this._panner(position, 8);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 600 + 12000 * Math.exp(-dist / 30);
    lp.connect(panner).connect(this.master);
    const send = ctx.createGain();
    send.gain.value = 0.8;
    lp.connect(send).connect(this.echoBus);
    this._noise(t, { type: 'highpass', freq: 1800, gain: 1.2, decay: 0.05, out: lp });
    this._noise(t, { type: 'lowpass', freq: 2500, freqEnd: 120, q: 0.9, gain: 1.6, decay: 0.55, rate: 0.6, out: lp });
    this._tone(t, { freq: 90, freqEnd: 28, gain: 1.4, decay: 0.6, out: lp });
    this._noise(t + 0.04, { type: 'lowpass', freq: 400, gain: 0.7, attack: 0.03, decay: 1.6, rate: 0.35, out: lp });
    // Debris pattering down.
    for (let i = 0; i < 6; i++) {
      this._noise(t + 0.3 + Math.random() * 0.9, { type: 'bandpass', freq: 2500 + Math.random() * 2500, q: 4, gain: 0.08, decay: 0.03, out: lp });
    }
    setTimeout(() => {
      panner.disconnect();
      send.disconnect();
    }, 3000);
  }

  /** Rocket launch: the backblast thump, then the motor's roar tailing off. */
  rocketLaunch() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this._noise(t, { type: 'lowpass', freq: 1800, freqEnd: 200, q: 0.8, gain: 1.4, decay: 0.35, rate: 0.7 });
    this._tone(t, { freq: 70, freqEnd: 30, gain: 1.1, decay: 0.3 });
    this._noise(t + 0.03, { type: 'bandpass', freq: 900, freqEnd: 300, q: 0.6, gain: 0.5, attack: 0.02, decay: 0.9 });
    this._noise(t, { type: 'bandpass', freq: 1200, q: 0.5, gain: 0.5, decay: 0.3, out: this.echoBus });
  }

  /** Pulling the pin and the throw. */
  grenadeThrow() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this._click(t, 2600, 0.35); // pin
    this._noise(t + 0.05, { type: 'bandpass', freq: 900, freqEnd: 400, q: 0.8, gain: 0.25, attack: 0.04, decay: 0.2 }); // whoosh
  }

  /** A grenade hitting the ground somewhere. */
  grenadeBounce(position) {
    if (!this.ready) return;
    const panner = this._panner(position, 3);
    panner.connect(this.master);
    const t = this.ctx.currentTime;
    this._tone(t, { type: 'triangle', freq: 1300 + Math.random() * 400, freqEnd: 900, gain: 0.25, decay: 0.08, out: panner });
    this._noise(t, { type: 'bandpass', freq: 3000, q: 3, gain: 0.3, decay: 0.03, out: panner });
    setTimeout(() => panner.disconnect(), 500);
  }

  /** Supersonic crack of a bullet passing close by. */
  crack(position) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    if (panner.positionX) {
      panner.positionX.value = position.x;
      panner.positionY.value = position.y;
      panner.positionZ.value = position.z;
    } else {
      panner.setPosition(position.x, position.y, position.z);
    }
    panner.connect(this.master);
    const t = ctx.currentTime;
    this._noise(t, { type: 'highpass', freq: 3500, gain: 0.5, decay: 0.03, out: panner });
    this._tone(t, { type: 'triangle', freq: 1900, freqEnd: 700, gain: 0.12, decay: 0.05, out: panner });
    setTimeout(() => panner.disconnect(), 500);
  }

  /** The player's footstep on stone: a soft heel thud and the sole's scuff (stairs a bit harder). */
  footstep(level = 0.6, stair = false) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const v = 0.85 + Math.random() * 0.3;
    const l = level * (stair ? 1.15 : 1);
    this._noise(t, { type: 'lowpass', freq: 420 * v, gain: 0.18 * l, attack: 0.003, decay: 0.06 });
    this._noise(t + 0.018, { type: 'bandpass', freq: 2600 * v, q: 0.8, gain: 0.07 * l, attack: 0.002, decay: 0.045 });
    this._noise(t, { type: 'bandpass', freq: 900, q: 0.6, gain: 0.025 * l, decay: 0.12, out: this.echoBus ?? this.master });
  }

  /** Hit marker tick when your shot lands on an enemy (heavier for headshots). */
  hitmarker(head = false) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this._tone(t, { type: 'square', freq: head ? 1400 : 2200, freqEnd: head ? 900 : 1800, gain: 0.08, decay: 0.05 });
    this._noise(t, { type: 'bandpass', freq: head ? 1800 : 4000, q: 4, gain: 0.25, decay: 0.03 });
  }

  /** Where the listener (the camera) is; call every frame. */
  setListener(camera, forward) {
    this._lx = camera.position.x;
    this._ly = camera.position.y;
    this._lz = camera.position.z;
    if (!this.ready) return;
    const l = this.ctx.listener;
    if (l.positionX) {
      const t = this.ctx.currentTime;
      l.positionX.setTargetAtTime(this._lx, t, 0.01);
      l.positionY.setTargetAtTime(this._ly, t, 0.01);
      l.positionZ.setTargetAtTime(this._lz, t, 0.01);
      l.forwardX.setTargetAtTime(forward.x, t, 0.01);
      l.forwardY.setTargetAtTime(forward.y, t, 0.01);
      l.forwardZ.setTargetAtTime(forward.z, t, 0.01);
      l.upX.value = 0;
      l.upY.value = 1;
      l.upZ.value = 0;
    } else {
      l.setPosition(this._lx, this._ly, this._lz);
      l.setOrientation(forward.x, forward.y, forward.z, 0, 1, 0);
    }
  }

  _click(t, freq, gain = 0.35) {
    this._noise(t, { type: 'bandpass', freq, q: 3, gain, decay: 0.03 });
    this._tone(t, { type: 'square', freq: freq * 0.5, freqEnd: freq * 0.3, gain: gain * 0.25, decay: 0.035 });
  }

  /** Magazine check: release click, then the magazine seats again. */
  magCheck() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this._click(t + 0.3, 1800, 0.45);
    this._noise(t + 0.35, { type: 'lowpass', freq: 900, gain: 0.3, decay: 0.06 });
    this._click(t + 0.85, 1400, 0.7);
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
