import {
  CanvasTexture,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SRGBColorSpace,
  Vector3,
} from 'three/webgpu';
import { Particles } from '../world/Particles.js';

// Rockets from the shoulder launcher. RocketSim is the flight (pure, unit-tested): a
// fast projectile with a slight drop that stops at the first thing it hits (the world
// or a target such as the truck) and reports `onImpact`. RocketView draws the rockets
// and their smoke trails.

const MAX = 6;
const _dir = new Vector3();
const _hit = { point: new Vector3(), normal: new Vector3(), distance: 0 };

export class RocketSim {
  /**
   * @param {import('../world/CollisionWorld.js').CollisionWorld} world
   * @param {{ gravity: number, maxFlight: number }} config
   */
  constructor(world, config) {
    this.world = world;
    this.cfg = config;
    this.items = Array.from({ length: MAX }, () => ({
      live: false,
      position: new Vector3(),
      velocity: new Vector3(),
      time: 0,
    }));
    /** raycast(origin, dir, maxDist) -> { distance, ... } | null: things it can hit besides the world */
    this.targets = null;
    /** (rocket, point: Vector3, normal: Vector3 | null, target | null) => void */
    this.onImpact = null;
  }

  get live() {
    return this.items.filter((r) => r.live);
  }

  clear() {
    for (const r of this.items) r.live = false;
  }

  spawn(position, direction, speed) {
    const r = this.items.find((x) => !x.live);
    if (!r) return null;
    r.live = true;
    r.position.copy(position);
    r.velocity.copy(direction).normalize().multiplyScalar(speed);
    r.time = 0;
    return r;
  }

  update(dt) {
    for (const r of this.items) {
      if (!r.live) continue;
      r.time += dt;
      r.velocity.y -= this.cfg.gravity * dt;
      const len = r.velocity.length() * dt;
      _dir.copy(r.velocity).normalize();
      const wall = this.world.raycast(r.position, _dir, len, _hit);
      const maxD = wall ? wall.distance : len;
      const t = this.targets ? this.targets.raycast(r.position, _dir, maxD) : null;
      if (t) {
        r.live = false;
        const p = r.position.clone().addScaledVector(_dir, t.distance);
        if (this.onImpact) this.onImpact(r, p, null, t);
      } else if (wall) {
        r.live = false;
        if (this.onImpact) this.onImpact(r, wall.point.clone(), wall.normal.clone(), null);
      } else if (r.time > this.cfg.maxFlight) {
        r.live = false;
        if (this.onImpact) this.onImpact(r, r.position.clone(), null, null);
      } else {
        r.position.addScaledVector(r.velocity, dt);
      }
    }
  }
}

function puffTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

const TRAIL = 220;

/** Rocket bodies, their motor glow and a fading smoke trail (one Points cloud). */
export class RocketView {
  constructor(scene, sim) {
    this.sim = sim;
    this.root = new Group();
    scene.add(this.root);
    const body = new CylinderGeometry(0.04, 0.04, 0.5, 8).rotateX(Math.PI / 2);
    const nose = new ConeGeometry(0.05, 0.22, 8).rotateX(-Math.PI / 2).translate(0, 0, -0.36);
    const mat = new MeshStandardMaterial({ color: 0x4f5a3a, roughness: 0.6 });
    const glowMat = new MeshBasicMaterial({ color: 0xffc070, toneMapped: false });
    glowMat.color.multiplyScalar(6); // HDR: the motor glows
    this.meshes = sim.items.map(() => {
      const g = new Group();
      g.add(new Mesh(body, mat), new Mesh(nose, mat));
      const glow = new Mesh(new CylinderGeometry(0.03, 0.06, 0.12, 8).rotateX(Math.PI / 2).translate(0, 0, 0.3), glowMat);
      g.add(glow);
      g.visible = false;
      this.root.add(g);
      return g;
    });
    // The smoke trail: grey puffs lit by the night (and the motor's own flash), soft.
    this.trail = new Particles(this.root, { max: TRAIL, map: typeof document !== 'undefined' ? puffTexture() : null, lit: true, soft: 0.5, name: 'rocket-smoke' });
    this.pos = this.trail.pos;
    this.life = new Float32Array(TRAIL);
    this._next = 0;
    this._emit = 0;
  }

  clear() {
    this.life.fill(0);
    this.pos.fill(0);
    this.trail.clear();
  }

  update(dt) {
    this._emit += dt;
    const emit = this._emit >= 0.012;
    if (emit) this._emit = 0;
    this.sim.items.forEach((r, i) => {
      const m = this.meshes[i];
      m.visible = r.live;
      if (!r.live) return;
      m.position.copy(r.position);
      m.lookAt(_dir.copy(r.position).sub(r.velocity));
      if (emit) {
        const k = this._next;
        this._next = (this._next + 1) % TRAIL;
        this.pos[k * 3] = r.position.x + (Math.random() - 0.5) * 0.1;
        this.pos[k * 3 + 1] = r.position.y + (Math.random() - 0.5) * 0.1;
        this.pos[k * 3 + 2] = r.position.z + (Math.random() - 0.5) * 0.1;
        this.life[k] = 1;
      }
    });
    // Smoke puffs: fading and rising a little.
    const col = this.trail.color;
    const size = this.trail.size;
    for (let k = 0; k < TRAIL; k++) {
      if (this.life[k] <= 0) {
        col[k * 4 + 3] = 0;
        continue;
      }
      this.life[k] = Math.max(0, this.life[k] - dt / 2.2);
      const f = this.life[k];
      col[k * 4] = col[k * 4 + 1] = col[k * 4 + 2] = 0.62;
      col[k * 4 + 3] = 0.5 * f * f;
      size[k] = 0.5 + (1 - f) * 1.6; // spreading out
      this.pos[k * 3 + 1] += dt * 0.3;
    }
    this.trail.commit();
  }
}

