// The main menu's background: slow camera drifts across the level, one shot after another,
// through black between them. Pure (numbers in, numbers out; Game moves the real camera).

const FADE = 1.4; // seconds of black fade at each end of a shot

const smooth = (t) => t * t * (3 - 2 * t);

/**
 * @typedef {{ from: number[], to: number[], look: number[], lookTo?: number[], time: number }} Shot
 *   from / to: the camera's path (meters, eased), look / lookTo: what it looks at on the way
 */
export class MenuCamera {
  /** @param {Shot[]} shots */
  constructor(shots) {
    this.shots = shots;
    this.index = 0;
    this.t = 0;
    this.position = [0, 0, 0];
    this.target = [0, 0, 0];
    this.fade = 1; // 0 = clear, 1 = black
  }

  /** Back to the first shot, faded in from black. */
  reset() {
    this.index = 0;
    this.t = 0;
    this.update(0);
  }

  update(dt) {
    if (!this.shots.length) return this;
    let s = this.shots[this.index];
    this.t += dt;
    while (this.t >= s.time) {
      this.t -= s.time;
      this.index = (this.index + 1) % this.shots.length;
      s = this.shots[this.index];
    }
    // A slow drift: eased only a little, so it never stops or rushes.
    const u = this.t / s.time;
    const k = 0.75 * u + 0.25 * smooth(u);
    const lookTo = s.lookTo ?? s.look;
    for (let i = 0; i < 3; i++) {
      this.position[i] = s.from[i] + (s.to[i] - s.from[i]) * k;
      this.target[i] = s.look[i] + (lookTo[i] - s.look[i]) * k;
    }
    const edge = Math.min(this.t, s.time - this.t);
    this.fade = edge >= FADE ? 0 : 1 - smooth(edge / FADE);
    return this;
  }
}
