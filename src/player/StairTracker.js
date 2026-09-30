// Stairs for a PlayerController body. The physics steps a body up or down a riser at a time
// (an instant height change while on the ground). This tracks those snaps and turns them into
// something to draw: a height `offset` to add to the body (a critically damped spring, led by
// the climbing speed so a flight of steps becomes a steady climb, not a lagging one), and how
// much the body is on stairs right now (`amount`, `dir` +1 up / -1 down). Pure logic.

const STEP_MIN = 0.05; // m: a height jump this big while on the ground is a stair step
const STEP_MAX = 0.5; // bigger: a teleport or respawn, not a step

export class StairTracker {
  constructor({ stiffness = 9 } = {}) {
    this.w = stiffness; // rad/s
    this.lastY = null;
    this.offset = 0; // add to the body's height for the view
    this.vel = 0;
    this.climb = 0; // m/s estimated from the steps (+ up)
    this.sinceStep = Infinity;
    this.dir = 0;
    this.amount = 0; // 0..1
    this.steps = 0; // steps taken (counter: footstep sounds)
  }

  /**
   * @param {number} dt
   * @param {number} y the body's feet height now
   * @param {boolean} grounded
   * @param {number} speed horizontal m/s
   * @param {number} shift optional: the body's own report of instant feet moves this step
   *   (PlayerController.feetShift); without it, height jumps between calls are the steps
   */
  update(dt, y, grounded, speed, shift = null) {
    if (this.lastY === null) this.lastY = y;
    const dy = shift ?? y - this.lastY;
    this.lastY = y;
    this.sinceStep += dt;
    if (Math.abs(dy) > STEP_MAX) {
      // Teleported (respawn, checkpoint): start over.
      this.offset = 0;
      this.vel = 0;
      this.climb = 0;
      this.sinceStep = Infinity;
    } else if (grounded && Math.abs(dy) > STEP_MIN) {
      this.offset -= dy; // the drawn body stays put, then catches up
      const rate = dy / Math.max(0.15, Math.min(this.sinceStep, 0.9));
      this.climb = this.sinceStep < 0.9 ? this.climb + (rate - this.climb) * 0.6 : rate * 0.5;
      this.dir = Math.sign(dy);
      this.sinceStep = 0;
      this.steps++;
    } else if (shift !== null && Math.abs(dy) > 1e-4) {
      this.offset -= dy; // other instant feet moves (crouch tucks): absorbed the same way
    }
    if (this.sinceStep > 0.5) this.climb *= Math.exp(-10 * dt);
    // Spring toward the lead (the spring's lag at the climbing speed), velocity continuous.
    const w = this.w;
    const lead = (this.climb * 2) / w;
    this.vel += (w * w * (lead - this.offset) - 2 * w * this.vel) * dt;
    this.offset += this.vel * dt;
    if (Math.abs(this.offset) > 0.45) {
      this.offset = Math.sign(this.offset) * 0.45;
      this.vel = 0;
    }
    const on = grounded && this.sinceStep < 0.7 && speed > 0.15 ? 1 : 0;
    this.amount += (on - this.amount) * (1 - Math.exp(-(on ? 7 : 3) * dt));
    if (this.amount < 0.001) this.amount = 0;
    return this;
  }
}
