import { MathUtils, Vector3 } from 'three';
import { Capsule } from 'three/addons/math/Capsule.js';
import { PLAYER } from './config.js';

const DOWN = new Vector3(0, -1, 0);
const _origin = new Vector3();

function moveTowards(vel, tx, tz, maxDelta) {
  const dx = tx - vel.x;
  const dz = tz - vel.z;
  const d = Math.hypot(dx, dz);
  if (d <= maxDelta || d < 1e-9) {
    vel.x = tx;
    vel.z = tz;
  } else {
    const k = maxDelta / d;
    vel.x += dx * k;
    vel.z += dz * k;
  }
}

/**
 * Kinematic first-person character controller (pure logic, no rendering).
 *
 * Model:
 * - The body is a capsule. On the ground its lower `stepHeight` is left out of
 *   collision ("floating capsule"). A ring of downward rays (the feet) holds the
 *   player on the ground, which gives stairs, curbs, slopes and ledge edges
 *   for free. Walls and ceilings collide with the capsule above the feet.
 * - In the air the full capsule collides, so edges and steep slopes slide you off.
 * - Call update() at a fixed timestep. `feetShift` and `landingSpeed` report the
 *   step's discontinuities so the camera can smooth them.
 */
export class PlayerController {
  constructor(world, config = PLAYER) {
    this.world = world;
    this.cfg = config;
    this.minWalkNormalY = Math.cos(MathUtils.degToRad(config.maxSlopeDeg));

    // Ground probe: center + ring of 8 rays.
    this.probeOffsets = [[0, 0]];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      this.probeOffsets.push([Math.cos(a) * config.footRadius, Math.sin(a) * config.footRadius]);
    }

    this.position = new Vector3(); // feet: bottom center of the capsule
    this.velocity = new Vector3();
    this.yaw = 0; // set from the camera before each update

    this.height = config.standHeight;
    this.crouched = false;
    this.wantCrouch = false;
    this.sprinting = false;
    this.grounded = false;
    this.groundNormal = new Vector3(0, 1, 0);

    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.sprintBlocked = false;

    // Per-step feedback for the camera, reset at the start of every update.
    this.feetShift = 0; // sum of instant vertical feet moves (steps, snaps, crouch tucks)
    this.landingSpeed = 0; // downward speed at touchdown, 0 when not landing this step
    this.jumped = false;
    this.teleported = false;

    this.spawnPoint = new Vector3();
    this.spawnYaw = 0;

    this.capsule = new Capsule(new Vector3(), new Vector3(), config.radius);
    this._testCapsule = new Capsule(new Vector3(), new Vector3(), config.radius);
    this._rayHit = { point: new Vector3(), normal: new Vector3(), distance: 0 };
    this._ground = { y: 0, normal: new Vector3() };
  }

  get horizontalSpeed() {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  /** Eye height above the feet for the current stance (the camera smooths toward it). */
  get targetEyeHeight() {
    return this.crouched ? this.cfg.crouchEyeHeight : this.cfg.standEyeHeight;
  }

  setSpawn(position, yaw = 0) {
    this.spawnPoint.copy(position);
    this.spawnYaw = yaw;
    this.respawn();
  }

  respawn() {
    this.position.copy(this.spawnPoint);
    this.velocity.set(0, 0, 0);
    this.yaw = this.spawnYaw;
    this.height = this.cfg.standHeight;
    this.crouched = false;
    this.wantCrouch = false;
    this.sprinting = false;
    this.grounded = false;
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.teleported = true;
    this._syncCapsule(this.capsule, this.position.y, this.height, true);
  }

  /**
   * Advance one fixed step.
   * @param {number} dt
   * @param {{forward: number, right: number, jump: boolean, sprint: boolean, crouch: boolean}} input
   *   forward/right are in [-1, 1]. jump and crouch are "pressed since last step". sprint is held.
   */
  update(dt, input) {
    const cfg = this.cfg;
    const pos = this.position;
    const vel = this.velocity;
    this.feetShift = 0;
    this.landingSpeed = 0;
    this.jumped = false;
    this.teleported = false;

    // --- Intent ---------------------------------------------------------------
    this.jumpBufferTimer = input.jump ? cfg.jumpBufferTime : Math.max(0, this.jumpBufferTimer - dt);
    this.coyoteTimer = this.grounded ? cfg.coyoteTime : Math.max(0, this.coyoteTimer - dt);

    if (!input.sprint) this.sprintBlocked = false;
    if (input.crouch) {
      this.wantCrouch = !this.wantCrouch;
      // Crouching while sprinting ends the sprint until Shift is pressed again.
      if (this.wantCrouch) this.sprintBlocked = input.sprint;
    }
    const wantsSprint = input.sprint && input.forward > 0.01 && !this.sprintBlocked;
    if (wantsSprint) this.wantCrouch = false;
    // Jump while crouched on the ground stands up instead (Call of Duty style).
    if (this.jumpBufferTimer > 0 && this.crouched && this.grounded) {
      this.wantCrouch = false;
      this.jumpBufferTimer = 0;
    }
    this._updateCrouch();

    // Sprint can only start on the ground; in the air you keep what you had.
    this.sprinting = wantsSprint && !this.crouched && (this.grounded || this.sprinting);

    // --- Horizontal velocity ---------------------------------------------------
    let fx = input.forward;
    let rx = input.right;
    const inputLen = Math.hypot(fx, rx);
    if (inputLen > 1) {
      fx /= inputLen;
      rx /= inputLen;
    }
    const speed = this.crouched ? cfg.crouchSpeed : this.sprinting ? cfg.sprintSpeed : cfg.walkSpeed;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    // forward = (-sin, 0, -cos), right = (cos, 0, -sin)
    const tx = (-sin * fx + cos * rx) * speed;
    const tz = (-cos * fx - sin * rx) * speed;
    const hasInput = inputLen > 0.01;
    if (this.grounded) {
      moveTowards(vel, tx, tz, (hasInput ? cfg.groundAccel : cfg.groundDecel) * dt);
    } else if (hasInput) {
      moveTowards(vel, tx, tz, cfg.airAccel * dt);
    }

    // --- Jump and gravity ------------------------------------------------------
    if (this.jumpBufferTimer > 0 && !this.crouched && (this.grounded || this.coyoteTimer > 0)) {
      vel.y = Math.sqrt(2 * cfg.gravity * cfg.jumpHeight);
      this.grounded = false;
      this.coyoteTimer = 0;
      this.jumpBufferTimer = 0;
      this.jumped = true;
    }
    const vyStart = this.grounded ? 0 : vel.y;
    vel.y = this.grounded ? 0 : Math.max(vel.y - cfg.gravity * dt, -cfg.maxFallSpeed);

    // --- Integrate (average velocity => exact jump arcs) -------------------------
    const startX = pos.x;
    const startZ = pos.z;
    pos.x += vel.x * dt;
    pos.z += vel.z * dt;
    pos.y += (vyStart + vel.y) * 0.5 * dt;
    const fallSpeed = -vel.y; // before collisions clip it, for the landing impact

    // --- Collide -----------------------------------------------------------------
    if (this._resolveCollisions()) {
      // Pushed against a flat ceiling while on the ground: block the move.
      pos.x = startX;
      pos.z = startZ;
      vel.x = 0;
      vel.z = 0;
    }

    // --- Ground ------------------------------------------------------------------
    const ground = this._probeGround();
    if (this.grounded) {
      if (ground !== null && ground.y >= pos.y - cfg.snapDownDistance) {
        const shift = ground.y - pos.y;
        if (shift > 1e-4 && this._blocked(ground.y, this.height, false)) {
          // Stepping up would push our head into something: treat the step as a wall.
          pos.x = startX;
          pos.z = startZ;
          vel.x = 0;
          vel.z = 0;
        } else {
          pos.y = ground.y;
          this.feetShift += shift;
          this.groundNormal.copy(ground.normal);
        }
      } else {
        this.grounded = false; // walked off an edge; coyote time still allows a jump
      }
    } else if (vel.y <= 0 && ground !== null) {
      const above = pos.y - ground.y; // > 0 while still above the surface
      const allowance = Math.max(cfg.airStepHeight, -vel.y * dt + 0.01);
      if (above <= 0.01 && -above <= allowance) {
        this.landingSpeed = Math.max(0, fallSpeed);
        vel.y = 0;
        this.feetShift += ground.y - pos.y;
        pos.y = ground.y;
        this.grounded = true;
        this.groundNormal.copy(ground.normal);
      }
    }

    if (!this.grounded && pos.y < cfg.killY) this.respawn();
    this._syncCapsule(this.capsule, pos.y, this.height, !this.grounded);
  }

  // Capsule for a given feet height. `full` includes the feet zone (used in the air).
  _syncCapsule(cap, feetY, height, full) {
    const r = this.cfg.radius;
    const bottom = full ? feetY : feetY + this.cfg.stepHeight;
    cap.radius = r;
    cap.start.set(this.position.x, bottom + r, this.position.z);
    cap.end.set(this.position.x, Math.max(feetY + height - r, bottom + r), this.position.z);
  }

  /**
   * Push the capsule out of the world. On the ground, pushes are horizontal only
   * (the feet rays own the vertical axis). Returns true if a flat ceiling blocked us
   * while grounded.
   */
  _resolveCollisions() {
    const pos = this.position;
    const vel = this.velocity;
    const cap = this.capsule;
    const grounded = this.grounded;
    let ceiling = false;

    for (let iter = 0; iter < 4; iter++) {
      this._syncCapsule(cap, pos.y, this.height, !grounded);
      const tris = this.world.trianglesNear(cap);
      let pushed = false;

      for (let i = 0; i < tris.length; i++) {
        const c = this.world.capsuleContact(cap, tris[i]);
        if (c === null || c.depth < 1e-5) continue;
        const n = c.normal;

        if (grounded) {
          if (n.y < -0.7) {
            ceiling = true;
            continue;
          }
          const hl = Math.hypot(n.x, n.z);
          if (hl < 1e-4) continue;
          const nx = n.x / hl;
          const nz = n.z / hl;
          const push = Math.min(c.depth / hl, c.depth * 4);
          pos.x += nx * push;
          pos.z += nz * push;
          const vn = vel.x * nx + vel.z * nz;
          if (vn < 0) {
            vel.x -= nx * vn;
            vel.z -= nz * vn;
          }
        } else {
          pos.addScaledVector(n, c.depth);
          const vn = vel.dot(n);
          if (vn < 0) vel.addScaledVector(n, -vn);
        }

        this._syncCapsule(cap, pos.y, this.height, !grounded);
        pushed = true;
      }
      if (!pushed) break;
    }
    return ceiling;
  }

  /**
   * Highest walkable support under the feet ring, between snapDownDistance below
   * the feet and stepHeight above them. Returns { y, normal } or null.
   */
  _probeGround() {
    const cfg = this.cfg;
    const pos = this.position;
    const top = pos.y + cfg.stepHeight;
    const originY = top + 0.1;
    const maxDist = originY - (pos.y - cfg.snapDownDistance);
    const out = this._ground;
    let bestY = -Infinity;

    for (let i = 0; i < this.probeOffsets.length; i++) {
      const ox = this.probeOffsets[i][0];
      const oz = this.probeOffsets[i][1];
      _origin.set(pos.x + ox, originY, pos.z + oz);
      const hit = this.world.raycast(_origin, DOWN, maxDist, this._rayHit);
      if (hit === null) continue;
      const n = hit.normal;
      if (n.y < this.minWalkNormalY) continue; // too steep to stand on
      const hy = hit.point.y;
      if (hy > top + 1e-4) continue; // taller than a step: that's a wall
      // Height of this surface's plane under the probe center (so slopes don't make
      // us float), but never above what the ray actually hit (convex edges).
      const y = Math.min(hy + (n.x * ox + n.z * oz) / n.y, hy);
      if (y > bestY) {
        bestY = y;
        out.normal.copy(n);
      }
    }

    if (bestY === -Infinity) return null;
    out.y = bestY;
    return out;
  }

  /** Would a capsule at this feet height / body height overlap the world? */
  _blocked(feetY, height, full) {
    const cap = this._testCapsule;
    this._syncCapsule(cap, feetY, height, full);
    const tris = this.world.trianglesNear(cap);
    for (let i = 0; i < tris.length; i++) {
      const c = this.world.capsuleContact(cap, tris[i]);
      if (c !== null && c.depth > 0.01) return true;
    }
    return false;
  }

  _updateCrouch() {
    const cfg = this.cfg;
    const tuck = cfg.standHeight - cfg.crouchHeight;

    if (this.wantCrouch && !this.crouched) {
      this.crouched = true;
      this.height = cfg.crouchHeight;
      if (!this.grounded) {
        // In the air, pull the legs up and keep the head where it is.
        this.position.y += tuck;
        this.feetShift += tuck;
      }
    } else if (!this.wantCrouch && this.crouched) {
      if (this.grounded) {
        if (!this._blocked(this.position.y, cfg.standHeight, false)) {
          this.crouched = false;
          this.height = cfg.standHeight;
        }
      } else if (!this._blocked(this.position.y - tuck, cfg.standHeight, true)) {
        this.position.y -= tuck;
        this.feetShift -= tuck;
        this.crouched = false;
        this.height = cfg.standHeight;
      } else if (!this._blocked(this.position.y, cfg.standHeight, true)) {
        this.crouched = false;
        this.height = cfg.standHeight;
      }
    }
  }
}
