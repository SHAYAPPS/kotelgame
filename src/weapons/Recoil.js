import { RIFLE } from './config.js';

/**
 * View recoil: every shot kicks the view up (and a little sideways); a critically
 * damped spring brings it back to where you were aiming. Pure logic.
 * `pitch` / `yaw` are offsets added on top of the player's own look angles.
 */
export class Recoil {
  constructor(config = RIFLE, random = Math.random) {
    this.cfg = config;
    this.random = random;
    this.pitch = 0;
    this.yaw = 0;
    this.pitchVelocity = 0;
    this.yawVelocity = 0;
  }

  kick(scale = 1) {
    const cfg = this.cfg;
    const w = cfg.recoilSpring;
    // Velocity impulses sized so a single kick peaks near recoilPitch / recoilYaw.
    this.pitchVelocity += cfg.recoilPitch * scale * w * Math.E;
    this.yawVelocity += (this.random() * 2 - 1) * cfg.recoilYaw * scale * w * Math.E;
  }

  update(dt) {
    // Exact critically damped spring step: x(t) = (x0 + (v0 + w x0) t) e^(-w t).
    const w = this.cfg.recoilSpring;
    const e = Math.exp(-w * dt);
    const kp = this.pitchVelocity + w * this.pitch;
    this.pitch = (this.pitch + kp * dt) * e;
    this.pitchVelocity = (this.pitchVelocity - w * kp * dt) * e;
    const ky = this.yawVelocity + w * this.yaw;
    this.yaw = (this.yaw + ky * dt) * e;
    this.yawVelocity = (this.yawVelocity - w * ky * dt) * e;
    if (this.pitch > this.cfg.maxRecoilPitch) {
      this.pitch = this.cfg.maxRecoilPitch;
      this.pitchVelocity = Math.min(this.pitchVelocity, 0);
    }
  }
}
