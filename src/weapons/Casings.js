import {
  DynamicDrawUsage,
  InstancedMesh,
  LatheGeometry,
  MathUtils,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector2,
  Vector3,
} from 'three';

const GRAVITY = 9.81;
const RESTITUTION = 0.38;
const FRICTION = 0.55; // tangential speed kept per bounce
const REST_SPEED = 0.35; // m/s: slower than this on the ground and it lies still
const RADIUS = 0.005; // collision radius (m)

const _d = new Vector3();
const _n = new Vector3();
const _q = new Quaternion();
const _m = new Matrix4();
const _s = new Vector3(1, 1, 1);
const _axis = new Vector3();
const _up = new Vector3(0, 1, 0);

/**
 * Spent casings: thrown from the rifle's ejection port, they tumble, bounce on the stone
 * (collision world raycasts), clink (onBounce) and stay where they land until the pool
 * recycles them. One InstancedMesh, no per-frame allocations.
 */
export class Casings {
  /**
   * @param {import('three').Scene} scene
   * @param {import('../world/CollisionWorld.js').CollisionWorld} world
   * @param {number} [max] casings kept at once (the oldest is reused)
   */
  constructor(scene, world, max = 64) {
    this.world = world;
    // A 5.56 mm case: 45 mm long, rim 9.6 mm, shoulder and neck.
    const profile = [
      [0, 0],
      [0.0048, 0],
      [0.0048, 0.0012],
      [0.0042, 0.0016],
      [0.0046, 0.0024],
      [0.0047, 0.036],
      [0.0034, 0.0405],
      [0.0031, 0.041],
      [0.0031, 0.045],
      [0.0027, 0.045],
    ].map(([r, y]) => new Vector2(r, y - 0.0225));
    const geo = new LatheGeometry(profile, 10);
    const mat = new MeshStandardMaterial({ color: 0xc9a25a, metalness: 0.9, roughness: 0.32 });
    this.mesh = new InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.items = [];
    for (let i = 0; i < max; i++) {
      this.items.push({ p: new Vector3(), v: new Vector3(), q: new Quaternion(), w: new Vector3(), moving: false, bounces: 0, age: 0 });
    }
    this.next = 0;
    this.used = 0;
    this.hit = { point: new Vector3(), normal: new Vector3(), distance: 0 };
    /** (position: Vector3, speed: number, bounces: number) => void, per impact (sound). */
    this.onBounce = null;
    this._dirty = false;
  }

  /** A new casing at world position p with velocity v (m/s). */
  eject(p, v) {
    const c = this.items[this.next];
    this.next = (this.next + 1) % this.items.length;
    this.used = Math.min(this.items.length, this.used + 1);
    c.p.copy(p);
    c.v.copy(v);
    // Tumbling end over end, mostly about an axis across the bore.
    c.q.setFromAxisAngle(_axis.set(0, 0, 1), Math.PI / 2).premultiply(_q.setFromAxisAngle(_up, Math.random() * Math.PI * 2));
    c.w.set((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 12, 25 + Math.random() * 20);
    c.moving = true;
    c.bounces = 0;
    c.age = 0;
    this._dirty = true;
  }

  clear() {
    this.used = 0;
    this.next = 0;
    for (const c of this.items) c.moving = false;
    this.mesh.count = 0;
  }

  update(dt) {
    if (!this.used) return;
    const steps = Math.max(1, Math.ceil(dt / (1 / 90)));
    const h = Math.min(dt, 0.1) / steps;
    for (let i = 0; i < this.used; i++) {
      const c = this.items[i];
      if (!c.moving) continue;
      this._dirty = true;
      for (let k = 0; k < steps && c.moving; k++) this._step(c, h);
    }
    if (!this._dirty) return;
    this._dirty = false;
    for (let i = 0; i < this.used; i++) {
      const c = this.items[i];
      _m.compose(c.p, c.q, _s);
      this.mesh.setMatrixAt(i, _m);
    }
    this.mesh.count = this.used;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  _step(c, h) {
    c.age += h;
    c.v.y -= GRAVITY * h;
    c.v.multiplyScalar(1 - 0.15 * h); // a little air drag
    const len = c.v.length() * h;
    if (len > 1e-7) {
      _d.copy(c.v).normalize();
      const hit = this.world.raycast(c.p, _d, len + RADIUS, this.hit);
      if (hit) {
        // Bounce: lose most of the normal speed, some of the sliding speed; spin up randomly.
        _n.copy(hit.normal);
        const vn = c.v.dot(_n);
        const speed = -vn;
        c.p.copy(hit.point).addScaledVector(_n, RADIUS);
        if (vn < 0) {
          c.v.addScaledVector(_n, -vn); // tangential part
          c.v.multiplyScalar(FRICTION).addScaledVector(_n, -vn * RESTITUTION);
        }
        c.w.set((Math.random() - 0.5) * 40, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 40).multiplyScalar(Math.min(1, speed / 3));
        c.bounces++;
        if (speed > 0.25 && this.onBounce) this.onBounce(c.p, speed, c.bounces);
        // Done bouncing: lie on its side on the surface.
        if ((speed < REST_SPEED * 2 && _n.y > 0.6 && c.v.length() < REST_SPEED * 2) || c.bounces > 6) {
          this._rest(c, _n);
          return;
        }
      } else {
        c.p.addScaledVector(c.v, h);
      }
    }
    // Spin (angular velocity in world space, rad/s).
    const wl = c.w.length();
    if (wl > 1e-4) {
      _q.setFromAxisAngle(_axis.copy(c.w).divideScalar(wl), wl * h);
      c.q.premultiply(_q);
    }
    if (c.age > 6) c.moving = false; // fell out of the world / stuck: freeze
  }

  _rest(c, normal) {
    c.moving = false;
    c.v.set(0, 0, 0);
    // Case axis (local +Y) laid flat along the surface, keeping its heading.
    _axis.set(0, 1, 0).applyQuaternion(c.q);
    _axis.addScaledVector(normal, -_axis.dot(normal));
    if (_axis.lengthSq() < 1e-6) _axis.set(1, 0, 0).addScaledVector(normal, -normal.x);
    _axis.normalize();
    c.q.setFromUnitVectors(_up, _axis);
    c.p.addScaledVector(normal, 0.0048 - RADIUS);
  }
}

/**
 * The viewmodel's ejection port (view space) as a world position: the viewmodel draws with
 * its own field of view, so the port's screen position is carried over to the world camera
 * at the same depth (the casing appears to leave the port), then into world space.
 */
export function viewToWorld(viewPos, vmCamera, camera, out) {
  const kx = Math.tan(MathUtils.degToRad(camera.fov) / 2) / Math.tan(MathUtils.degToRad(vmCamera.fov) / 2);
  out.set(viewPos.x * kx, viewPos.y * kx, viewPos.z);
  return out.applyMatrix4(camera.matrixWorld);
}

