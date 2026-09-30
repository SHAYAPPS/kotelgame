import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  InstancedMesh,
  MathUtils,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Quaternion,
  SRGBColorSpace,
  Vector3,
} from 'three';

const MAX_DECALS = 160;
const MAX_SPARKS = 400;
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

    const geo = new BufferGeometry();
    this.sparkPos = new Float32Array(MAX_SPARKS * 3);
    this.sparkCol = new Float32Array(MAX_SPARKS * 3);
    geo.setAttribute('position', new BufferAttribute(this.sparkPos, 3));
    geo.setAttribute('color', new BufferAttribute(this.sparkCol, 3));
    this.sparkVel = new Float32Array(MAX_SPARKS * 3);
    this.sparkLife = new Float32Array(MAX_SPARKS);
    this.sparkMaxLife = new Float32Array(MAX_SPARKS).fill(1);
    this.sparks = new Points(
      geo,
      new PointsMaterial({
        size: 0.035,
        map: dotTexture(),
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        toneMapped: false,
      }),
    );
    this.sparks.frustumCulled = false;
    this._nextSpark = 0;
    this._alive = 0;
    scene.add(this.sparks);
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

    // Sparks: mostly along the ricochet direction.
    _reflect.copy(dir).reflect(normal);
    const n = 7 + Math.floor(Math.random() * 6);
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
    }
    this._alive = MAX_SPARKS; // update() recounts
  }

  update(dt) {
    if (this._alive === 0) return;
    let alive = 0;
    for (let i = 0; i < MAX_SPARKS; i++) {
      const o = i * 3;
      if (this.sparkLife[i] <= 0) {
        this.sparkCol[o] = this.sparkCol[o + 1] = this.sparkCol[o + 2] = 0;
        continue;
      }
      alive++;
      this.sparkLife[i] -= dt;
      this.sparkVel[o + 1] -= GRAVITY * dt;
      this.sparkPos[o] += this.sparkVel[o] * dt;
      this.sparkPos[o + 1] += this.sparkVel[o + 1] * dt;
      this.sparkPos[o + 2] += this.sparkVel[o + 2] * dt;
      // Additive blending: fading the color to black fades the spark out.
      const f = MathUtils.clamp(this.sparkLife[i] / this.sparkMaxLife[i], 0, 1);
      this.sparkCol[o] = 1.0 * f + 0.2;
      this.sparkCol[o + 1] = 0.75 * f * f + 0.05;
      this.sparkCol[o + 2] = 0.35 * f * f * f;
      if (this.sparkLife[i] <= 0) this.sparkCol[o] = this.sparkCol[o + 1] = this.sparkCol[o + 2] = 0;
    }
    this._alive = alive;
    this.sparks.geometry.attributes.position.needsUpdate = true;
    this.sparks.geometry.attributes.color.needsUpdate = true;
  }
}
