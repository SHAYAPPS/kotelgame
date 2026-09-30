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
  PlaneGeometry,
  SRGBColorSpace,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
} from 'three';
import { TRUCK_GUN } from './Truck.js';
import { characters } from '../characters/registry.js';

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

/** Placeholder armed pickup (white, dented), a gunner behind a shield; a burning wreck when destroyed. */
export class TruckView {
  constructor(truck) {
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
      const s = new Sprite(new SpriteMaterial({ map: a.smokeTex, transparent: true, depthWrite: false, toneMapped: false }));
      f.visible = s.visible = false;
      this.root.add(f, s);
      this.fires.push({ f, s, x: (i % 2 ? 0.5 : -0.5) * (i < 2 ? 1 : 0.6), z: i < 2 ? -1.3 : 1.2, phase: i * 1.7 });
    }
    this._shots = truck.shotsFired;
    this._flash = 0;
    this._wrecked = false;
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
    // Slight body roll while driving.
    this.body.rotation.z = t.driving ? Math.sin(t.time * 9) * 0.012 : 0;
    if (!t.alive) this._wreck(dt);
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
    this.gunnerModel?.dispose();
    this.root.removeFromParent();
  }
}
