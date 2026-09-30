// Smoke test for the animated characters: a real model (textures stripped) driven by the
// soldier and civilian animators through every state the game uses, in Node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { Vector3 } from 'three';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder as NodeDecoder, MeshoptEncoder } from 'meshoptimizer';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { decodeClips } from '../src/characters/animLibrary.js';
import { CharacterType } from '../src/characters/CharacterLibrary.js';
import { CharacterModel } from '../src/characters/CharacterModel.js';
import { SoldierAnimator } from '../src/characters/SoldierAnimator.js';
import { CivilianAnimator } from '../src/characters/CivilianAnimator.js';
import { dressCharacter } from '../src/characters/outfits.js';
import { makeWorld, box } from './helpers.js';

const DIR = new URL('../public/assets/characters/', import.meta.url);
const have = existsSync(new URL('manifest.json', DIR));
const manifest = have ? JSON.parse(readFileSync(new URL('manifest.json', DIR), 'utf8')) : null;

async function loadType(id) {
  await MeshoptDecoder.ready;
  await NodeDecoder.ready;
  await MeshoptEncoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': NodeDecoder, 'meshopt.encoder': MeshoptEncoder });
  const doc = await io.read(new URL(manifest.characters[id].file, DIR).pathname);
  // No KTX2 transcoder in Node: drop the textures (the geometry and skin are what we test).
  for (const t of doc.getRoot().listTextures()) t.dispose();
  const glb = await io.writeBinary(doc);
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength), '');
  const bin = readFileSync(new URL(manifest.anims.file, DIR));
  const clips = decodeClips(manifest.anims, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength), MeshoptDecoder);
  return new CharacterType(id, manifest.characters[id], gltf, clips, manifest.anims);
}

const base = () => ({
  alive: true, facing: 0, velocity: new Vector3(), crouched: false, posture: 'combat', mode: 'peeking', cover: null,
  aimAt: new Vector3(0, 1.5, -20), eyeY: 1.62, shotsFired: 0, health: 100, throws: 0, deathDir: new Vector3(0, 0, 1), hitZone: 'body', position: new Vector3(),
});

test('a soldier model plays every combat state and stays down when killed', { skip: !have && 'no character assets', timeout: 60000 }, async () => {
  const type = await loadType('enemy_david');
  const model = new CharacterModel(type);
  dressCharacter(model, { band: 0x9a2020 });
  const world = makeWorld((g) => box(g, { z: -1.5, w: 4, h: 2, d: 0.3 })); // a wall right in front
  const anim = new SoldierAnimator(model, { world, rand: () => 0.5 });
  const s = base();
  const ctx = { camera: { position: new Vector3(0, 1.6, 5) } };
  const step = (n, fn = () => {}) => {
    for (let i = 0; i < n; i++) {
      fn(i);
      anim.update(1 / 60, s);
      model.update(1 / 60, ctx, true);
    }
  };
  step(30); // aiming
  assert.ok(model.weightOf('rifle_idle_aiming') > 0.9);
  assert.ok(model.hit.valid);
  assert.ok(model.hit.head.y > 1.3 && model.hit.head.y < 1.9, `head at ${model.hit.head.y}`);
  // Strafing left while aiming: the two left-ish walk directions blend, feet in phase.
  s.velocity.set(-2, 0, 0); // yaw 0 faces -Z, so -X is his left
  step(60);
  assert.ok(model.weightOf('rifle_walk_l') > 0.5, 'strafes left');
  assert.ok(model.phase > 0);
  // Running forward.
  s.velocity.set(0, 0, -4.4);
  step(60);
  assert.ok(model.weightOf('rifle_run_f') > 0.8, 'runs forward');
  // Crouched behind low cover, then a shot burst with recoil and flashes, then a reload.
  s.velocity.set(0, 0, 0);
  s.crouched = true;
  s.mode = 'hiding';
  s.cover = { low: true, dx: 0, dz: -1 };
  step(40);
  assert.ok(model.weightOf('rifle_crouch_idle') > 0.9);
  assert.ok(model.hit.head.y < 1.25, 'the head goes down with the crouch');
  s.mode = 'exposed';
  step(40, (i) => (s.shotsFired = i));
  assert.equal(s.shotsFired, 39);
  s.mode = 'hiding';
  step(10);
  assert.ok(anim.upper?.clip.startsWith('rifle_reload'), 'reloads behind cover after a magazine');
  // Grenade (crouched or standing variant by posture) and a hit reaction.
  s.throws = 1;
  step(20);
  assert.equal(anim.upper?.clip, 'grenade_throw_crouch');
  s.crouched = false;
  step(60);
  s.throws = 2;
  step(20);
  assert.equal(anim.upper?.clip, 'grenade_toss_stand');
  s.health = 60;
  step(10);
  assert.ok([...model.slots.keys()].some((k) => k.startsWith('hit:')));
  // High cover: the body turns its back to the wall.
  s.mode = 'hiding';
  s.cover = { low: false, dx: 0, dz: -1 };
  step(90);
  assert.ok(model.weightOf('cover_wall_idle') > 0.9);
  // Killed by a shot from behind: he would fall forward, but the wall is right there.
  s.alive = false;
  s.deathDir.set(0, 0, -1);
  step(10);
  assert.ok(anim.deathClip, 'plays a death');
  assert.ok(!['death_front', 'death_back', 'death_headshot_back'].includes(anim.deathClip), `falls away from the wall (${anim.deathClip})`);
  step(60 * 5);
  assert.ok(model.frozen, 'the body stays down (animation stopped)');
  assert.equal(model.hit.valid, false, 'dead bodies take no hits');
});

test('a civilian model walks, runs, prays, cowers and waits', { skip: !have && 'no character assets', timeout: 60000 }, async () => {
  const type = await loadType('civ_brian');
  const model = new CharacterModel(type);
  dressCharacter(model, { kind: 'worshipper', rand: () => 0.3 });
  const anim = new CivilianAnimator(model, { kind: 'worshipper', rand: () => 0.3 });
  const s = { speed: 0, pray: true, frozen: false, fleeing: false, sheltered: false, panicking: false, speaking: false, crouched: false };
  const ctx = { camera: { position: new Vector3(0, 1.6, 5) } };
  const step = (n) => {
    for (let i = 0; i < n; i++) {
      anim.update(1 / 60, s);
      model.update(1 / 60, ctx, true);
    }
  };
  step(30);
  assert.ok(model.weightOf(anim.pray) > 0.9, 'prays');
  s.pray = false;
  s.speed = 1.3;
  step(60);
  assert.ok(model.weightOf('walk_male') > 0.9, 'walks');
  s.speed = 3.8;
  step(60);
  assert.ok(model.weightOf(anim.run) > 0.9, `runs (${anim.run})`);
  s.speed = 0;
  s.frozen = true;
  s.crouched = true;
  step(120);
  assert.ok(model.weightOf('cower_hiding') > 0.9, 'cowers');
  assert.ok(model.hit.head.y < 1.3, 'down low');
  s.frozen = false;
  s.crouched = false;
  s.sheltered = true;
  step(40);
  assert.ok(model.weightOf(anim.shelterIdle) > 0.9, 'waits in the shelter');
  assert.ok(model.hit.valid);
});
