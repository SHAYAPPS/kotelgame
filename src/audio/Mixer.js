import { DEFAULT_SETTINGS } from '../core/Settings.js';
import { plazaImpulse } from './reverb.js';

// The mix: every sound goes to a bus; the buses meet in a limiter.
//   effects (weapons, the world)  -> muffle (lowpass, suppression) -> duck -> volume -+
//     ambience (beds, crowd)      -> duck -> effects                                 |
//     reverb (the plaza)          <- sends; returns into effects                     +-> master -> limiter
//   music                         -> duck -> volume ----------------------------------+
//   voice (dialogue, radio)       -> volume ------------------------------------------+
// Dialogue ducks the rest a little while someone speaks; heavy fire muffles the world; the
// pause menu dulls and dims the world and the voices (the music plays on).

// The sliders' defaults (Settings saves the player's).
export const DEFAULT_VOLUMES = DEFAULT_SETTINGS.volumes;

// How far each bus dips under dialogue (gain at full ducking).
const DUCK = { sfx: 0.72, amb: 0.55, music: 0.45 };

export class Mixer {
  /** @param {AudioContext} ctx */
  constructor(ctx, volumes = DEFAULT_VOLUMES) {
    this.ctx = ctx;
    const g = (v = 1) => {
      const n = ctx.createGain();
      n.gain.value = v;
      return n;
    };
    // Master: a soft limiter so full-auto next to an explosion doesn't clip.
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -8;
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 10;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.16;
    this.limiter.connect(ctx.destination);
    this.master = g();
    this.master.connect(this.limiter);

    this.sfx = g(); // effects input
    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 20000;
    this.muffle.Q.value = 0.5;
    this.sfxDuck = g();
    this.sfxVol = g();
    this.pauseFilter = ctx.createBiquadFilter();
    this.pauseFilter.type = 'lowpass';
    this.pauseFilter.frequency.value = 20000;
    this.sfxPause = g();
    this.sfx.connect(this.muffle).connect(this.pauseFilter).connect(this.sfxPause).connect(this.sfxDuck).connect(this.sfxVol).connect(this.master);

    this.amb = g();
    this.ambDuck = g();
    this.amb.connect(this.ambDuck).connect(this.sfx);

    this.reverb = g(); // send input
    const conv = ctx.createConvolver();
    const [L, R] = plazaImpulse(ctx.sampleRate);
    const ir = ctx.createBuffer(2, L.length, ctx.sampleRate);
    ir.copyToChannel(L, 0);
    ir.copyToChannel(R, 1);
    conv.buffer = ir;
    this.reverbReturn = g(0.8);
    this.reverb.connect(conv).connect(this.reverbReturn).connect(this.sfx);

    this.music = g();
    this.musicDuck = g();
    this.musicVol = g();
    this.music.connect(this.musicDuck).connect(this.musicVol).connect(this.master);

    this.voice = g();
    this.voiceVol = g();
    this.voicePause = g();
    this.voice.connect(this.voiceVol).connect(this.voicePause).connect(this.master);

    this._duck = 0;
    this._muffle = 0;
    this.setVolumes(volumes);
  }

  /** User volumes 0..1 (sliders); perceptual (squared) gains. */
  setVolumes(v) {
    this.volumes = { ...DEFAULT_VOLUMES, ...v };
    const t = this.ctx.currentTime;
    const set = (node, x) => node.gain.setTargetAtTime(x * x, t, 0.03);
    set(this.master, this.volumes.master);
    set(this.sfxVol, this.volumes.sfx);
    set(this.musicVol, this.volumes.music);
    set(this.voiceVol, this.volumes.voice * 1.1);
  }

  /** 0..1: someone is speaking (dialogue gets priority). */
  setDucking(amount) {
    if (Math.abs(amount - this._duck) < 0.01) return;
    const t = this.ctx.currentTime;
    const tc = amount > this._duck ? 0.07 : 0.35; // dip fast, recover slowly
    this._duck = amount;
    this.sfxDuck.gain.setTargetAtTime(1 - (1 - DUCK.sfx) * amount, t, tc);
    this.ambDuck.gain.setTargetAtTime(1 - (1 - DUCK.amb) * amount, t, tc);
    this.musicDuck.gain.setTargetAtTime(1 - (1 - DUCK.music) * amount, t, tc);
  }

  /** The pause menu: the world (and voices) dulled and dimmed under it, the music as it was. */
  setPaused(paused) {
    const t = this.ctx.currentTime;
    this.pauseFilter.frequency.setTargetAtTime(paused ? 900 : 20000, t, 0.12);
    this.sfxPause.gain.setTargetAtTime(paused ? 0.25 : 1, t, 0.12);
    this.voicePause.gain.setTargetAtTime(paused ? 0.3 : 1, t, 0.12);
  }

  /** 0..1: hearing dulled by heavy fire (a lowpass closing over the world, a slight dip). */
  setMuffle(amount) {
    if (Math.abs(amount - this._muffle) < 0.005) return;
    this._muffle = amount;
    const t = this.ctx.currentTime;
    // Exponential sweep 20 kHz -> 650 Hz.
    const f = 20000 * Math.pow(650 / 20000, amount);
    this.muffle.frequency.setTargetAtTime(f, t, 0.05);
    this.sfx.gain.setTargetAtTime(1 - 0.35 * amount, t, 0.05);
  }
}
