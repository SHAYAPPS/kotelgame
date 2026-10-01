import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CylinderGeometry,
  Group,
  Line,
  LineDashedMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RingGeometry,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three';
import { litSmokeMaterial } from '../world/Particles.js';

// Frag grenades, thrown by the player and by enemies.
// GrenadeSim is the physics (pure, unit-tested): gravity, bounces off the collision
// world, rolling to a stop, a fuse, then `onExplode(grenade)`. GrenadeView draws the
// live grenades, explosions (flash + smoke) and the player's aiming arc.

export const GRAVITY = 9.81;
const RESTITUTION = 0.35;
const FRICTION = 0.55; // tangential speed kept per bounce
const RADIUS = 0.05;
const MAX = 12;

const _d = new Vector3();
const _hit = { point: new Vector3(), normal: new Vector3(), distance: 0 };

/**
 * Launch velocity so a throw from `from` lands at `to`, on an arc with the given
 * launch angle above the horizon (steeper when the target is higher up).
 * @returns {Vector3} out
 */
export function solveThrow(from, to, out, angle = 0.62) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const r = Math.max(0.5, Math.hypot(dx, dz));
  const h = to.y - from.y;
  let a = angle;
  let denom = 2 * Math.cos(a) ** 2 * (r * Math.tan(a) - h);
  if (denom <= 0.1) {
    a = 1.1;
    denom = 2 * Math.cos(a) ** 2 * (r * Math.tan(a) - h);
  }
  const v = Math.sqrt((GRAVITY * r * r) / Math.max(denom, 0.1));
  const hs = (v * Math.cos(a)) / r;
  return out.set(dx * hs, v * Math.sin(a), dz * hs);
}

export class GrenadeSim {
  /**
   * @param {import('../world/CollisionWorld.js').CollisionWorld} world
   * @param {{ fuse?: number }} [opts]
   */
  constructor(world, { fuse = 3.2 } = {}) {
    this.world = world;
    this.fuse = fuse;
    this.items = Array.from({ length: MAX }, () => ({
      live: false,
      position: new Vector3(),
      velocity: new Vector3(),
      time: 0,
      fuse: 0,
      owner: 'player', // 'player' | 'hostile'
      thrower: null,
      resting: false,
      spin: 0,
    }));
    /** (grenade) => void, when one goes off */
    this.onExplode = null;
    /** (grenade) => void, when one hits something (for a clink sound) */
    this.onBounce = null;
  }

  get live() {
    return this.items.filter((g) => g.live);
  }

  clear() {
    for (const g of this.items) g.live = false;
  }

  /** Throw one. Returns the grenade (or null when the pool is full). */
  spawn(position, velocity, owner = 'player', thrower = null, fuse = this.fuse) {
    const g = this.items.find((x) => !x.live);
    if (!g) return null;
    g.live = true;
    g.position.copy(position);
    g.velocity.copy(velocity);
    g.time = 0;
    g.fuse = fuse;
    g.owner = owner;
    g.thrower = thrower;
    g.resting = false;
    return g;
  }

  /** Fixed step. */
  update(dt) {
    for (const g of this.items) {
      if (!g.live) continue;
      g.time += dt;
      if (!g.resting) this._integrate(g.position, g.velocity, dt, g);
      g.spin += dt * g.velocity.length() * 8;
      if (g.time >= g.fuse) {
        g.live = false;
        if (this.onExplode) this.onExplode(g);
      }
    }
  }

  /** One physics step for a point (shared by the sim and the arc prediction). */
  _integrate(p, v, dt, g = null) {
    v.y -= GRAVITY * dt;
    const len = v.length() * dt;
    if (len < 1e-6) return false;
    _d.copy(v).normalize();
    const hit = this.world.raycast(p, _d, len + RADIUS, _hit);
    if (!hit) {
      p.addScaledVector(v, dt);
      return false;
    }
    // Bounce: reflect with restitution, lose some tangential speed.
    const n = hit.normal;
    p.copy(hit.point).addScaledVector(n, RADIUS + 0.005);
    const vn = v.dot(n);
    v.addScaledVector(n, -vn).multiplyScalar(FRICTION).addScaledVector(n, -vn * RESTITUTION);
    if (g) {
      if (Math.abs(vn) > 1.2 && this.onBounce) this.onBounce(g);
      // Came to rest on a floor.
      if (n.y > 0.7 && v.length() < 0.6) {
        v.set(0, 0, 0);
        g.resting = true;
      }
    }
    return true;
  }

  /**
   * Predict a throw's path (for the aiming arc). Fills `out` (Vector3[]) up to its
   * length; returns how many points were written. The last one is where it stops.
   */
  predict(position, velocity, out, step = 0.05, maxTime = 3) {
    const p = _pp.copy(position);
    const v = _pv.copy(velocity);
    let n = 0;
    out[n++].copy(p);
    let bounces = 0;
    for (let t = 0; t < maxTime && n < out.length; t += step) {
      if (this._integrate(p, v, step)) bounces++;
      out[n++].copy(p);
      if (bounces >= 2 || v.lengthSq() < 0.5) break;
    }
    return n;
  }
}

const _pp = new Vector3();
const _pv = new Vector3();

function radialTexture(stops) {
  const size = 64;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [t, col] of stops) grad.addColorStop(t, col);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/** Draws live grenades, explosions and the player's aiming arc (all pooled). */
export class GrenadeView {
  constructor(scene, sim) {
    this.sim = sim;
    this.root = new Group();
    scene.add(this.root);
    const body = new CylinderGeometry(0.035, 0.04, 0.1, 8);
    const mat = new MeshStandardMaterial({ color: 0x3d4430, roughness: 0.7 });
    this.meshes = sim.items.map(() => {
      const m = new Mesh(body, mat);
      m.visible = false;
      m.castShadow = false;
      this.root.add(m);
      return m;
    });

    const flashTex = radialTexture([[0, 'rgba(255,240,200,1)'], [0.3, 'rgba(255,170,70,0.9)'], [1, 'rgba(255,120,40,0)']]);
    const smokeTex = radialTexture([[0, 'rgba(48,45,40,0.95)'], [0.45, 'rgba(62,58,52,0.75)'], [1, 'rgba(80,76,70,0)']]);
    this.blasts = Array.from({ length: 10 }, () => {
      const flash = new Sprite(new SpriteMaterial({ map: flashTex, color: 0xffffff, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
      flash.material.color.setScalar(5); // HDR: the fireball blooms
      const smoke = new Sprite(litSmokeMaterial(smokeTex));
      flash.visible = smoke.visible = false;
      this.root.add(smoke, flash);
      return { t: -1, flash, smoke, pos: new Vector3() };
    });

    // Aiming arc: a dashed line + a ring where it lands.
    this.arcPoints = Array.from({ length: 64 }, () => new Vector3());
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array(64 * 3), 3));
    this.arc = new Line(geo, new LineDashedMaterial({ color: 0xffffff, dashSize: 0.25, gapSize: 0.15, transparent: true, opacity: 0.9, depthTest: false }));
    this.arc.frustumCulled = false;
    this.arc.renderOrder = 5;
    this.arc.visible = false;
    this.ring = new Mesh(new RingGeometry(0.3, 0.42, 24).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0.8, depthTest: false }));
    this.ring.renderOrder = 5;
    this.ring.visible = false;
    this.root.add(this.arc, this.ring);
  }

  /** A blast at `position`; `size` scales it (1 = a grenade). */
  explode(position, size = 1) {
    const b = this.blasts.find((x) => x.t < 0) ?? this.blasts[0];
    b.t = 0;
    b.size = size;
    b.pos.copy(position);
    b.flash.position.copy(position);
    b.smoke.position.copy(position);
    b.flash.visible = b.smoke.visible = true;
  }

  /** Show the predicted arc (null hides it). */
  showArc(origin, velocity) {
    if (!origin) {
      this.arc.visible = this.ring.visible = false;
      return;
    }
    const n = this.sim.predict(origin, velocity, this.arcPoints);
    const attr = this.arc.geometry.getAttribute('position');
    for (let i = 0; i < 64; i++) {
      const p = this.arcPoints[Math.min(i, n - 1)];
      attr.setXYZ(i, p.x, p.y, p.z);
    }
    attr.needsUpdate = true;
    this.arc.geometry.setDrawRange(0, n);
    this.arc.computeLineDistances();
    this.arc.visible = true;
    this.ring.position.copy(this.arcPoints[n - 1]);
    this.ring.position.y += 0.03;
    this.ring.visible = true;
  }

  clear() {
    for (const b of this.blasts) {
      b.t = -1;
      b.flash.visible = b.smoke.visible = false;
    }
  }

  /** Per rendered frame. */
  update(dt) {
    this.sim.items.forEach((g, i) => {
      const m = this.meshes[i];
      m.visible = g.live;
      if (!g.live) return;
      m.position.copy(g.position);
      m.rotation.set(g.spin, g.spin * 0.7, 0);
    });
    for (const b of this.blasts) {
      if (b.t < 0) continue;
      b.t += dt;
      const f = Math.max(0, 1 - b.t / 0.25);
      b.flash.material.opacity = f;
      const k = b.size ?? 1;
      const fs = (1.5 + b.t * 14) * k;
      b.flash.scale.set(fs, fs, 1);
      b.flash.visible = f > 0;
      // Thick for a moment, then thinning out.
      const s = b.t < 1.2 ? 1 : Math.max(0, 1 - (b.t - 1.2) / 2.3);
      b.smoke.material.opacity = 0.95 * s;
      const ss = (2 + Math.min(1, b.t / 0.8) * 4.5) * k;
      b.smoke.scale.set(ss, ss, 1);
      b.smoke.position.set(b.pos.x, b.pos.y + 0.6 * k + b.t * 0.5, b.pos.z);
      if (b.t > 3.5) {
        b.t = -1;
        b.flash.visible = b.smoke.visible = false;
      }
    }
  }
}
