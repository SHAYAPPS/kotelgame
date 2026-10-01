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
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { NPC } from './Npc.js';
import { PEOPLE } from './people.js';
import { characters } from '../characters/registry.js';
import { handProp } from '../characters/handProps.js';
import { dressPerson } from '../characters/wardrobe.js';
import { LipSync } from '../characters/LipSync.js';
import { StairTracker } from '../player/StairTracker.js';
import { stairsAt } from '../world/stairs.js';
import { soldierState } from '../ai/EnemyView.js';

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

/** Placeholder figure with walk / pray / idle loops (until the characters load, and in tests). */
class PlaceholderFigure {
  constructor(npc, root, rand = Math.random) {
    this.npc = npc;
    this.root = new Group();
    root.add(this.root);
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

// Which character plays whom. Squad members by name; civilians by kind (wardrobe.js CAST),
// each one dressed unlike the people already standing near them.
const SQUAD = { cmd: 'squad_swat', yonatan: 'squad_steve', noam: 'squad_swatguy' };
// Soldiers visiting in uniform and Border Police officers: the squad model without the vest.
const UNIFORM = 'squad_steve';
const NEIGHBORHOOD = 9; // m
const dressed = new Set(); // civilian views with a model (their looks, for the next picks)
const _flashAt = new Vector3();

/** Hooks the game fills in: `flash(position)` lights a phone's photo flash. */
export const viewFx = { flash: null };

/**
 * A story NPC: the animated character (squad member or civilian) driven by its animator,
 * or a placeholder figure until the characters have loaded. Hit zones follow the model
 * (npc.hitShape: friendly-fire tests).
 */
export class NpcView {
  constructor(npc, rand = Math.random) {
    this.npc = npc;
    this.rand = rand;
    this.root = new Group();
    this.model = null;
    this.animator = null;
    this.placeholder = null;
    // Armed (the soldier animator: rifle, postures, the combat AI's states): the squad, police.
    this.soldier = npc.kind === 'soldier' || npc.kind === 'commander' || npc.kind === 'police';
    this.propFlash = null;
    this.cane = null;
    this._flash = 0;
    this.state = {
      alive: true, facing: 0, velocity: null, crouched: false, posture: 'relaxed', mode: 'idle', cover: null,
      aimAt: null, eyeY: 1.62, shotsFired: 0, health: 100, throws: 0, deathDir: null, hitZone: null, position: null,
    };
    this.civ = { speed: 0, pray: false, frozen: false, fleeing: false, sheltered: false, panicking: false, speaking: false, crouched: false };
    this.state.speaking = false;
    this.lip = new LipSync(rand);
    this._speech = null;
    this._chatting = false;
    this.stairs = new StairTracker();
    this._flight = { on: 0, dir: 1, zone: null };
    if (!this._build()) this.placeholder = new PlaceholderFigure(npc, this.root, rand);
  }

  _build() {
    const lib = characters.library;
    if (!lib?.ready) return false;
    const n = this.npc;
    let id = null;
    let outfit = null;
    const person = PEOPLE[n.kind];
    if (n.preset && lib.has(n.preset.id)) {
      // A crowd member stepping in (the player talks to them): the same person.
      id = n.preset.id;
      outfit = n.preset.outfit;
    } else if (this.soldier) id = SQUAD[n.id] ?? (n.kind === 'police' && lib.has(UNIFORM) ? UNIFORM : lib.ids('squad')[Math.floor(this.rand() * 3) % lib.ids('squad').length]);
    else if (person?.soldier) id = lib.has(UNIFORM) ? UNIFORM : lib.ids('squad')[0];
    else {
      const neighbors = [];
      for (const v of dressed) {
        const d = Math.hypot(v.npc.position.x - n.position.x, v.npc.position.z - n.position.z);
        if (d < NEIGHBORHOOD) neighbors.push({ sig: v.look, near: 1 - d / NEIGHBORHOOD });
      }
      const pick = dressPerson(n.kind, neighbors, (x) => (lib.has(x) ? lib.types.get(x).info : null), this.rand, n.wantSex);
      id = pick?.id ?? lib.ids('civilian')[0];
      outfit = pick?.outfit ?? null;
    }
    if (!id || !lib.has(id)) return false;
    ({ model: this.model, animator: this.animator } = this.soldier ? lib.soldier(id, { rand: this.rand, kind: n.kind }) : lib.civilian(id, n.kind, { rand: this.rand, outfit }));
    if (!this.soldier && outfit) {
      this.look = outfit.sig;
      dressed.add(this);
    }
    n.sex = this.model.info.sex;
    // Children: smaller, the head a bit bigger for the body; their strides shorter.
    const size = n.scale ?? 1;
    if (size !== 1) {
      this.model.setSize(size, size < 0.8 ? 1.16 : 1);
      this.animator.hips *= size;
    }
    if (n.prop) this._addProp(n.prop);
    this.root.add(this.model.root);
    n.hitShape = this.model.hit;
    if (this.placeholder) {
      this.placeholder.dispose();
      this.placeholder = null;
    }
    return true;
  }

  /** Something in the hand (people.js `prop`): each mesh on the hand bone. */
  _addProp(name) {
    const p = handProp(name);
    if (!p) return;
    this.propFlash = p.object.userData.flash ?? null;
    this.cane = p.object.userData.vertical ?? null;
    if (!p.bone) {
      // On the floor under the hand (a cane): in the model's root, placed every frame.
      this.model.root.add(p.object);
      for (const o of p.object.children) this.model.gear.push({ object: o, shadow: false, hideBeyond: 30 });
      this.caneRoot = p.object;
      return;
    }
    for (const o of [...p.object.children]) this.model.attach(p.bone, o, { hideBeyond: 30 });
  }

  /** The cane stands under the right hand, its length the hand's height. */
  _placeCane() {
    const hand = this.model.bone('RightHand');
    if (!hand || this.model.distance > 30) return;
    const p = hand.getWorldPosition(_flashAt);
    this.model.root.worldToLocal(p);
    this.caneRoot.position.set(p.x, 0, p.z);
    const h = Math.max(0.3, p.y - 0.03);
    this.cane.shaft.scale.y = h;
    this.cane.crook.position.y = h;
  }

  update(dt) {
    const n = this.npc;
    this.root.position.copy(n.position);
    if (!this.model && characters.library?.ready) this._build();
    if (!this.model) return this.placeholder.update(dt);
    // Stairs: the drawn body climbs smoothly (the physics steps a riser at a time), the legs
    // play the stair clip, the feet go onto the steps near the camera.
    const st = this.stairs.update(dt, n.position.y, n.body.grounded, n.body.horizontalSpeed);
    const v = n.body.velocity;
    const flight = stairsAt(n.world.stairZones, n.position.x, n.position.z, v.x, v.z, this._flight, 0.15);
    this.model.body.position.y = st.offset;
    this.model.world = n.world;
    this.model.feetWeight += ((flight.zone ? 1 : st.amount) - this.model.feetWeight) * Math.min(1, dt * 8);
    this.state.stairs = this.civ.stairs = flight.on;
    this.state.stairDir = this.civ.stairDir = flight.dir;
    if (this.soldier) {
      const b = n.brain;
      if (b) soldierState(b, this.state);
      else {
        const s = this.state;
        s.alive = true;
        s.facing = n.facing;
        s.velocity = n.body.velocity;
        s.crouched = n.body.crouched;
        s.posture = 'relaxed';
        s.mode = 'idle';
        s.cover = null;
        s.aimAt = null;
        s.position = n.position;
      }
      this.state.speaking = n.speaking && !b;
      this.animator.update(dt, this.state);
    } else {
      const c = this.civ;
      // In a chat group: listening between turns, not on the phone (joined after spawning).
      if (n.chat && !this._listening && this.animator.idle) {
        this._listening = true;
        this.animator.idle = ['idle_standing', 'idle_weightshift', 'idle_breathing'][Math.floor(this.rand() * 3) % 3];
      }
      c.speed = n.speed;
      c.pray = n.pray;
      c.frozen = n.frozen;
      c.fleeing = n.fleeing;
      c.sheltered = n.sheltered;
      c.panicking = n.panicking;
      c.speaking = !!n.speaking || n.chatting;
      c.crouched = n.body.crouched;
      c.act = n.act;
      c.sit = n.sit;
      c.backward = !!(n.route?.backward && !n.arrived);
      this.model.root.rotation.y = n.facing;
      this.animator.update(dt, c);
      // A photo: the phone's flash (and a little light on the people in front of it).
      if (this.propFlash) {
        const f = n.flash;
        this.propFlash.material.opacity = f;
        if (f > this._flash && f > 0.9 && viewFx.flash && this.model.distance < 40) viewFx.flash(this.propFlash.getWorldPosition(_flashAt));
        this._flash = f;
      }
    }
    // Talking: the mouth follows the line (its recording, else its text); heads turn toward
    // whoever is being talked to / talking (StoryDirector sets npc.lookAt).
    const sp = n.speaking ? n.speech : null;
    if (sp !== this._speech) {
      this._speech = sp;
      if (!sp) this.lip.stop();
      else if (sp.level) this.lip.speakLevel(sp.level);
      else this.lip.speak(sp.text, sp.duration);
    }
    // Small talk (an ambient group's turn): made-up words while it lasts.
    const chat = n.chatting && !sp;
    if (chat !== this._chatting) {
      this._chatting = chat;
      if (chat) this.lip.babble(n.chat?.timer ?? 3);
      else if (!sp) this.lip.stop();
    }
    this.model.face.mouth = this.lip.update(dt);
    this.model.lookTarget = n.lookAt;
    this.model.update(dt, characters);
    if (this.cane) this._placeCane();
    if (n.brain) {
      // The combat AI on this body is what enemies shoot at: same zones, same muzzle.
      n.brain.hitShape = this.model.hit;
      n.brain.visualMuzzle = this.model.muzzleWorld(n.brain.visualMuzzle ?? new Vector3());
    }
  }

  dispose() {
    dressed.delete(this);
    if (this.model) this.model.dispose();
    this.root.removeFromParent();
    this.placeholder?.dispose();
  }
}
