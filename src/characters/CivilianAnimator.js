import { MathUtils } from 'three';
import { CHARACTER } from './config.js';

const pick = (list, r) => list[Math.floor(r() * list.length) % list.length];

/**
 * Drives a civilian's CharacterModel from its story NPC (story/Npc.js): standing (a few
 * idles, phones, looking around), praying at the wall, walking and running (cycles at the
 * real ground speed), frozen in fear, running for the shelter, waiting there nervously,
 * talking while they have a line.
 */
export class CivilianAnimator {
  /**
   * @param {import('./CharacterModel.js').CharacterModel} model
   * @param {{ kind: string, rand?: () => number }} opts
   */
  constructor(model, { kind, rand = Math.random }) {
    this.model = model;
    this.kind = kind;
    this.meta = model.type.meta;
    this.hips = model.type.hipsRatio;
    const female = model.info.sex === 'f';
    this.walk = female ? 'walk_female' : 'walk_male';
    this.run = 'run_standard';
    this.idle =
      kind === 'tourist' ? pick(['idle_lookaround', 'texting', 'idle_breathing', 'idle_lookaround'], rand)
      : kind === 'civilian' ? pick([female ? 'talk_phone_female' : 'talk_phone_male', 'texting', 'idle_weightshift', 'idle_standing'], rand)
      : kind === 'guide' ? 'idle_standing'
      : pick(['idle_standing', 'idle_breathing', 'idle_weightshift'], rand);
    // Davening: the standing sway (each worshiper at his own rate and phase, see below).
    this.pray = 'praying_swaying';
    this.shelterIdle = rand() < 0.6 ? 'idle_nervous' : 'terrified';
    this.speed = 0;
    this.phase = rand();
    this.mix = new Map(); // standing clip -> share
    this.frozenTime = 0;
    this.scared = false;
    this.talkWalk = false;
    this._used = new Set();
    // Desynchronize loops (a crowd praying in unison looks wrong).
    this.offset = rand() * 8;
    this.rate = 0.9 + rand() * 0.2;
    model.ikWeight = 0;
  }

  /**
   * @param {number} dt
   * @param {{ speed: number, pray: boolean, frozen: boolean, fleeing: boolean, sheltered: boolean,
   *   panicking: boolean, speaking: boolean, crouched: boolean }} s
   */
  update(dt, s) {
    const m = this.model;
    const c = CHARACTER;
    this.speed += (s.speed - this.speed) * (1 - Math.exp(-c.speedSmoothing * dt));
    const speed = this.speed;
    const move = MathUtils.smoothstep(speed, c.moveThreshold, 0.5);

    // What to do standing still.
    let stand;
    if (s.frozen) stand = 'cower_hiding';
    else if (s.panicking) stand = 'terrified';
    else if (s.sheltered) stand = this.shelterIdle;
    else if (s.pray) stand = this.pray;
    else if (s.speaking) stand = 'talk_general';
    else stand = this.idle;
    this.frozenTime = s.frozen ? this.frozenTime + dt : 0;

    const used = this._used;
    used.clear();
    const rate = dt / c.fade;
    for (const [k, w] of this.mix) {
      const nw = k === stand ? Math.min(1, w + rate) : Math.max(0, w - rate);
      if (nw <= 0) this.mix.delete(k);
      else this.mix.set(k, nw);
    }
    if (!this.mix.has(stand)) this.mix.set(stand, this.mix.size ? rate : 1);
    let sum = 0;
    for (const w of this.mix.values()) sum += w;
    for (const [k, w] of this.mix) {
      used.add(k);
      const weight = ((1 - move) * w) / sum;
      if (m.slots.has(k)) m.setWeight(k, weight);
      else {
        // First time: desynchronized start (a crowd praying in unison looks wrong).
        const once = k === 'cower_hiding';
        m.fade(k, weight, 0, { loop: !once, timeScale: once ? 1 : this.rate, startAt: once ? 0 : this.offset % (this.meta[k]?.duration ?? 1) });
      }
    }

    if (move > 0) {
      // Walk / run blend by speed; both cycles share the foot phase.
      const kRun = MathUtils.clamp((speed - 1.5) / 1.4, 0, 1);
      let stride = 0;
      for (let k = 0; k < 2; k++) {
        const clip = k ? this.run : this.walk;
        const w = k ? kRun : 1 - kRun;
        if (w <= 0.001) continue;
        const meta = this.meta[clip];
        used.add(clip);
        m.setWeight(clip, move * w, true);
        stride += w * meta.speed * meta.duration * this.hips;
      }
      this.phase = (this.phase + (dt * speed) / stride) % 1;
    }
    // Talking while walking: the arms gesture over the walk.
    const talkWalk = s.speaking && move > 0.5 && !s.fleeing;
    if (talkWalk !== this.talkWalk) {
      this.talkWalk = talkWalk;
      m.fade('talk_general', talkWalk ? 0.55 : 0, 0.4, { mode: 'upper', key: 'talkUpper', startAt: this.offset % 6 });
    }
    // Running for the shelter: the upper body of the look-back run over the legs (scared).
    const scared = s.fleeing && speed > 2;
    if (scared !== this.scared) {
      this.scared = scared;
      m.fade('run_scared_lookback', scared ? 0.6 : 0, 0.3, { mode: 'upper', key: 'scared', startAt: this.offset % 2 });
    }
    m.phase = this.phase;
    for (const [k, sl] of m.slots) if (sl.mode === 'base' && !used.has(k) && sl.target > 0) sl.target = 0;
  }
}
