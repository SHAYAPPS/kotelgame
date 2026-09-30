import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CapsuleGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  LineBasicMaterial,
  LineSegments,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  CanvasTexture,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { ENEMY } from './config.js';
import { characters } from '../characters/registry.js';
import { StairTracker } from '../player/StairTracker.js';

let shared = null;
function assets() {
  if (shared) return shared;
  const c = ENEMY;
  const bodyLen = c.headHeight - c.headRadius - 0.04 - 2 * c.radius;
  shared = {
    body: new CapsuleGeometry(c.radius, bodyLen, 4, 10).translate(0, c.radius + bodyLen / 2, 0),
    head: new SphereGeometry(c.headRadius, 14, 10),
    band: new CylinderGeometry(c.headRadius * 1.03, c.headRadius * 1.03, 0.045, 14),
    vest: new BoxGeometry(0.5, 0.42, 0.36).translate(0, 1.2, 0),
    gun: new BoxGeometry(0.06, 0.09, 0.8),
    flash: new PlaneGeometry(0.3, 0.3),
    clothes: new MeshStandardMaterial({ color: 0x33352f, roughness: 0.95 }),
    vestMat: new MeshStandardMaterial({ color: 0x4a4636, roughness: 0.9 }),
    skin: new MeshStandardMaterial({ color: 0xa47a5a, roughness: 0.8 }),
    bandMat: new MeshStandardMaterial({ color: 0x2f6e35, roughness: 0.9 }),
    gunMat: new MeshStandardMaterial({ color: 0x2a2b2d, roughness: 0.6, metalness: 0.2 }),
    flashMat: new MeshBasicMaterial({
      color: 0xffc87a,
      transparent: true,
      opacity: 0.95,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
      toneMapped: false,
    }),
  };
  shared.flashMat.color.multiplyScalar(5); // HDR: blooms
  return shared;
}

const _axis = new Vector3();
const bandMats = new Map(); // role band colors

function bandMaterial(color) {
  if (!bandMats.has(color)) bandMats.set(color, new MeshStandardMaterial({ color, roughness: 0.9 }));
  return bandMats.get(color);
}

let glintMat = null;
function glintMaterial() {
  if (glintMat) return glintMat;
  if (typeof document === 'undefined') return (glintMat = new SpriteMaterial()); // tests (no DOM)
  // A four-point star flare.
  const size = 64;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.15, 'rgba(255,250,220,0.8)');
  grad.addColorStop(1, 'rgba(255,240,200,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  g.fillStyle = 'rgba(255,255,240,0.9)';
  g.fillRect(0, 30, size, 4);
  g.fillRect(30, 0, 4, size);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  glintMat = new SpriteMaterial({ map: tex, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false, fog: false });
  return glintMat;
}
const UP = new Vector3(0, 1, 0);

/** Placeholder soldier: capsule body with a separate head, a vest and a rifle (used until
 * the animated characters load, if they fail to, and in tests). */
class PlaceholderSoldier {
  constructor(enemy, root) {
    const a = assets();
    const c = ENEMY;
    this.enemy = enemy;
    this.root = new Group();
    root.add(this.root);
    this.tilt = new Group(); // falls over on death
    this.yaw = new Group(); // faces where he looks
    this.root.add(this.tilt);
    this.tilt.add(this.yaw);

    this.torso = new Group(); // scaled down when crouched
    this.body = new Mesh(a.body, a.clothes);
    this.vest = new Mesh(a.vest, a.vestMat);
    this.torso.add(this.body, this.vest);
    this.head = new Mesh(a.head, a.skin);
    this.band = new Mesh(a.band, enemy.cfg.bandColor ? bandMaterial(enemy.cfg.bandColor) : a.bandMat);
    this.band.position.y = 0.03;
    this.head.add(this.band);
    this.gun = new Mesh(a.gun, a.gunMat);
    this.flash = new Mesh(a.flash, a.flashMat);
    this.flash.position.set(0, 0, -0.5);
    this.flash.visible = false;
    this.gun.add(this.flash);
    this.yaw.add(this.torso, this.head, this.gun);
    for (const m of [this.body, this.vest, this.head, this.band, this.gun]) m.castShadow = true;

    this.headY = c.headHeight;
    this.fall = 0;
    this.flashTimer = 0;
    this._shots = enemy.shotsFired;
  }

  update(dt) {
    const e = this.enemy;
    const c = ENEMY;
    this.yaw.rotation.y = e.facing;

    // Crouch: squash the torso and lower the head smoothly.
    const targetHead = e.crouched ? c.crouchHeadHeight : c.headHeight;
    this.headY = MathUtils.damp(this.headY, targetHead, 14, dt);
    const s = (this.headY - c.headRadius) / (c.headHeight - c.headRadius);
    this.torso.scale.y = s;
    this.head.position.y = this.headY;
    // Rifle at the shoulder, pointing where he looks.
    this.gun.position.set(0.16, this.headY - 0.28, -0.35);

    if (e.shotsFired !== this._shots) {
      this._shots = e.shotsFired;
      this.flashTimer = 0.05;
      this.flash.rotation.z = Math.random() * Math.PI;
    }
    this.flash.visible = this.flashTimer > 0;
    this.flashTimer = Math.max(0, this.flashTimer - dt);

    if (!e.alive) {
      // Fall over away from the killing shot, accelerating like a dropped body, then stay down.
      this.fall = Math.min(1, this.fall + dt / 0.7);
      const t = this.fall * this.fall;
      _axis.crossVectors(UP, e.deathDir).normalize();
      if (_axis.lengthSq() < 0.5) _axis.set(1, 0, 0);
      this.tilt.quaternion.setFromAxisAngle(_axis, t * (Math.PI / 2 - 0.08));
      this.gun.visible = this.fall < 0.3;
      this.flash.visible = false;
    }
  }

  dispose() {
    this.root.removeFromParent();
  }
}

let spawnCount = 0;
const DEFAULT_BAND = 0x2f6e35;

/**
 * An enemy soldier: the animated character (dark clothes, covered face, a headband in his
 * role's color, AK rifle) driven by SoldierAnimator from the AI state; a placeholder until
 * the characters have loaded. Hit zones follow the model (enemy.hitShape).
 */
export class EnemyView {
  /** @param {import('./Enemy.js').Enemy} enemy @param {{ world?: object }} opts collision (deaths avoid walls) */
  constructor(enemy, { world = null } = {}) {
    this.enemy = enemy;
    this.world = world;
    this.index = spawnCount++;
    this.root = new Group(); // at the feet
    this.model = null;
    this.animator = null;
    this.placeholder = null;
    this.state = {
      alive: true, facing: 0, velocity: null, crouched: false, posture: 'alert', mode: 'idle', cover: null,
      aimAt: new Vector3(), eyeY: ENEMY.eyeHeight, shotsFired: 0, health: 0, throws: 0, deathDir: null, hitZone: null, position: null,
      stairs: 0, stairDir: 1,
    };
    this.stairs = new StairTracker();
    if (!this._build()) this.placeholder = new PlaceholderSoldier(enemy, this.root);

    if (enemy.cfg.marksman) {
      this.glint = new Sprite(glintMaterial());
      this.glint.visible = false;
      this.root.add(this.glint);
    }
    this.headY = ENEMY.headHeight;
  }

  /** The animated character, once the library is ready. */
  _build() {
    const lib = characters.library;
    if (!lib?.ready) return false;
    const ids = lib.ids('enemy');
    if (!ids.length) return false;
    const e = this.enemy;
    const id = ids[this.index % ids.length];
    ({ model: this.model, animator: this.animator } = lib.soldier(id, { variant: this.index, band: e.cfg.bandColor ?? DEFAULT_BAND, world: this.world }));
    this.root.add(this.model.root);
    e.hitShape = this.model.hit;
    if (this.placeholder) {
      this.placeholder.dispose();
      this.placeholder = null;
    }
    return true;
  }

  update(dt) {
    const e = this.enemy;
    this.root.position.copy(e.position);
    if (!this.model && characters.library?.ready) this._build();
    if (this.model) {
      // Stairs: smooth climb, stair legs, feet on the steps near the camera (see NpcView).
      const st = this.stairs.update(dt, e.position.y, e.body.grounded && e.alive, e.body.horizontalSpeed);
      if (e.alive) this.model.body.position.y = st.offset; // a body stays where it fell
      this.model.world = this.world;
      this.model.feetWeight = e.alive ? st.amount : 0;
      this.state.stairs = e.alive ? st.amount : 0;
      this.state.stairDir = st.dir;
      this.animator.update(dt, soldierState(e, this.state));
      this.model.update(dt, characters);
      e.visualMuzzle = this.model.muzzleWorld(e.visualMuzzle ?? new Vector3());
      this.headY = this.model.hit.valid ? this.model.hit.head.y : this.headY;
    } else {
      this.placeholder.update(dt);
      this.headY = this.placeholder.headY;
    }

    if (this.glint) {
      // Scope glint toward the player while he lines up a shot; big enough to spot far off.
      const on = e.alive && e.glint > 0;
      this.glint.visible = on;
      if (on) {
        const t = e.target?.position ?? e.lastKnown;
        const d = Math.max(5, Math.hypot(t.x - e.position.x, t.z - e.position.z));
        const tw = 0.75 + 0.25 * Math.sin(e.time * 17);
        const size = (0.3 + d * 0.034) * e.glint * tw;
        this.glint.scale.set(size, size, 1);
        const s = Math.sin(e.facing);
        const co = Math.cos(e.facing);
        this.glint.position.set(-s * 0.45 + co * 0.1, this.headY - 0.03, -co * 0.45 - s * 0.1);
      }
    }
  }

  dispose() {
    if (this.model) this.model.dispose();
    this.root.removeFromParent();
  }
}

/**
 * What SoldierAnimator needs from a combat agent (ai/Enemy.js), written into `out`.
 * @param {object} [overrides] e.g. { posture: 'relaxed' } for a squad member off duty
 */
export function soldierState(e, out) {
  const c = e.cfg;
  out.alive = e.alive;
  out.facing = e.facing;
  out.velocity = e.body.velocity;
  out.crouched = e.crouched;
  out.posture = e.state === 'combat' ? 'combat' : 'alert';
  out.mode = e.state === 'combat' ? e.mode : e.state;
  out.cover = e.coverPoint;
  const t = e.target;
  if (t && t.alive && t.chest) out.aimAt = t.chest;
  else if (e.hasLastKnown) out.aimAt = _aim.set(e.lastKnown.x, e.lastKnown.y + 1.2, e.lastKnown.z);
  else out.aimAt = null;
  out.eyeY = e.crouched ? c.crouchEyeHeight : c.eyeHeight;
  out.shotsFired = e.shotsFired;
  out.health = e.health;
  out.throws = e.throws ?? 0;
  out.deathDir = e.deathDir;
  out.hitZone = e.lastHitZone;
  out.position = e.position;
  return out;
}
const _aim = new Vector3();

/** Bullet tracers: short bright streaks that fly along each enemy shot. */
export class Tracers {
  constructor(scene, count = 48) {
    this.count = count;
    this.pos = new Float32Array(count * 6);
    this.col = new Float32Array(count * 6);
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new BufferAttribute(this.col, 3));
    this.lines = new LineSegments(
      geo,
      new LineBasicMaterial({ vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }),
    );
    this.lines.material.color.setScalar(3.5); // HDR: tracer heads bloom
    this.lines.frustumCulled = false;
    scene.add(this.lines);
    this.items = Array.from({ length: count }, () => ({ o: new Vector3(), d: new Vector3(), len: 0, t: -1 }));
    this.next = 0;
    this.speed = 420; // m/s (slowed down from real so the eye can follow it)
    this.streak = 6;
  }

  add(origin, dir, distance) {
    const it = this.items[this.next];
    this.next = (this.next + 1) % this.count;
    it.o.copy(origin);
    it.d.copy(dir);
    it.len = distance;
    it.t = 0;
  }

  /** Drop every tracer in flight. */
  clear() {
    for (const it of this.items) it.t = -1;
    this.col.fill(0);
    this.lines.geometry.attributes.color.needsUpdate = true;
  }

  update(dt) {
    for (let i = 0; i < this.count; i++) {
      const it = this.items[i];
      const o = i * 6;
      if (it.t < 0) {
        this.col.fill(0, o, o + 6);
        continue;
      }
      it.t += dt;
      const head = Math.min(it.len, it.t * this.speed);
      const tail = Math.max(0, head - this.streak);
      if (tail >= it.len) {
        it.t = -1;
        this.col.fill(0, o, o + 6);
        continue;
      }
      this.pos[o] = it.o.x + it.d.x * tail;
      this.pos[o + 1] = it.o.y + it.d.y * tail;
      this.pos[o + 2] = it.o.z + it.d.z * tail;
      this.pos[o + 3] = it.o.x + it.d.x * head;
      this.pos[o + 4] = it.o.y + it.d.y * head;
      this.pos[o + 5] = it.o.z + it.d.z * head;
      // Dim tail, bright head.
      const c = this.col;
      c[o] = 0.25;
      c[o + 1] = 0.18;
      c[o + 2] = 0.05;
      c[o + 3] = 1.0;
      c[o + 4] = 0.85;
      c[o + 5] = 0.45;
    }
    this.lines.geometry.attributes.position.needsUpdate = true;
    this.lines.geometry.attributes.color.needsUpdate = true;
  }
}
