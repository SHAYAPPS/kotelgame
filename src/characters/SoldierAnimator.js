import { MathUtils, Vector3 } from 'three';
import { CHARACTER } from './config.js';
import { stairLegs } from './stairs.js';
import { pickDeath } from './deaths.js';

const DIRS = ['f', 'fl', 'l', 'bl', 'b', 'br', 'r', 'fr']; // counterclockwise from forward, 45 degrees apart
const _v = new Vector3();

function wrap(a) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/**
 * 8-way locomotion: the two direction clips around a local move direction and their weights.
 * @param {number} dir atan2(left, forward) of the local velocity (0 = forward, +PI/2 = left)
 * @returns {[[string, number], [string, number]]} clip suffixes (f, fl, l, bl, b, br, r, fr)
 */
export function directionBlend(dir, out = [['f', 1], ['fl', 0]]) {
  const idx = (((dir / (Math.PI / 4)) % 8) + 8) % 8;
  const lo = Math.floor(idx) % 8;
  const t = idx - Math.floor(idx);
  out[0][0] = DIRS[lo];
  out[0][1] = 1 - t;
  out[1][0] = DIRS[(lo + 1) % 8];
  out[1][1] = t;
  return out;
}

// Clip names per gait and direction, built once.
const GAITS = ['rifle_walk', 'rifle_run', 'rifle_crouchwalk'];
const CLIP = Object.fromEntries(GAITS.map((g) => [g, Object.fromEntries(DIRS.map((d) => [d, `${g}_${d}`]))]));

/**
 * Drives a soldier's CharacterModel (squad or enemy) from its AI state, every rendered
 * frame. Pure animation choices; the AI (ai/Enemy.js) never waits for it.
 *
 * Base layer (weights sum to 1): an idle for the posture, or 8-way locomotion (walk / run /
 * crouch-walk, two neighboring directions blended by the local move direction), all cycles
 * sharing one foot phase that advances with the real ground speed (no sliding feet).
 * Overlays: reloads and grenade throws on the upper body, recoil and hit reactions added
 * on top, deaths chosen by where the killing shot came from.
 */
export class SoldierAnimator {
  /**
   * @param {import('./CharacterModel.js').CharacterModel} model
   * @param {{ world?: object, rand?: () => number }} opts world: collision (deaths avoid walls)
   */
  constructor(model, { world = null, rand = Math.random } = {}) {
    this.model = model;
    this.world = world;
    this.rand = rand;
    this.meta = model.type.meta;
    this.hips = model.type.hipsRatio; // bigger characters take longer strides
    this.speed = 0;
    this.moveX = 0; // smoothed local velocity (x: left, z: forward), m/s
    this.moveZ = 0;
    this.crouch = 0;
    this.phase = 0;
    this.idleMix = new Map(); // idle clip -> share of the idle weight
    this.cover = 0; // 0..1: turned with the back against high cover
    this.coverYaw = 0;
    this.yaw = null;
    this.lastFacing = null;
    this.turnRate = 0;
    this.aim = 0;
    // Events
    this.shots = null;
    this.health = null;
    this.throws = null;
    this.flash = 0;
    this.sinceReload = 0;
    this.quiet = 0; // seconds since the last shot
    this.upper = null; // { clip, until }
    this.hitUntil = 0;
    this.time = 0;
    this.dead = false;
    this.deathClip = null;
    this.talking = false;
    this.stairState = { clip: null };
    this.model.ikWeight = 1;
    this._used = new Set();
    this._ray = { point: new Vector3(), normal: new Vector3(), distance: 0 };
    this._blend2 = [['f', 1], ['fl', 0]];
    this._gaits = [0, 0, 0];
  }

  /**
   * @param {number} dt
   * @param {{ alive: boolean, facing: number, velocity: Vector3, crouched: boolean,
   *   posture: 'relaxed'|'alert'|'combat', mode?: string, cover?: object|null,
   *   aimAt?: Vector3|null, eyeY: number, shotsFired: number, health: number, throws: number,
   *   deathDir?: Vector3, hitZone?: string|null, position: Vector3, speaking?: boolean,
   *   stairs?: number, stairDir?: number }} s stairs: 0..1 on stairs (StairTracker)
   */
  update(dt, s) {
    const m = this.model;
    this.time += dt;
    if (this.dead) return;
    if (!s.alive) return this._die(s);

    // Events: shots (flash + recoil), hits, throws.
    if (this.shots === null) {
      this.shots = s.shotsFired;
      this.health = s.health;
      this.throws = s.throws;
    }
    if (s.shotsFired !== this.shots) {
      const n = s.shotsFired - this.shots;
      this.shots = s.shotsFired;
      this.sinceReload += n;
      this.quiet = 0;
      this.flash = 0.05;
      if (m.rifle) m.rifle.flash.rotation.z = this.rand() * Math.PI;
      m.fade('rifle_fire_stand', 0.9, 0, { mode: 'addUpper', restart: true, loop: false, key: 'recoil' });
      if (this.upper?.clip.startsWith('rifle_reload')) this._endUpper(0.12); // cut a reload short
    } else this.quiet += dt;
    if (s.health < this.health - 0.5) this._hit(s);
    this.health = s.health;
    if (s.throws !== this.throws) {
      this.throws = s.throws;
      this._throw(s);
    }
    if (m.rifle) {
      m.rifle.flash.visible = this.flash > 0;
      this.flash = Math.max(0, this.flash - dt);
    }
    // Recoil / hit overlays fade out after their moment.
    const rec = m.slots.get('recoil');
    if (rec && rec.target > 0 && rec.action.time > 0.12) m.fade('rifle_fire_stand', 0, 0.12, { key: 'recoil' });
    if (this.hitUntil && this.time > this.hitUntil) {
      this.hitUntil = 0;
      for (const k of ['hit_rifle_stand', 'hit_rifle_front_left', 'hit_rifle_crouch']) if (m.slots.has(`hit:${k}`)) m.fade(k, 0, 0.3, { key: `hit:${k}` });
    }
    if (this.upper && this.time > this.upper.until) this._endUpper(0.3);
    this._maybeReload(s);

    // Local move velocity (smoothed) and turning.
    const c = CHARACTER;
    const f = s.facing;
    const vx = s.velocity.x;
    const vz = s.velocity.z;
    const fwd = -vx * Math.sin(f) - vz * Math.cos(f);
    const left = -vx * Math.cos(f) + vz * Math.sin(f);
    const k = 1 - Math.exp(-c.dirSmoothing * dt);
    this.moveX += (left - this.moveX) * k;
    this.moveZ += (fwd - this.moveZ) * k;
    this.speed = Math.hypot(this.moveX, this.moveZ);
    if (this.lastFacing !== null && dt > 0) {
      const w = wrap(f - this.lastFacing) / dt;
      this.turnRate += (w - this.turnRate) * (1 - Math.exp(-8 * dt));
    }
    this.lastFacing = f;
    this.crouch += ((s.crouched ? 1 : 0) - this.crouch) * (1 - Math.exp(-9 * dt));

    // Cover pose (back to high cover while hiding) and the visual yaw.
    const cv = s.cover;
    const wall = s.posture === 'combat' && s.mode === 'hiding' && cv && !cv.low && this.speed < 0.4;
    if (wall) this.coverYaw = Math.atan2(-cv.dx, -cv.dz) - 2.3; // the clip's back faces ~132 degrees round
    this.cover = MathUtils.clamp(this.cover + (wall ? dt : -dt) * 3, 0, 1);
    this.yaw = f + wrap(this.coverYaw - f) * this.cover;
    m.root.rotation.y = this.yaw;

    this._base(dt, s);
    stairLegs(m, this.stairState, s.stairs ?? 0, s.stairDir ?? 1, this.speed);

    // Aim: the spine pitches toward the target while aiming.
    const aiming = s.posture === 'combat' && s.aimAt && !this.upper && this.cover < 0.5;
    this.aim += ((aiming ? 1 : 0) - this.aim) * (1 - Math.exp(-6 * dt));
    if (s.aimAt) {
      const dx = s.aimAt.x - s.position.x;
      const dz = s.aimAt.z - s.position.z;
      m.aimPitch = Math.atan2(s.aimAt.y - (s.position.y + s.eyeY), Math.max(0.5, Math.hypot(dx, dz)));
    }
    m.aimWeight = this.aim;

    // Talking off duty: the left hand gestures (the right keeps the rifle), the head follows
    // the talk (plus CharacterModel's look toward the listener).
    const talk = !!s.speaking && s.posture !== 'combat' && !this.upper && this.crouch < 0.5;
    if (talk !== this.talking) {
      this.talking = talk;
      m.fade('talk_question_left', talk ? 1 : 0, talk ? 0.35 : 0.45, { mode: 'leftArm', key: 'talk', startAt: this.rand() * 2 });
    }
    m.ikLeft += ((talk ? 0 : 1) - m.ikLeft) * (1 - Math.exp(-5 * dt));
  }

  /** Idle / locomotion weights (sum to 1). */
  _base(dt, s) {
    const m = this.model;
    const c = CHARACTER;
    const used = this._used;
    used.clear();
    const relaxed = s.posture === 'relaxed';
    // Turning in place: a few side steps so the feet don't slide round.
    let mx = this.moveX;
    let mz = this.moveZ;
    let speed = this.speed;
    const turn = Math.abs(this.turnRate);
    if (speed < 0.3 && turn > 1.2 && !relaxed) {
      const step = Math.min(0.9, (turn - 1.2) * 0.4);
      mx = Math.sign(this.turnRate) * step;
      mz = 0;
      speed = step;
    }
    const move = MathUtils.smoothstep(speed, c.moveThreshold, 0.6);

    // Idle for the posture.
    let idle;
    if (relaxed) idle = 'rifle_idle_relaxed';
    else if (s.posture === 'alert') idle = this.crouch > 0.5 ? 'rifle_crouch_idle' : s.mode === 'idle' ? 'rifle_idle_lookaround' : 'rifle_idle';
    else if (this.cover > 0) idle = 'cover_wall_idle';
    else if (this.crouch > 0.5) idle = s.mode === 'hiding' ? 'rifle_crouch_idle' : 'rifle_crouch_idle_aiming';
    else idle = 'rifle_idle_aiming';
    // Crossfade between idles.
    const rate = dt / c.fade;
    for (const [k, w] of this.idleMix) {
      const nw = k === idle ? Math.min(1, w + rate) : Math.max(0, w - rate);
      if (nw <= 0) this.idleMix.delete(k);
      else this.idleMix.set(k, nw);
    }
    if (!this.idleMix.has(idle)) this.idleMix.set(idle, this.idleMix.size ? rate : 1);
    let sum = 0;
    for (const w of this.idleMix.values()) sum += w;
    for (const [k, w] of this.idleMix) this._set(k, ((1 - move) * w) / sum, used);

    // Locomotion.
    if (move > 0) {
      const dir = Math.atan2(mx, mz);
      const blend = directionBlend(dir, this._blend2);
      const [[dLo, wLo], [dHi, wHi]] = blend;
      const g = this._gaits;
      if (relaxed) {
        const kRun = MathUtils.clamp((speed - 1.6) / 1.6, 0, 1);
        g[0] = 1 - kRun; // relaxed walk
        g[1] = kRun; // relaxed run
        g[2] = 0;
      } else {
        const kRun = MathUtils.clamp((speed - 1.86) / (4.64 - 1.86), 0, 1);
        const cr = this.crouch;
        g[0] = (1 - kRun) * (1 - cr);
        g[1] = kRun * (1 - cr);
        g[2] = cr;
      }
      // Far away: the strongest gait and direction only (fewer clips to mix).
      const cheap = m.distance > 30;
      let strongest = 0;
      if (cheap) for (let k = 1; k < 3; k++) if (g[k] > g[strongest]) strongest = k;
      let strideSum = 0;
      let wSum = 0;
      for (let k = 0; k < 3; k++) {
        const w = cheap ? (k === strongest ? 1 : 0) : g[k];
        if (w <= 0.001) continue;
        if (relaxed) {
          const name = k === 0 ? 'rifle_walk_relaxed' : 'rifle_run_relaxed';
          strideSum += this._loco(name, move * w, w, used);
          wSum += w;
          continue;
        }
        const names = CLIP[GAITS[k]];
        if (cheap) {
          strideSum += this._loco(names[wLo >= wHi ? dLo : dHi], move * w, w, used);
          wSum += w;
          continue;
        }
        if (wLo > 0.001) {
          strideSum += this._loco(names[dLo], move * w * wLo, w * wLo, used);
          wSum += w * wLo;
        }
        if (wHi > 0.001) {
          strideSum += this._loco(names[dHi], move * w * wHi, w * wHi, used);
          wSum += w * wHi;
        }
      }
      if (wSum > 0) this.phase = (this.phase + (dt * speed) / (strideSum / wSum)) % 1;
    }
    m.phase = this.phase;
    // Anything else on the base layer fades out now.
    for (const [k, sl] of m.slots) if (sl.mode === 'base' && !used.has(k) && sl.target > 0) sl.target = 0;
  }

  _set(name, w, used, sync = false) {
    used.add(name);
    this.model.setWeight(name, w, sync);
  }

  /** A locomotion cycle at weight `w`; returns its stride contribution (`share` of the mix). */
  _loco(name, w, share, used) {
    const meta = this.meta[name];
    if (!meta) return 0;
    this._set(name, w, used, true);
    return share * meta.speed * meta.duration * this.hips;
  }

  _hit(s) {
    const m = this.model;
    const name = this.crouch > 0.5 ? 'hit_rifle_crouch' : this.rand() < 0.5 ? 'hit_rifle_stand' : 'hit_rifle_front_left';
    m.fade(name, 0.85, 0.05, { mode: 'addUpper', restart: true, loop: false, key: `hit:${name}` });
    this.hitUntil = this.time + 0.45;
  }

  _throw(s) {
    const clip = this.crouch > 0.5 ? 'grenade_throw_crouch' : 'grenade_toss_stand';
    const release = this.meta[clip]?.release ?? 1.5;
    // Start just before the release: the grenade leaves the hand now (the AI threw it).
    this._startUpper(clip, Math.max(0, release - 0.4), 1.1);
  }

  _maybeReload(s) {
    if (this.upper || this.sinceReload < 28 || s.posture !== 'combat') return;
    const behindCover = s.mode === 'hiding';
    if (!behindCover && this.quiet < 1.4) return;
    this.sinceReload = 0;
    const crouched = this.crouch > 0.5;
    const clip = crouched ? 'rifle_reload_crouch' : 'rifle_reload_stand';
    // The crouched reload is long and slow: play it faster.
    this._startUpper(clip, 0, crouched ? 3.4 : 2.9, crouched ? 1.9 : 1.05);
  }

  _startUpper(clip, startAt, length, timeScale = 1) {
    if (this.upper) this.model.fade(this.upper.clip, 0, 0.1, { key: 'upper' });
    this.model.fade(clip, 1, 0.18, { mode: 'upper', restart: true, loop: false, startAt, timeScale, key: 'upper' });
    this.upper = { clip, until: this.time + length };
  }

  _endUpper(time) {
    if (!this.upper) return;
    this.model.fade(this.upper.clip, 0, time, { key: 'upper' });
    this.upper = null;
  }

  _die(s) {
    const m = this.model;
    if (!this.deathClip) {
      this.deathClip = pickDeath({
        facing: m.root.rotation.y,
        dir: s.deathDir,
        zone: s.hitZone,
        crouched: this.crouch > 0.5,
        rand: this.rand,
        meta: this.meta,
        free: this.world ? (d, dist) => this._free(s.position, d, dist) : null,
      });
      m.fadeOut(0.12);
      m.fade(this.deathClip, 1, 0.12, { restart: true, loop: false });
      m.aimWeight = 0;
      if (m.rifle) m.rifle.flash.visible = false;
      this.deathStart = this.time;
    }
    const dur = this.meta[this.deathClip]?.duration ?? 3;
    if (this.time - this.deathStart > dur + 0.2) {
      // Down for good: the fall's last frame, then stop animating this body.
      m.finish(this.deathClip);
      m.freeze();
      this.dead = true;
    }
  }

  /** Is there room to fall `dist` meters along the world direction `d` (x, z)? */
  _free(pos, d, dist) {
    _v.set(pos.x, pos.y + 0.6, pos.z);
    const dir = new Vector3(d.x, 0, d.z).normalize();
    const hit = this.world.raycast(_v, dir, dist, this._ray);
    return hit ? hit.distance : dist;
  }
}
