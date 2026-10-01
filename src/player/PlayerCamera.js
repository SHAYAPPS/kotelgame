import { MathUtils, Vector3 } from 'three';
import { VIEW } from './config.js';
import { StairTracker } from './StairTracker.js';

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
    // The player's settings: mouse sensitivity, times `aimSensitivity` while aiming (by `aim`,
    // 0..1, set by the weapon), inverted vertical look, the field of view.
    this.sensitivity = 1;
    this.aimSensitivity = 1;
    this.invertY = false;
    this.aim = 0;
    this.baseFov = config.fov;

    this.yaw = player.yaw;
    this.pitch = 0;
    this.eyeHeight = player.targetEyeHeight; // smoothed, relative to the feet
    this.steps = new StairTracker({ stiffness: 11 }); // steps / stairs smoothing (eye offset)
    this.dip = 0;
    this.dipVelocity = 0;
    this.bobPhase = 0; // +1 per footstep
    this.bobWeight = 0;
    this.bobVertical = config.bob.walk.vertical;
    this.bobLateral = config.bob.walk.lateral;
    this.roll = 0;
    this.fov = config.fov;

    // Set by the weapon every frame: recoil offsets on top of the look angles,
    // a world-FOV multiplier (aim down sights) and a mouse sensitivity multiplier.
    this.offsetPitch = 0;
    this.offsetYaw = 0;
    this.fovScale = 1;
    this.lookScale = 1;

    // Camera shake ("trauma" 0..1, decays): explosions. View only, the aim is unaffected.
    this.shake = 0;
    this._shakeTime = 0;

    this.eye = new Vector3();
    this.prevEye = new Vector3();

    camera.rotation.order = 'YXZ';
    camera.fov = this.fov;
    camera.updateProjectionMatrix();
    this.snap();
  }

  look(dx, dy) {
    const k = this.cfg.lookRadiansPerPixel * this.sensitivity * this.lookScale * (1 + (this.aimSensitivity - 1) * this.aim);
    this.yaw = (this.yaw - dx * k) % TWO_PI;
    this.pitch = MathUtils.clamp(this.pitch - dy * k * (this.invertY ? -1 : 1), -MAX_PITCH, MAX_PITCH);
  }

  /** Reset all smoothing (spawn / teleport). */
  snap() {
    this.eyeHeight = this.player.targetEyeHeight;
    this.steps = new StairTracker({ stiffness: 11 });
    this.dip = 0;
    this.dipVelocity = 0;
    this.bobWeight = 0;
    this.roll = 0;
    this._computeEye(0, 0);
    this.prevEye.copy(this.eye);
  }

  /** Add camera shake (0..1). */
  addShake(amount) {
    this.shake = Math.min(1, this.shake + amount);
  }

  fixedUpdate(dt) {
    const p = this.player;
    const cfg = this.cfg;
    this.shake = Math.max(0, this.shake - dt * 0.9);
    this._shakeTime += dt;

    if (p.teleported) {
      this.yaw = p.yaw;
      this.pitch = 0;
      this.snap();
      return;
    }

    // Eye height: ease toward the stance's eye height (crouching). Instant feet moves (steps,
    // snaps, crouch tucks) go into `steps.offset`, a critically damped spring led by the
    // climbing speed: stairs become a smooth climb, not a jerk per step.
    const target = p.targetEyeHeight;
    this.eyeHeight = damp(this.eyeHeight, target, cfg.eyeSmoothing, dt);
    this.steps.update(dt, p.position.y, p.grounded, p.horizontalSpeed, p.feetShift);

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
    this.fov = damp(this.fov, this.baseFov + sprintFov, cfg.fovSmoothing, dt);

    this.prevEye.copy(this.eye);
    this._computeEye(bobX, bobY);
  }

  _computeEye(bobX, bobY) {
    const p = this.player.position;
    this.eye.set(
      p.x + Math.cos(this.yaw) * bobX,
      p.y + this.eyeHeight + this.steps.offset + this.dip + bobY,
      p.z - Math.sin(this.yaw) * bobX,
    );
  }

  /** Pitch actually shown (look + recoil), clamped short of straight up/down. */
  get viewPitch() {
    return MathUtils.clamp(this.pitch + this.offsetPitch, -MAX_PITCH, MAX_PITCH);
  }

  get viewYaw() {
    return this.yaw + this.offsetYaw;
  }

  /** Unit vector the view (and the crosshair) points along, including recoil. */
  getAimDirection(out) {
    const p = this.viewPitch;
    const y = this.viewYaw;
    return out.set(-Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p));
  }

  render(alpha) {
    const cam = this.camera;
    cam.position.lerpVectors(this.prevEye, this.eye, alpha);
    if (this.shake > 0) {
      // Smooth pseudo-noise from mixed sines; amplitude grows with trauma squared.
      const a = this.shake * this.shake * 0.03;
      const t = this._shakeTime;
      cam.rotation.set(
        this.viewPitch + a * (Math.sin(t * 37) * 0.6 + Math.sin(t * 23.3) * 0.4),
        this.viewYaw + a * (Math.sin(t * 29.1) * 0.6 + Math.sin(t * 41.7) * 0.4),
        this.roll + a * 0.5 * Math.sin(t * 31.9),
      );
    } else {
      cam.rotation.set(this.viewPitch, this.viewYaw, this.roll);
    }
    const fov = this.fov * this.fovScale;
    if (Math.abs(cam.fov - fov) > 1e-3) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
  }
}
