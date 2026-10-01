// Suppression (pure logic, tested): rounds cracking past, impacts close by and blasts pile
// up a level that drains away over a few seconds. Above a threshold the world goes muffled
// (Mixer: a lowpass on the effects) and the screen edges blur (PostFX).

export const SUPPRESSION = {
  nearMiss: 0.16, // a round within ~2.5 m (scaled by how close)
  impact: 0.05, // a round hitting close to you
  blast: 0.6, // an explosion at point-blank range (scaled by distance)
  blastRange: 14, // m: blasts farther than this don't count
  max: 1.6,
  drain: 0.32, // per second, after the hold
  hold: 0.5, // s without new fire before it starts draining
  muffleFrom: 0.45, // level where hearing starts to dull
  blurFrom: 0.3,
};

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class Suppression {
  constructor(cfg = SUPPRESSION) {
    this.cfg = cfg;
    this.level = 0;
    this._quiet = 0;
  }

  /** A round passing `distance` m from your head (cracks). */
  nearMiss(distance) {
    this.add(this.cfg.nearMiss * Math.min(1.5, 1.6 / Math.max(0.3, distance)));
  }

  /** An explosion `distance` m away. */
  blast(distance) {
    if (distance > this.cfg.blastRange) return;
    this.add(this.cfg.blast * (1 - distance / this.cfg.blastRange) ** 1.5);
  }

  add(amount) {
    this.level = Math.min(this.cfg.max, this.level + amount);
    this._quiet = 0;
  }

  update(dt) {
    this._quiet += dt;
    if (this._quiet > this.cfg.hold) this.level = Math.max(0, this.level - this.cfg.drain * dt);
  }

  reset() {
    this.level = 0;
    this._quiet = 0;
  }

  /** 0..1: how muffled hearing is. */
  get muffle() {
    return smooth(this.cfg.muffleFrom, 1.3, this.level);
  }

  /** 0..1: how blurred the screen edges are. */
  get blur() {
    return smooth(this.cfg.blurFrom, 1.2, this.level);
  }
}
