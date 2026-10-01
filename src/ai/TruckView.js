import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  CapsuleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  MeshStandardNodeMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Matrix4,
} from 'three/webgpu';
import { Fn, clamp, float, floor, fract, materialColor, materialRoughness, max, mix, positionWorld, uniform, vec3, vec4 } from 'three/tsl';
import { TRUCK_GUN } from './Truck.js';
import { characters } from '../characters/registry.js';
import { models } from '../core/Models.js';
import { litSmokeMaterial } from '../world/Particles.js';

export const TRUCK_MODEL = 'assets/weapons/truck.glb';

function sprite(stops) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  for (const [t, col] of stops) grad.addColorStop(t, col);
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

let shared = null;
function assets() {
  if (shared) return shared;
  shared = {
    paint: new MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.6 }),
    dark: new MeshStandardMaterial({ color: 0x2a2c2e, roughness: 0.8 }),
    glass: new MeshStandardMaterial({ color: 0x1d2630, roughness: 0.2, metalness: 0.1 }),
    tire: new MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.95 }),
    gun: new MeshStandardMaterial({ color: 0x2f3134, roughness: 0.5, metalness: 0.25 }),
    shield: new MeshStandardMaterial({ color: 0x5a5d4c, roughness: 0.7 }),
    clothes: new MeshStandardMaterial({ color: 0x33352f, roughness: 0.95 }),
    skin: new MeshStandardMaterial({ color: 0xa47a5a, roughness: 0.8 }),
    charred: new MeshStandardMaterial({ color: 0x1e1c1a, roughness: 1 }),
    flash: new MeshBasicMaterial({ color: new Color(0xffc87a).multiplyScalar(5), transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false }),
    fireTex: sprite([[0, 'rgba(255,230,160,1)'], [0.35, 'rgba(255,130,40,0.85)'], [1, 'rgba(200,50,10,0)']]),
    smokeTex: sprite([[0, 'rgba(40,38,35,0.95)'], [0.5, 'rgba(50,48,44,0.6)'], [1, 'rgba(60,58,54,0)']]),
  };
  return shared;
}

// The pickup model's materials by role (scripts/assets/weapons.mjs names them): an off-white
// paint job under a layer of dust that thickens toward the wheels, black plastics, glass.
let looks = null;
function truckLooks() {
  if (looks) return looks;
  // (node uniforms; `.value` like the old shader's)
  const uniforms = { uInvRoot: uniform(new Matrix4()), uCharred: uniform(0) };
  const tHash = Fn(([p0]) => {
    const p = fract(p0.mul(0.3183099).add(0.1)).mul(17).toVar();
    return fract(p.x.mul(p.y).mul(p.z).mul(p.x.add(p.y).add(p.z)));
  });
  const tNoise = Fn(([x]) => {
    const i = floor(x).toVar();
    const f = fract(x).toVar();
    f.assign(f.mul(f).mul(float(3).sub(f.mul(2))));
    const h = (dx, dy, dz) => tHash(i.add(vec3(dx, dy, dz)));
    return mix(mix(mix(h(0, 0, 0), h(1, 0, 0), f.x), mix(h(0, 1, 0), h(1, 1, 0), f.x), f.y), mix(mix(h(0, 0, 1), h(1, 0, 1), f.x), mix(h(0, 1, 1), h(1, 1, 1), f.x), f.y), f.z);
  });
  // Dust thickening toward the wheels (noisy), charred black once the wreck burns.
  const dusty = (o, amount) => {
    const m = new MeshStandardNodeMaterial(o);
    const p = uniforms.uInvRoot.mul(vec4(positionWorld, 1)).xyz;
    const tn = tNoise(p.mul(3.1)).mul(0.6).add(tNoise(p.mul(13)).mul(0.4));
    const dirt = clamp(float(1.25).sub(p.y).mul(0.85).add(tn.sub(0.5).mul(0.9)), 0, 1).mul(amount);
    const dusted = mix(materialColor.rgb, vec3(0.36, 0.3, 0.23), dirt);
    m.colorNode = vec4(mix(dusted, vec3(0.02, 0.018, 0.016).mul(tn.add(0.6)), uniforms.uCharred), materialColor.a);
    m.roughnessNode = mix(materialRoughness, float(0.95), max(dirt, uniforms.uCharred));
    return m;
  };
  const std = (o) => new MeshStandardMaterial(o);
  looks = {
    uniforms,
    paint: dusty({ color: 0xd8d2c4, roughness: 0.45 }, 0.75),
    cladding: dusty({ color: 0x2c2c2b, roughness: 0.72 }, 0.6),
    trim: dusty({ color: 0x161616, roughness: 0.75 }, 0.55),
    rubber: dusty({ color: 0x141413, roughness: 0.92 }, 0.5),
    wheelwell: std({ color: 0x0f0e0d, roughness: 1 }),
    glass: dusty({ color: 0x0a0d10, roughness: 0.07, envMapIntensity: 1.6 }, 0.2),
    rim: dusty({ color: 0x8d9093, roughness: 0.42, metalness: 0.7 }, 0.45),
    hub: std({ color: 0x2b2b2b, roughness: 0.6, metalness: 0.4 }),
    lamp: std({ color: 0xd9d7cf, roughness: 0.12, metalness: 0.6 }),
    indicator: std({ color: 0xd2861c, roughness: 0.25 }),
    taillight: std({ color: 0x8c120e, roughness: 0.22 }),
    chrome: dusty({ color: 0xc8c8c8, roughness: 0.2, metalness: 1 }, 0.3),
  };
  return looks;
}

/** The armed pickup (a gunner behind a shield on the bed); a burning wreck when destroyed. Box placeholder until the model loads. */
export class TruckView {
  /** @param {import('../weapons/WeaponAudio.js').WeaponAudio} [audio] for the engine */
  constructor(truck, audio = null) {
    this.audio = audio;
    const a = assets();
    this.truck = truck;
    this.root = new Group();
    this.body = new Group();
    this.root.add(this.body);
    const box = (w, h, d, mat, x, y, z) => {
      const m = new Mesh(new BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      this.body.add(m);
      return m;
    };
    this.painted = [];
    // Chassis, cab, hood, bed walls, bumpers.
    this.painted.push(box(2.0, 0.55, 5.2, a.paint, 0, 0.75, 0));
    this.painted.push(box(1.9, 0.75, 1.7, a.paint, 0, 1.4, -1.35));
    this.painted.push(box(1.9, 0.25, 0.9, a.paint, 0, 1.15, -2.2));
    box(1.8, 0.45, 0.05, a.glass, 0, 1.5, -2.21 + 0.46); // windshield
    for (const x of [-0.97, 0.97]) {
      box(0.05, 0.4, 1.2, a.glass, x, 1.5, -1.35);
      this.painted.push(box(0.08, 0.5, 2.9, a.paint, x, 1.25, 1.1)); // bed sides
    }
    this.painted.push(box(2.0, 0.5, 0.08, a.paint, 0, 1.25, 2.56));
    box(2.1, 0.22, 0.2, a.dark, 0, 0.55, -2.65);
    box(2.1, 0.22, 0.2, a.dark, 0, 0.55, 2.65);
    const wheel = new CylinderGeometry(0.42, 0.42, 0.32, 14).rotateZ(Math.PI / 2);
    for (const [x, z] of [[-0.95, -1.7], [0.95, -1.7], [-0.95, 1.7], [0.95, 1.7]]) {
      const w = new Mesh(wheel, a.tire);
      w.position.set(x, 0.42, z);
      this.body.add(w);
    }
    // Turret: pintle, gun, shield and the gunner, turning together.
    this.turret = new Group();
    this.turret.position.set(TRUCK_GUN.x, 1.0, TRUCK_GUN.z);
    this.body.add(this.turret);
    const post = new Mesh(new CylinderGeometry(0.05, 0.06, 1.2, 8), a.gun);
    post.position.y = 0.6;
    const gunBody = new Mesh(new BoxGeometry(0.16, 0.18, 0.7), a.gun);
    gunBody.position.set(0, 1.35, -0.2);
    const barrel = new Mesh(new CylinderGeometry(0.035, 0.035, 0.8, 8).rotateX(Math.PI / 2), a.gun);
    barrel.position.set(0, 1.37, -0.9);
    const shield = new Mesh(new BoxGeometry(0.9, 0.6, 0.05), a.shield);
    shield.position.set(0, 1.35, -0.45);
    const gunner = new Mesh(new CapsuleGeometry(0.28, 0.7, 4, 8), a.clothes);
    gunner.position.set(0, 0.95, 0.35);
    const head = new Mesh(new SphereGeometry(0.13, 10, 8), a.skin);
    head.position.set(0, 1.62, 0.3);
    this.flash = new Mesh(new PlaneGeometry(0.45, 0.45), a.flash);
    this.flash.position.set(0, 1.37, -1.35);
    this.flash.visible = false;
    this.gunner = [gunner, head];
    this.turret.add(post, gunBody, barrel, shield, gunner, head, this.flash);
    for (const m of [post, gunBody, barrel, shield, gunner, head]) m.castShadow = true;

    // Fire and smoke once it's destroyed.
    this.fires = [];
    for (let i = 0; i < 4; i++) {
      const f = new Sprite(new SpriteMaterial({ map: a.fireTex, color: new Color(3, 2.6, 2.2), transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
      const s = new Sprite(litSmokeMaterial(a.smokeTex, { soft: 1 }));
      f.visible = s.visible = false;
      this.root.add(f, s);
      this.fires.push({ f, s, x: (i % 2 ? 0.5 : -0.5) * (i < 2 ? 1 : 0.6), z: i < 2 ? -1.3 : 1.2, phase: i * 1.7 });
    }
    this._shots = truck.shotsFired;
    this._flash = 0;
    this._wrecked = false;
    this.wheels = [];
    this._spin = 0;
    this._last = truck.position.clone();
    if (typeof document !== 'undefined') {
      models.load(TRUCK_MODEL).then(
        (gltf) => this._buildModel(gltf),
        (e) => console.warn('Truck model did not load; keeping the box one.', e),
      );
    }
  }

  /** The real pickup replaces the boxes (the turret, gun and gunner stay). */
  _buildModel(gltf) {
    if (this.disposed) return;
    const L = truckLooks();
    const body = gltf.scene.clone(true);
    body.traverse((o) => {
      if (!o.isMesh) return;
      o.material = L[o.material.name] ?? L.trim;
      o.castShadow = true;
      o.receiveShadow = true;
    });
    for (const name of ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr']) {
      const w = body.getObjectByName(name);
      if (w) this.wheels.push(w);
    }
    for (const child of [...this.body.children]) if (child !== this.turret) child.visible = false;
    this.body.add(body);
    this.model = body;
    this.painted = [];
  }

  /** The animated gunner (an enemy model holding the gun's grips), once loaded. */
  _buildGunner() {
    const lib = characters.library;
    const ids = lib.ids('enemy');
    if (!ids.length) return;
    const m = lib.dressed(ids[0], { band: 0x2f6e35 });
    if (m.rifle) m.rifle.root.visible = false; // hands on the mounted gun instead
    m.fade('rifle_idle_aiming', 1, 0);
    m.ikWeight = 1;
    m.root.position.set(0, 0.02, 0.42);
    this.turret.add(m.root);
    for (const g of this.gunner) g.visible = false;
    this.gunnerModel = m;
  }

  update(dt) {
    const t = this.truck;
    this.root.position.copy(t.position);
    this.root.rotation.y = t.facing;
    this.turret.rotation.y = t.turretYaw - t.facing;
    if (!this.gunnerModel && !this._wrecked && characters.library?.ready) this._buildGunner();
    if (t.shotsFired !== this._shots) {
      this._shots = t.shotsFired;
      this._flash = 0.04;
      this.flash.rotation.z = Math.random() * Math.PI;
      this.gunnerModel?.fade('rifle_fire_stand', 0.8, 0, { mode: 'addUpper', restart: true, loop: false, key: 'recoil' });
    }
    if (this.gunnerModel && !this._wrecked) this.gunnerModel.update(dt, characters);
    this.flash.visible = this._flash > 0;
    this._flash -= dt;
    // Slight body roll while driving; wheels turn with the distance covered.
    this.body.rotation.z = t.driving ? Math.sin(t.time * 9) * 0.012 : 0;
    const moved = Math.hypot(t.position.x - this._last.x, t.position.z - this._last.z);
    this._last.copy(t.position);
    if (this.model && moved > 0 && moved < 2) {
      this._spin -= moved / 0.4;
      for (const w of this.wheels) w.rotation.x = this._spin;
    }
    if (this.model) {
      const L = truckLooks();
      this.root.updateMatrixWorld();
      L.uniforms.uInvRoot.value.copy(this.root.matrixWorld).invert();
      L.uniforms.uCharred.value = this._wrecked ? Math.min(1, (t.deadTime ?? 1) * 1.5) * 0.85 : 0;
    }
    this._engine(t);
    if (!t.alive) this._wreck(dt);
  }

  /** The engine: a loop that follows the truck, revving with its speed; dies with it. */
  _engine(t) {
    const a = this.audio;
    if (!a?.ready || !a.bank?.ready) return;
    if (!this.engine && t.alive) this.engine = a.loop('truck_engine', { at: t.position, ref: 7, gain: 1.1, hrtf: true, bus: a.master, fadeIn: 0.3 });
    if (!this.engine) return;
    if (!t.alive) {
      this.engine.stop(0.4);
      this.engine = null;
      return;
    }
    this.engine.setPosition(t.position);
    this.engine.setRate(0.75 + Math.min(1, Math.abs(t.speed) / 9) * 0.55);
  }

  _wreck(dt) {
    const a = assets();
    const t = this.truck;
    if (!this._wrecked) {
      this._wrecked = true;
      for (const m of this.painted) m.material = a.charred;
      for (const m of this.gunner) m.visible = false;
      if (this.gunnerModel) this.gunnerModel.root.visible = false;
      this.turret.rotation.x = 0.35; // the gun droops
      this.body.rotation.set(0.04, 0, -0.06);
    }
    for (const p of this.fires) {
      const k = t.deadTime * 6 + p.phase;
      const flick = 0.75 + 0.25 * Math.sin(k) * Math.sin(k * 1.7);
      p.f.visible = p.s.visible = true;
      p.f.position.set(p.x, 1.6 + 0.2 * Math.sin(k * 0.7), p.z); // local to the (rotated) root
      const fs = 1.4 * flick;
      p.f.scale.set(fs, fs * 1.3, 1);
      const rise = (t.deadTime * 0.8 + p.phase) % 3;
      p.s.position.set(p.f.position.x + rise * 0.4, 2.2 + rise * 1.6, p.f.position.z);
      const ss = 1.6 + rise * 1.2;
      p.s.scale.set(ss, ss, 1);
      p.s.material.opacity = 0.8 * (1 - rise / 3);
    }
  }

  dispose() {
    this.disposed = true;
    this.engine?.stop(0.2);
    this.engine = null;
    if (looks) looks.uniforms.uCharred.value = 0;
    this.gunnerModel?.dispose();
    this.root.removeFromParent();
  }
}
