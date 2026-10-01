import { Mixer, loadVolumes, saveVolumes } from '../audio/Mixer.js';
import { SoundBank } from '../audio/SoundBank.js';
import { Music } from '../audio/Music.js';
import { Suppression } from '../audio/Suppression.js';
import { wallEcho } from '../audio/reverb.js';
import { LAUNCHER, VIEWMODEL } from './config.js';

// The game's sound: recorded effects (public/assets/audio/, see scripts/assets/audio.mjs)
// through the mixer (src/audio/Mixer.js). This class keeps the old WeaponAudio interface the
// rest of the game calls (shot, shotAt, crack, explosion, footstep, reload, ...) and owns the
// mix, the music and the suppression state. The AudioContext can only start after a user
// gesture: call unlock() from a click.

const SOUND_SPEED = 343;
const BASE = `${import.meta.env?.BASE_URL ?? '/'}assets/audio/`;
const rand = (a, b) => a + Math.random() * (b - a);

// Where each event sits inside its recording (seconds from the clip's start): sounds start
// that much before the animation's mark so the click lands on it.
const EVENT = { mag_out: 0.055, mag_in: 0.215, bolt: 0.03, launcher_load: 0.42 };

export class WeaponAudio {
  constructor() {
    this.ctx = null;
    this.mixer = null;
    this.bank = null;
    this.music = null;
    this.suppression = new Suppression();
    /** Flat walls that throw a slap-back echo: [{ n: [x, y, z], d, absorb?, reach? }] (Game sets them per level). */
    this.walls = [];
    this.volumes = loadVolumes();
    this._listener = { x: 0, y: 0, z: 0 };
    this._speakUntil = 0;
  }

  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx({ latencyHint: 'interactive' });
      this.ctx = ctx;
      this.mixer = new Mixer(ctx, this.volumes);
      this.bank = new SoundBank(ctx, BASE);
      this.bank.load().then(
        () => (this.music = new Music(this.mixer, BASE, this.bank.manifest.music)),
        (e) => console.warn('Sounds did not load.', e),
      );
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  get ready() {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  /** The effects bus (what used to be the master); positional sounds connect here. */
  get master() {
    return this.mixer?.sfx ?? null;
  }

  /** The plaza reverb's send. */
  get echoBus() {
    return this.mixer?.reverb ?? null;
  }

  get voiceBus() {
    return this.mixer?.voice ?? null;
  }

  get ambienceBus() {
    return this.mixer?.amb ?? null;
  }

  /** Screen-edge blur from suppression (0..1), for PostFX. */
  get blur() {
    return this.suppression.blur;
  }

  setVolumes(v) {
    this.volumes = { ...this.volumes, ...v };
    saveVolumes(this.volumes);
    this.mixer?.setVolumes(this.volumes);
  }

  /** Someone speaks for `seconds`: the rest of the mix dips under the line. */
  speaking(seconds) {
    if (!this.ctx) return;
    this._speakUntil = Math.max(this._speakUntil, this.ctx.currentTime + seconds);
  }

  /** Music mood: 'calm' | 'tense' | 'combat' | 'push' | 'end' | null. */
  setMusic(state) {
    this._musicState = state;
    this.music?.setState(state);
  }

  /** Per rendered frame: suppression -> muffle, dialogue -> ducking. */
  update(dt) {
    this.suppression.update(dt);
    if (!this.mixer) return;
    this.mixer.setMuffle(this.suppression.muffle);
    this.mixer.setDucking(this.ctx.currentTime < this._speakUntil ? 1 : 0);
    // The music started before the sounds were loaded: catch up.
    if (this.music && this._musicState !== undefined && this.music.state !== this._musicState) this.music.setState(this._musicState);
  }

  /** New life / restart: no lingering suppression. */
  reset() {
    this.suppression.reset();
  }

  // -------------------------------------------------------------------------------------------
  // Playback

  _panner(position, refDistance = 6, hrtf = true) {
    const p = this.ctx.createPanner();
    p.panningModel = hrtf ? 'HRTF' : 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = refDistance;
    p.rolloffFactor = 1;
    p.maxDistance = 1000;
    if (p.positionX) {
      p.positionX.value = position.x;
      p.positionY.value = position.y;
      p.positionZ.value = position.z;
    } else p.setPosition(position.x, position.y, position.z);
    return p;
  }

  _distance(p) {
    const l = this._listener;
    return Math.hypot(p.x - l.x, p.y - l.y, p.z - l.z);
  }

  /**
   * Plays a sound. opts: at (world position: panned and attenuated), ref (panner reference
   * distance), gain (linear), rate, delay (s), send (reverb amount), lowpass (Hz), bus (node),
   * index (variant), hrtf.
   * @returns {{ src: AudioBufferSourceNode, gain: GainNode } | null}
   */
  play(id, opts = {}) {
    if (!this.ready || !this.bank) return null;
    const buf = this.bank.buffer(id, opts.index ?? -1);
    if (!buf) return null;
    const ctx = this.ctx;
    const t = ctx.currentTime + (opts.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = opts.rate ?? 1;
    const gain = ctx.createGain();
    gain.gain.value = opts.gain ?? 1;
    let node = src;
    if (opts.lowpass) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = opts.lowpass;
      node = node.connect(f);
    }
    node.connect(gain);
    let out = gain;
    if (opts.at) out = gain.connect(this._panner(opts.at, opts.ref ?? 6, opts.hrtf ?? true));
    out.connect(opts.bus ?? this.mixer.sfx);
    if (opts.send) {
      const s = ctx.createGain();
      s.gain.value = opts.send;
      gain.connect(s).connect(this.mixer.reverb);
    }
    src.start(t);
    src.onended = () => {
      gain.disconnect();
      if (out !== gain) out.disconnect();
    };
    return { src, gain };
  }

  /**
   * A looping sound (engine, ambience beds) with a handle to move / retune / fade it.
   * @returns {{ setPosition(p), setRate(r), setGain(g, time?), stop(fade?) } | null}
   */
  loop(id, opts = {}) {
    if (!this.ready || !this.bank) return null;
    const buf = this.bank.buffer(id, opts.index ?? 0);
    if (!buf) return null;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.playbackRate.value = opts.rate ?? 1;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(opts.gain ?? 1, ctx.currentTime, opts.fadeIn ?? 0.5);
    let node = src;
    if (opts.lowpass) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = opts.lowpass;
      node = node.connect(f);
    }
    node.connect(gain);
    const panner = opts.at ? this._panner(opts.at, opts.ref ?? 8, opts.hrtf ?? false) : null;
    (panner ? gain.connect(panner) : gain).connect(opts.bus ?? this.mixer.amb);
    if (opts.send) {
      const s = ctx.createGain();
      s.gain.value = opts.send;
      gain.connect(s).connect(this.mixer.reverb);
    }
    // Start somewhere inside the loop so two runs don't sound the same.
    src.start(ctx.currentTime, opts.offset ?? Math.random() * buf.duration);
    return {
      setPosition(p) {
        if (!panner) return;
        if (panner.positionX) {
          panner.positionX.value = p.x;
          panner.positionY.value = p.y;
          panner.positionZ.value = p.z;
        } else panner.setPosition(p.x, p.y, p.z);
      },
      setRate: (r) => src.playbackRate.setTargetAtTime(r, ctx.currentTime, 0.1),
      setGain: (g, time = 0.4) => gain.gain.setTargetAtTime(g, ctx.currentTime, time),
      stop: (fade = 0.6) => {
        gain.gain.setTargetAtTime(0, ctx.currentTime, fade / 3);
        src.stop(ctx.currentTime + fade + 0.1);
        src.onended = () => {
          gain.disconnect();
          panner?.disconnect();
        };
      },
    };
  }

  /** Slap-backs off the level's walls for a loud sound at `p` (a duller, later copy from the mirror image). */
  _echoes(id, p, gain, extraDelay = 0) {
    for (const w of this.walls) {
      const e = wallEcho(p, this._listener, w);
      if (!e || e.delay < 0.03) continue;
      this.play(id, { at: e.position, ref: 10, gain: gain * e.gain, delay: extraDelay + e.delay, lowpass: 2600, hrtf: false });
    }
  }

  // -------------------------------------------------------------------------------------------
  // Weapons

  /** The player's rifle: the close blast, the action, the plaza answering. */
  shot() {
    if (!this.ready) return;
    const rate = rand(0.97, 1.03);
    this.play('rifle_close', { gain: 0.95, rate, send: 0.18, bus: this.mixer.sfx });
    this.play('rifle_mech', { gain: 0.35, rate: rand(0.95, 1.08) });
    this.play('rifle_tail', { gain: 0.55, rate, delay: 0.012, send: 0.25 });
    this._echoes('ar_mid', this._listener, 0.7);
  }

  /**
   * A gunshot somewhere in the world, heard after the sound's travel time: the close report
   * up close, the mid-distance one further out, a dull far crack beyond that; more plaza
   * reverb with distance. kind: 'ak' (the attackers), 'ar' (the squad), 'mg' (the truck).
   */
  shotAt(position, kind = 'ak') {
    if (!this.ready) return;
    const d = Math.max(1, this._distance(position));
    const delay = d / SOUND_SPEED;
    const base = kind === 'ar' ? 'ar' : 'ak';
    const rate = (kind === 'mg' ? 0.8 : 1) * rand(0.96, 1.04);
    // Two layers crossfaded by distance.
    const near = 1 - smooth(18, 60, d);
    const far = smooth(70, 170, d);
    const mid = 1 - near - far;
    const lp = 1200 + 17000 * Math.exp(-d / 70);
    const at = position;
    const loud = kind === 'mg' ? 1.3 : 1;
    const send = Math.min(0.9, 0.15 + d / 120);
    if (near > 0.02) this.play(`${base}_near`, { at, ref: 8, gain: 0.7 * near * loud, rate, delay, send, lowpass: lp });
    if (mid > 0.02) this.play(`${base}_mid`, { at, ref: 10, gain: mid * loud * 1.2, rate, delay, send, lowpass: lp, hrtf: d < 60 });
    if (far > 0.02) this.play(`${base}_far`, { at, ref: 14, gain: far * loud * 1.5, rate, delay, send, hrtf: false });
    if (d < 120) this._echoes(`${base}_mid`, position, 0.45 * loud, 0);
  }

  /** A round cracking past your head at `position` (the point where it passed). */
  crack(position) {
    if (!this.ready) return;
    const d = this._distance(position);
    this.suppression.nearMiss(d);
    this.play('crack', { at: position, ref: 1.5, gain: 1.15, rate: rand(0.92, 1.1) });
    if (Math.random() < 0.6) this.play('whiz', { at: position, ref: 1, gain: 0.75, rate: rand(0.85, 1.2), delay: 0.004 });
  }

  /** A round slapping into the stone close to you (no sound of its own: the impact effect has it). */
  nearImpact(position) {
    const d = this._distance(position);
    if (d < 3) this.suppression.add(this.suppression.cfg.impact * (3 - d));
  }

  /** You got hit: a jolt of suppression. */
  hurt() {
    this.suppression.add(0.25);
  }

  /** An explosion: close = the blast, far = a heavy boom rolling off the city; size 'small' for grenades. */
  explosion(position, size = 'big') {
    if (!this.ready) return;
    const d = Math.max(1, this._distance(position));
    this.suppression.blast(d);
    const delay = d / SOUND_SPEED;
    const send = Math.min(1, 0.35 + d / 90);
    const near = 1 - smooth(60, 160, d);
    if (near > 0.02) {
      const id = size === 'small' && Math.random() < 0.7 ? 'explosion_small' : 'explosion';
      this.play(id, { at: position, ref: 10, gain: 1.2 * near, rate: rand(0.92, 1.06), delay, send, lowpass: 2500 + 17000 * Math.exp(-d / 60) });
    }
    if (near < 0.98) this.play('boom_far', { at: position, ref: 30, gain: 1.4 * (1 - near), delay, send: 0.5, hrtf: false });
    if (d < 140) this._echoes('boom_far', position, 0.5, 0);
  }

  /** Rocket launch: the backblast. */
  rocketLaunch() {
    if (!this.ready) return;
    this.play('rocket_launch', { gain: 1, send: 0.35 });
    this.suppression.add(0.25);
    this._echoes('boom_far', this._listener, 0.35);
  }

  /** Pulling the pin and the throw. */
  grenadeThrow() {
    if (!this.ready) return;
    this.play('grenade_pin', { gain: 0.4 });
    this.play('grenade_throw', { gain: 0.6, delay: 0.22 });
  }

  /** A grenade hitting the ground somewhere. */
  grenadeBounce(position) {
    this.play('grenade_bounce', { at: position, ref: 3, gain: 0.8, rate: rand(0.9, 1.1), send: 0.1 });
  }

  /** A spent casing landing (speed m/s, which bounce). */
  casing(position, speed, bounce = 1) {
    if (speed < 0.4) return;
    this.play('casing', { at: position, ref: 1, gain: Math.min(0.45, speed / 8) * (bounce === 1 ? 1 : 0.65), rate: rand(0.9, 1.15) });
  }

  /** Footstep: stone or wood (the ramp up to the Mughrabi Gate); stairs a bit harder. */
  footstep(level = 0.6, stair = false, surface = 'stone') {
    if (!this.ready) return;
    const id = surface === 'wood' ? 'step_wood' : 'step_stone';
    this.play(id, { gain: (0.15 + 0.28 * level) * (stair ? 1.15 : 1), rate: rand(0.93, 1.07) });
    // Gear rattling when you run.
    if (level > 0.8 && Math.random() < 0.35) this.play('gear', { gain: 0.14, rate: rand(0.95, 1.1) });
  }

  /** Hit marker tick when your shot lands (heavier for headshots); not muffled. */
  hitmarker(head = false) {
    this.play(head ? 'hit_head' : 'hit', { gain: head ? 0.3 : 0.25, bus: this.mixer?.master });
  }

  /** Where the listener (the camera) is; call every frame. */
  setListener(camera, forward) {
    const p = camera.position;
    this._listener.x = p.x;
    this._listener.y = p.y;
    this._listener.z = p.z;
    if (!this.ctx) return;
    const l = this.ctx.listener;
    const t = this.ctx.currentTime;
    if (l.positionX) {
      l.positionX.setValueAtTime(p.x, t);
      l.positionY.setValueAtTime(p.y, t);
      l.positionZ.setValueAtTime(p.z, t);
      l.forwardX.setValueAtTime(forward.x, t);
      l.forwardY.setValueAtTime(forward.y, t);
      l.forwardZ.setValueAtTime(forward.z, t);
      l.upX.setValueAtTime(0, t);
      l.upY.setValueAtTime(1, t);
      l.upZ.setValueAtTime(0, t);
    } else {
      l.setPosition(p.x, p.y, p.z);
      l.setOrientation(forward.x, forward.y, forward.z, 0, 1, 0);
    }
  }

  /** Magazine check: release click, then the magazine seats again. */
  magCheck() {
    this.play('mag_check', { index: 0, gain: 0.3, delay: 0.3 });
    this.play('mag_check', { index: 1, gain: 0.35, delay: 1.1 });
  }

  dryFire() {
    this.play('dry_fire', { gain: 0.4 });
  }

  /** Charging handle racked (the click lands on the viewmodel's release at 0.47 s). */
  charge() {
    this.play('charge', { gain: 0.45, delay: 0.14 });
  }

  /**
   * The reload's sounds on the animation's marks (VIEWMODEL.reload / launcherReload).
   * @param {number} duration reload time (s) @param {{ empty?: boolean, launcher?: boolean }} [o]
   */
  reload(duration, o = {}) {
    if (!this.ready) return;
    if (o.launcher || duration === LAUNCHER.reloadTime) {
      const k = duration / LAUNCHER.reloadTime;
      this.play('launcher_load', { gain: 0.45, delay: Math.max(0, VIEWMODEL.launcherReload.rocketIn * k - EVENT.launcher_load) });
      this.play('gear', { gain: 0.16, delay: 0.25 });
      return;
    }
    const R = VIEWMODEL.reload;
    const k = duration / 2;
    this.play('mag_out', { gain: 0.35, delay: Math.max(0, R.magOut * k - EVENT.mag_out) });
    this.play('gear', { gain: 0.1, delay: 0.55 * k });
    this.play('mag_in', { gain: 0.4, delay: R.magIn * k - EVENT.mag_in });
    if (o.empty) this.play('bolt', { gain: 0.45, delay: R.bolt * k - EVENT.bolt });
  }
}

function smooth(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
