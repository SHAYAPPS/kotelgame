import {
  CanvasTexture,
  InstancedMesh,
  MathUtils,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Vector3,
} from 'three/webgpu';
import { Particles } from '../world/Particles.js';

const MAX_DECALS = 160;
const MAX_SPARKS = 400;
const MAX_DUST = 160;
const MAX_SCORCH = 16;
const GRAVITY = 9.8;

const _z = new Vector3(0, 0, 1);
const _q = new Quaternion();
const _roll = new Quaternion();
const _pos = new Vector3();
const _scale = new Vector3();
const _m = new Matrix4();
const _reflect = new Vector3();

function canvasTexture(size, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

// Bullet hole: dark core, rough scorched rim, fades out at the edge.
function holeTexture() {
  return canvasTexture(64, (ctx, s) => {
    const c = s / 2;
    const g = ctx.createRadialGradient(c, c, 0, c, c, c);
    g.addColorStop(0, 'rgba(10,9,8,1)');
    g.addColorStop(0.22, 'rgba(18,16,14,0.95)');
    g.addColorStop(0.45, 'rgba(40,36,32,0.55)');
    g.addColorStop(1, 'rgba(60,55,50,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const r = c * (0.75 + Math.random() * 0.25);
      ctx.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
  });
}

// Explosion scorch: a sooty blotch with a ragged edge.
function scorchTexture() {
  return canvasTexture(128, (ctx, s) => {
    const c = s / 2;
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * c * 0.45;
      const x = c + Math.cos(a) * r;
      const y = c + Math.sin(a) * r;
      const rr = c * (0.25 + Math.random() * 0.4);
      const g = ctx.createRadialGradient(x, y, 0, x, y, rr);
      g.addColorStop(0, 'rgba(12,10,9,0.55)');
      g.addColorStop(1, 'rgba(20,17,15,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
    }
  });
}

function dotTexture() {
  return canvasTexture(32, (ctx, s) => {
    const c = s / 2;
    const g = ctx.createRadialGradient(c, c, 0, c, c, c);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.8)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
}

/**
 * Bullet impact effects in the world: pooled bullet-hole decals (one instanced draw
 * call, oldest reused first) and pooled spark particles (one draw call).
 */
export class Impacts {
  constructor(scene) {
    this.decals = new InstancedMesh(
      new PlaneGeometry(0.075, 0.075),
      new MeshBasicMaterial({
        map: holeTexture(),
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
      }),
      MAX_DECALS,
    );
    this.decals.count = 0;
    this.decals.frustumCulled = false;
    this.decals.renderOrder = 1;
    this._nextDecal = 0;
    scene.add(this.decals);

    // Sparks (and blood, debris): additive dots on a ballistic arc.
    this.sparks = new Particles(scene, { max: MAX_SPARKS, map: typeof document !== 'undefined' ? dotTexture() : null, additive: true, name: 'sparks' });
    this.sparkPos = this.sparks.pos;
    this.sparkVel = new Float32Array(MAX_SPARKS * 3);
    this.sparkLife = new Float32Array(MAX_SPARKS);
    this.sparkMaxLife = new Float32Array(MAX_SPARKS).fill(1);
    this.sparkBase = new Float32Array(MAX_SPARKS * 3); // per-particle color (sparks vs blood)
    this.sparkGravity = new Float32Array(MAX_SPARKS);
    this._nextSpark = 0;
    this._alive = 0;

    // Stone dust: soft puffs that billow out of each hit and settle, lit by whatever lights
    // the air there (floodlights, flashes), fading into the surfaces they touch.
    this.dust = new Particles(scene, { max: MAX_DUST, lit: true, soft: 0.25, name: 'dust' });
    this.dustPos = this.dust.pos;
    this.dustVel = new Float32Array(MAX_DUST * 3);
    this.dustSize = this.dust.size;
    this.dustLife = new Float32Array(MAX_DUST);
    this.dustMaxLife = new Float32Array(MAX_DUST).fill(1);
    this._nextDust = 0;
    this._dustAlive = 0;

    // Scorch marks from explosions (ground decals, oldest reused).
    this.scorches = new InstancedMesh(
      new PlaneGeometry(1, 1),
      new MeshBasicMaterial({ map: scorchTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
      MAX_SCORCH,
    );
    this.scorches.count = 0;
    this.scorches.frustumCulled = false;
    this.scorches.renderOrder = 1;
    this._nextScorch = 0;
    scene.add(this.scorches);
  }

  /** A puff of stone dust where a bullet hit (or a heavier one for bigger hits). */
  puff(point, normal, amount = 1) {
    const n = Math.round(3 + amount * 3);
    for (let k = 0; k < n; k++) {
      const i = this._nextDust;
      this._nextDust = (this._nextDust + 1) % MAX_DUST;
      const o = i * 3;
      const sp = (0.4 + Math.random() * 1.2) * amount;
      this.dustPos[o] = point.x + normal.x * 0.05;
      this.dustPos[o + 1] = point.y + normal.y * 0.05;
      this.dustPos[o + 2] = point.z + normal.z * 0.05;
      this.dustVel[o] = normal.x * sp + (Math.random() - 0.5) * 0.6;
      this.dustVel[o + 1] = normal.y * sp + (Math.random() - 0.2) * 0.5;
      this.dustVel[o + 2] = normal.z * sp + (Math.random() - 0.5) * 0.6;
      const life = 0.7 + Math.random() * 0.9;
      this.dustLife[i] = life;
      this.dustMaxLife[i] = life;
      this.dustSize[i] = 0.06 * amount;
    }
    this._dustAlive = MAX_DUST;
  }

  /** A scorch mark on the ground (or wall) under an explosion. */
  scorch(point, normal, size) {
    _q.setFromUnitVectors(_z, normal);
    _roll.setFromAxisAngle(_z, Math.random() * Math.PI * 2);
    _q.multiply(_roll);
    _pos.copy(point).addScaledVector(normal, 0.01);
    _scale.set(size, size, 1);
    _m.compose(_pos, _q, _scale);
    this.scorches.setMatrixAt(this._nextScorch, _m);
    this._nextScorch = (this._nextScorch + 1) % MAX_SCORCH;
    this.scorches.count = Math.min(this.scorches.count + 1, MAX_SCORCH);
    this.scorches.instanceMatrix.needsUpdate = true;
  }

  /**
   * @param {Vector3} point hit point
   * @param {Vector3} normal surface normal (unit)
   * @param {Vector3} dir bullet direction (unit)
   */
  add(point, normal, dir) {
    // Decal: flat on the surface, random roll and size, nudged off the surface.
    _q.setFromUnitVectors(_z, normal);
    _roll.setFromAxisAngle(_z, Math.random() * Math.PI * 2);
    _q.multiply(_roll);
    _pos.copy(point).addScaledVector(normal, 0.003);
    _scale.setScalar(0.75 + Math.random() * 0.5);
    _m.compose(_pos, _q, _scale);
    this.decals.setMatrixAt(this._nextDecal, _m);
    this._nextDecal = (this._nextDecal + 1) % MAX_DECALS;
    this.decals.count = Math.min(this.decals.count + 1, MAX_DECALS);
    this.decals.instanceMatrix.needsUpdate = true;

    this.puff(point, normal, 1);
    // Sparks: mostly along the ricochet direction (stone throws few).
    _reflect.copy(dir).reflect(normal);
    const n = 3 + Math.floor(Math.random() * 4);
    for (let k = 0; k < n; k++) {
      const i = this._nextSpark;
      this._nextSpark = (this._nextSpark + 1) % MAX_SPARKS;
      const o = i * 3;
      const speed = 1.5 + Math.random() * 4.5;
      const vx = _reflect.x + (Math.random() - 0.5) * 1.4 + normal.x * 0.5;
      const vy = _reflect.y + (Math.random() - 0.5) * 1.4 + normal.y * 0.5;
      const vz = _reflect.z + (Math.random() - 0.5) * 1.4 + normal.z * 0.5;
      const len = Math.hypot(vx, vy, vz) || 1;
      this.sparkVel[o] = (vx / len) * speed;
      this.sparkVel[o + 1] = (vy / len) * speed;
      this.sparkVel[o + 2] = (vz / len) * speed;
      this.sparkPos[o] = point.x + normal.x * 0.01;
      this.sparkPos[o + 1] = point.y + normal.y * 0.01;
      this.sparkPos[o + 2] = point.z + normal.z * 0.01;
      const life = 0.12 + Math.random() * 0.3;
      this.sparkLife[i] = life;
      this.sparkMaxLife[i] = life;
      this.sparkBase[o] = -1; // spark palette
      this.sparkGravity[i] = GRAVITY;
    }
    this._alive = MAX_SPARKS; // update() recounts
  }

  /**
   * A burst of colored particles with no decal (e.g. hits on a body).
   * @param {Vector3} point @param {Vector3} dir incoming direction @param {number[]} rgb 0..1
   */
  burst(point, dir, rgb = [0.55, 0.02, 0.02], count = 14) {
    for (let k = 0; k < count; k++) {
      const i = this._nextSpark;
      this._nextSpark = (this._nextSpark + 1) % MAX_SPARKS;
      const o = i * 3;
      const speed = 0.8 + Math.random() * 2.5;
      // Mostly out of the exit side, some back toward the shooter.
      const s = Math.random() < 0.7 ? 1 : -0.6;
      const vx = dir.x * s + (Math.random() - 0.5) * 1.2;
      const vy = dir.y * s + (Math.random() - 0.2) * 1.2;
      const vz = dir.z * s + (Math.random() - 0.5) * 1.2;
      const len = Math.hypot(vx, vy, vz) || 1;
      this.sparkVel[o] = (vx / len) * speed;
      this.sparkVel[o + 1] = (vy / len) * speed;
      this.sparkVel[o + 2] = (vz / len) * speed;
      this.sparkPos[o] = point.x;
      this.sparkPos[o + 1] = point.y;
      this.sparkPos[o + 2] = point.z;
      const life = 0.25 + Math.random() * 0.35;
      this.sparkLife[i] = life;
      this.sparkMaxLife[i] = life;
      this.sparkBase[o] = rgb[0];
      this.sparkBase[o + 1] = rgb[1];
      this.sparkBase[o + 2] = rgb[2];
      this.sparkGravity[i] = GRAVITY * 0.8;
    }
    this._alive = MAX_SPARKS;
  }

  /** Remove every bullet hole and spark (restart / checkpoint). */
  clear() {
    this.decals.count = 0;
    this._nextDecal = 0;
    this.scorches.count = 0;
    this._nextScorch = 0;
    this.dustLife.fill(0);
    this.dust.clear();
    this._dustAlive = 0;
    this.sparkLife.fill(0);
    this.sparks.clear();
    this._alive = 0;
  }

  _updateDust(dt) {
    if (this._dustAlive === 0) return;
    let alive = 0;
    const drag = Math.exp(-3 * dt);
    const col = this.dust.color;
    for (let i = 0; i < MAX_DUST; i++) {
      if (this.dustLife[i] <= 0) {
        col[i * 4 + 3] = 0;
        continue;
      }
      alive++;
      const o = i * 3;
      this.dustLife[i] -= dt;
      this.dustVel[o] *= drag;
      this.dustVel[o + 1] = this.dustVel[o + 1] * drag - 0.25 * dt;
      this.dustVel[o + 2] *= drag;
      this.dustPos[o] += this.dustVel[o] * dt;
      this.dustPos[o + 1] += this.dustVel[o + 1] * dt;
      this.dustPos[o + 2] += this.dustVel[o + 2] * dt;
      const f = Math.max(0, this.dustLife[i] / this.dustMaxLife[i]);
      this.dustSize[i] += dt * 0.35; // billows out
      col[i * 4] = 0.78;
      col[i * 4 + 1] = 0.72;
      col[i * 4 + 2] = 0.62;
      col[i * 4 + 3] = 0.55 * f * Math.min(1, (1 - f) * 8 + 0.3);
    }
    this._dustAlive = alive;
    this.dust.commit();
  }

  update(dt) {
    this._updateDust(dt);
    if (this._alive === 0) return;
    let alive = 0;
    const col = this.sparks.color;
    const size = this.sparks.size;
    for (let i = 0; i < MAX_SPARKS; i++) {
      const o = i * 3;
      const c = i * 4;
      if (this.sparkLife[i] <= 0) {
        col[c + 3] = 0;
        size[i] = 0;
        continue;
      }
      alive++;
      this.sparkLife[i] -= dt;
      this.sparkVel[o + 1] -= this.sparkGravity[i] * dt;
      this.sparkPos[o] += this.sparkVel[o] * dt;
      this.sparkPos[o + 1] += this.sparkVel[o + 1] * dt;
      this.sparkPos[o + 2] += this.sparkVel[o + 2] * dt;
      // Additive blending: fading the color to black fades the spark out.
      const f = MathUtils.clamp(this.sparkLife[i] / this.sparkMaxLife[i], 0, 1);
      if (this.sparkBase[o] < 0) {
        // Hot sparks: brighter than white (they bloom), cooling to orange.
        col[c] = (1.0 * f + 0.2) * 3;
        col[c + 1] = (0.75 * f * f + 0.05) * 3;
        col[c + 2] = 0.35 * f * f * f * 3;
        size[i] = 0.045;
      } else {
        const g = Math.min(1, f * 1.5);
        col[c] = this.sparkBase[o] * g;
        col[c + 1] = this.sparkBase[o + 1] * g;
        col[c + 2] = this.sparkBase[o + 2] * g;
        size[i] = 0.05;
      }
      col[c + 3] = this.sparkLife[i] > 0 ? 1 : 0;
    }
    this._alive = alive;
    this.sparks.commit();
  }
}
