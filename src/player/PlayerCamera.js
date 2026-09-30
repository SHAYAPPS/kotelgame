import { MathUtils, Vector3 } from 'three';
import { VIEW } from './config.js';

const MAX_PITCH = Math.PI / 2 - 0.01;
const TWO_PI = Math.PI * 2;

/** Frame-rate independent exponential approach of `current` toward `target`. */
function damp(current, target, lambda, dt) {
  return target + (current - target) * Math.exp(-lambda * dt);
}

/**
 * First-person camera driven by a PlayerController.
 * - look(): mouse look, applied every rendered frame for the lowest latency.
 * - fixedUpdate(): camera feel (eye height smoothing, head bob, landing dip,
 *   sprint FOV, strafe roll), stepped with the physics.
 * - render(alpha): interpolates between the last two physics steps.
 */
export class PlayerCamera {
  constructor(camera, player, config = VIEW) {
    this.camera = camera;
    this.player = player;
    this.cfg = config;
    this.sensitivity = 1;

    this.yaw = player.yaw;
    this.pitch = 0;
    this.eyeHeight = player.targetEyeHeight; // smoothed, relative to the feet
    this.dip = 0;
    this.dipVelocity = 0;
    this.bobPhase = 0; // +1 per footstep
    this.bobWeight = 0;
    this.bobVertical = config.bob.walk.vertical;
    this.bobLateral = config.bob.walk.lateral;
    this.roll = 0;
    this.fov = config.fov;

    this.eye = new Vector3();
    this.prevEye = new Vector3();

    camera.rotation.order = 'YXZ';
    camera.fov = this.fov;
    camera.updateProjectionMatrix();
    this.snap();
  }

  look(dx, dy) {
    const k = this.cfg.lookRadiansPerPixel * this.sensitivity;
    this.yaw = (this.yaw - dx * k) % TWO_PI;
    this.pitch = MathUtils.clamp(this.pitch - dy * k, -MAX_PITCH, MAX_PITCH);
  }

  /** Reset all smoothing (spawn / teleport). */
  snap() {
    this.eyeHeight = this.player.targetEyeHeight;
    this.dip = 0;
    this.dipVelocity = 0;
    this.bobWeight = 0;
    this.roll = 0;
    this._computeEye(0, 0);
    this.prevEye.copy(this.eye);
  }

  fixedUpdate(dt) {
    const p = this.player;
    const cfg = this.cfg;

    if (p.teleported) {
      this.yaw = p.yaw;
      this.pitch = 0;
      this.snap();
      return;
    }

    // Eye height: absorb instant feet moves (steps, snaps, crouch tucks) so they
    // never pop the view, then ease toward the stance's eye height.
    const target = p.targetEyeHeight;
    this.eyeHeight = damp(this.eyeHeight - p.feetShift, target, cfg.eyeSmoothing, dt);
    this.eyeHeight = MathUtils.clamp(this.eyeHeight, target - 0.8, target + 0.8);

    // Landing dip: a critically damped spring kicked by the impact speed.
    if (p.landingSpeed > 1.5) {
      this.dipVelocity -= Math.min(p.landingSpeed, 14) * cfg.landingDipPerSpeed;
    }
    const w = cfg.landingSpring;
    this.dipVelocity += (-w * w * this.dip - 2 * w * this.dipVelocity) * dt;
    this.dip = MathUtils.clamp(this.dip + this.dipVelocity * dt, -cfg.maxLandingDip, cfg.maxLandingDip);

    // Head bob, phase-locked to distance walked (one bob per footstep).
    const pc = p.cfg;
    const speed = p.horizontalSpeed;
    const style = p.crouched ? cfg.bob.crouch : p.sprinting ? cfg.bob.sprint : cfg.bob.walk;
    const refSpeed = p.crouched ? pc.crouchSpeed : p.sprinting ? pc.sprintSpeed : pc.walkSpeed;
    this.bobWeight = damp(this.bobWeight, p.grounded && speed > 0.3 ? 1 : 0, 8, dt);
    this.bobVertical = damp(this.bobVertical, style.vertical, 6, dt);
    this.bobLateral = damp(this.bobLateral, style.lateral, 6, dt);
    if (p.grounded) this.bobPhase += (speed * dt) / (0.9 + 0.17 * speed);
    const k = this.bobWeight * Math.min(speed / refSpeed, 1.2);
    const bobY = -0.5 * this.bobVertical * k * Math.cos(TWO_PI * this.bobPhase);
    const bobX = this.bobLateral * k * Math.sin(Math.PI * this.bobPhase);

    // Slight roll into strafes.
    const rightSpeed = p.velocity.x * Math.cos(this.yaw) - p.velocity.z * Math.sin(this.yaw);
    const targetRoll = -(rightSpeed / pc.sprintSpeed) * MathUtils.degToRad(cfg.strafeRollDeg);
    this.roll = damp(this.roll, targetRoll, 10, dt);

    // Wider FOV while actually sprinting.
    const sprintFov = p.sprinting && speed > pc.walkSpeed ? cfg.sprintFovBoost : 0;
    this.fov = damp(this.fov, cfg.fov + sprintFov, cfg.fovSmoothing, dt);

    this.prevEye.copy(this.eye);
    this._computeEye(bobX, bobY);
  }

  _computeEye(bobX, bobY) {
    const p = this.player.position;
    this.eye.set(
      p.x + Math.cos(this.yaw) * bobX,
      p.y + this.eyeHeight + this.dip + bobY,
      p.z - Math.sin(this.yaw) * bobX,
    );
  }

  render(alpha) {
    const cam = this.camera;
    cam.position.lerpVectors(this.prevEye, this.eye, alpha);
    cam.rotation.set(this.pitch, this.yaw, this.roll);
    if (Math.abs(cam.fov - this.fov) > 1e-3) {
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
    }
  }
}
