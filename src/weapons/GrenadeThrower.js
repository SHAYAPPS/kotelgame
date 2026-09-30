import { Vector3 } from 'three';

const _o = new Vector3();
const _v = new Vector3();
const _right = new Vector3();

/**
 * The player's frag grenades (pure logic apart from the arc it asks the view to draw).
 * Hold G to aim (the predicted arc shows), release to throw; a quick tap throws too.
 */
export class GrenadeThrower {
  /**
   * @param {{ sim: import('./Grenades.js').GrenadeSim, view?: import('./Grenades.js').GrenadeView,
   *   audio?: object, config: { max: number, throwSpeed: number, cooldown: number } }} deps
   */
  constructor({ sim, view = null, audio = null, config }) {
    this.sim = sim;
    this.view = view;
    this.audio = audio;
    this.cfg = config;
    this.count = config.max;
    this.aiming = false;
    this.busy = 0; // throw animation time left (the rifle is down)
    this.cooldown = 0;
    this.enabled = true;
    /** (grenade) => void */
    this.onThrow = null;
  }

  refill() {
    this.count = this.cfg.max;
  }

  reset() {
    this.refill();
    this.aiming = false;
    this.busy = 0;
    this.cooldown = 0;
    if (this.view) this.view.showArc(null);
  }

  /** Where it leaves the hand and how fast, for the current view. */
  launch(eye, aimDir, playerVelocity, outOrigin, outVelocity) {
    _right.set(-aimDir.z, 0, aimDir.x).normalize();
    outOrigin.copy(eye).addScaledVector(_right, 0.18).add(_v.set(0, -0.12, 0)).addScaledVector(aimDir, 0.3);
    outVelocity.copy(aimDir).multiplyScalar(this.cfg.throwSpeed);
    outVelocity.y += 2.5; // a natural lob above the crosshair
    if (playerVelocity) outVelocity.addScaledVector(playerVelocity, 0.6);
    return outVelocity;
  }

  /**
   * Fixed step. `held` = G is down.
   * @returns {object | null} the grenade thrown this step
   */
  update(dt, held, eye, aimDir, playerVelocity) {
    this.busy = Math.max(0, this.busy - dt);
    this.cooldown = Math.max(0, this.cooldown - dt);
    const can = this.enabled && this.count > 0 && this.cooldown === 0;
    let thrown = null;
    if (held && can) {
      this.aiming = true;
    } else if (this.aiming && !held) {
      this.aiming = false;
      if (can) {
        this.launch(eye, aimDir, playerVelocity, _o, _v);
        thrown = this.sim.spawn(_o, _v, 'player');
        if (thrown) {
          this.count--;
          this.busy = 0.45;
          this.cooldown = this.cfg.cooldown;
          this.audio?.grenadeThrow?.();
          if (this.onThrow) this.onThrow(thrown);
        }
      }
    } else if (!can) {
      this.aiming = false;
    }
    return thrown;
  }

  /** Per rendered frame: the aiming arc. */
  frameUpdate(eye, aimDir, playerVelocity) {
    if (!this.view) return;
    if (this.aiming) {
      this.launch(eye, aimDir, playerVelocity, _o, _v);
      this.view.showArc(_o, _v);
    } else this.view.showArc(null);
  }
}
