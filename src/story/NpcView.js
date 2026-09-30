import {
  AdditiveBlending,
  BoxGeometry,
  CapsuleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { NPC } from './Npc.js';

const SKIN = [0xc79a78, 0xa87b5a, 0xe0b596, 0x8d6246, 0xd2a282];
const BRIGHT = [0xd9534f, 0x3f7fbf, 0xf0ad4e, 0x5cb85c, 0x9b59b6, 0x1abc9c, 0xe67e22, 0xf2f2f2];
const MUTED = [0x5a6470, 0x7a6a58, 0x3d4a5c, 0x8a8f96, 0x6b5b4b, 0x44505c];

const material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
const gunGeo = new BoxGeometry(0.06, 0.1, 0.7);
const gunMat = new MeshStandardMaterial({ color: 0x2a2b2d, roughness: 0.6 });
const flashGeo = new PlaneGeometry(0.28, 0.28);
const flashMat = new MeshBasicMaterial({
  color: 0xffc87a,
  transparent: true,
  opacity: 0.95,
  blending: AdditiveBlending,
  depthWrite: false,
  side: DoubleSide,
  toneMapped: false,
});
flashMat.color.multiplyScalar(5); // HDR: blooms

function colored(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  const c = new Color(hex);
  const n = g.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new Float32BufferAttribute(arr, 3));
  return g;
}

/** Torso/legs capsule split into an upper (shirt) and lower (trousers) color by height. */
function bodyGeometry(upper, lower) {
  const r = NPC.radius;
  const top = NPC.headHeight - NPC.headRadius - 0.04;
  const len = top - 2 * r;
  const g = new CapsuleGeometry(r, len, 4, 10).translate(0, r + len / 2, 0).toNonIndexed();
  g.deleteAttribute('uv');
  const pos = g.getAttribute('position');
  const cu = new Color(upper);
  const cl = new Color(lower);
  const arr = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 3) {
    // Color whole triangles by their center height (no smeared vertex blends).
    const y = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
    const c = y > 0.88 ? cu : cl;
    for (let k = 0; k < 3; k++) arr.set([c.r, c.g, c.b], (i + k) * 3);
  }
  g.setAttribute('color', new Float32BufferAttribute(arr, 3));
  return g;
}

function pick(list, rand) {
  return list[Math.floor(rand() * list.length)];
}

/** Builds the merged, vertex-colored figure for an NPC kind (one draw call). */
function figureGeometry(kind, rand) {
  const hy = NPC.headHeight;
  const skin = pick(SKIN, rand);
  const parts = [];
  const head = (c = skin) => parts.push(colored(new SphereGeometry(NPC.headRadius, 12, 8).translate(0, hy, 0), c));
  switch (kind) {
    case 'commander':
    case 'soldier': {
      const olive = kind === 'commander' ? 0x5b6440 : 0x646b45;
      parts.push(bodyGeometry(olive, olive));
      parts.push(colored(new BoxGeometry(0.5, 0.4, 0.34).translate(0, 1.2, 0), 0x4e5536)); // vest
      head();
      // Beret for the commander, patrol cap for the others.
      parts.push(colored(new CylinderGeometry(0.135, 0.13, 0.07, 12).translate(0, hy + 0.08, 0), kind === 'commander' ? 0x6b1f2a : 0x545b3a));
      break;
    }
    case 'worshipper': {
      parts.push(bodyGeometry(0xf2f2ee, 0x1c1c1f)); // white shirt, black trousers
      head();
      parts.push(colored(new CylinderGeometry(0.09, 0.09, 0.02, 12).translate(0, hy + 0.1, 0), 0x111111)); // kippah
      break;
    }
    case 'worshipperWoman': {
      parts.push(bodyGeometry(pick(MUTED, rand), pick(MUTED, rand)));
      parts.push(colored(new ConeGeometry(0.4, 0.9, 12, 1, true).translate(0, 0.45, 0), pick(MUTED, rand))); // long skirt
      head();
      parts.push(colored(new SphereGeometry(NPC.headRadius * 1.08, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55).translate(0, hy, 0), pick(MUTED, rand))); // head covering
      break;
    }
    case 'tourist': {
      parts.push(bodyGeometry(pick(BRIGHT, rand), pick(MUTED, rand)));
      head();
      if (rand() < 0.6) {
        parts.push(colored(new CylinderGeometry(0.24, 0.24, 0.02, 14).translate(0, hy + 0.06, 0), 0xe9dcb0)); // sun hat brim
        parts.push(colored(new CylinderGeometry(0.12, 0.13, 0.09, 12).translate(0, hy + 0.1, 0), 0xe9dcb0));
      }
      break;
    }
    case 'guide': {
      parts.push(bodyGeometry(0xf0c419, 0x3d4a5c)); // bright vest
      head();
      break;
    }
    default: {
      parts.push(bodyGeometry(pick(MUTED, rand), pick(MUTED, rand)));
      head();
    }
  }
  return mergeGeometries(parts);
}

/** Placeholder figure with walk / pray / idle loops. */
export class NpcView {
  constructor(npc, rand = Math.random) {
    this.npc = npc;
    this.root = new Group();
    this.pivot = new Group(); // rocks when praying, bobs when walking
    this.root.add(this.pivot);
    this.mesh = new Mesh(figureGeometry(npc.kind, rand), material);
    this.pivot.add(this.mesh);
    if (npc.kind === 'soldier' || npc.kind === 'commander') {
      // Rifle slung across the chest, muzzle down (safe carry).
      const gun = new Mesh(gunGeo, gunMat);
      gun.position.set(0.05, 1.05, -0.25);
      gun.rotation.set(-1.0, 0.5, 0);
      this.pivot.add(gun);
      this.gun = gun;
      this.flash = new Mesh(flashGeo, flashMat);
      this.flash.position.set(0, 0, -0.42);
      this.flash.visible = false;
      gun.add(this.flash);
      this._shots = 0;
      this._flashTime = 0;
    }
    this.crouch = 0; // 0..1 smoothed
    this.phase = rand() * Math.PI * 2;
    this.prayRate = 0.8 + rand() * 0.5;
  }

  update(dt) {
    const n = this.npc;
    this.root.position.copy(n.position);
    this.root.rotation.y = n.facing;
    // Crouching (cowering civilians, soldiers behind low cover): squash the figure.
    const want = n.body.crouched ? 1 : 0;
    this.crouch += (want - this.crouch) * Math.min(1, dt * 10);
    this.root.scale.y = 1 - this.crouch * 0.36;
    if (this.gun) {
      const b = n.brain;
      if (b) {
        // Combat: rifle up at the shoulder, pointing where he looks; flash per shot.
        this.gun.position.set(0.16, 1.36, -0.32);
        this.gun.rotation.set(0, 0, 0);
        if (b.shotsFired !== this._shots) {
          this._shots = b.shotsFired;
          this._flashTime = 0.05;
          this.flash.rotation.z = Math.random() * Math.PI;
        }
      } else {
        this.gun.position.set(0.05, 1.05, -0.25);
        this.gun.rotation.set(-1.0, 0.5, 0);
      }
      this._flashTime -= dt;
      this.flash.visible = this._flashTime > 0;
    }
    const walk = Math.min(1, n.speed / 1.4);
    this.phase += dt * (n.speed > 0.1 ? 2.2 + n.speed * 2.6 : 0);
    if (n.pray && n.speed < 0.1) {
      // Rocking back and forth in prayer.
      this.pivot.rotation.x = -0.1 - 0.12 * Math.max(0, Math.sin(n.time * Math.PI * 2 * this.prayRate));
      this.pivot.position.y = 0;
    } else {
      this.pivot.rotation.x = -0.05 * walk;
      this.pivot.rotation.z = Math.sin(this.phase) * 0.035 * walk;
      this.pivot.position.y = Math.abs(Math.sin(this.phase)) * 0.045 * walk;
      // Breathing when standing still.
      const breathe = 1 + Math.sin(n.time * 1.7) * 0.006 * (1 - walk);
      this.mesh.scale.set(1, breathe, 1);
    }
  }

  dispose() {
    this.root.removeFromParent();
    this.mesh.geometry.dispose();
  }
}
