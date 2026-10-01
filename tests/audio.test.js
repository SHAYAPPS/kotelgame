// Sound logic that runs without a browser: the plaza's reverb, slap-back echoes off walls,
// suppression (near misses, blasts -> muffle / blur), surfaces under the feet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry, Group, Mesh, Vector3 } from 'three';
import { plazaImpulse, wallEcho, PLAZA } from '../src/audio/reverb.js';
import { Suppression, SUPPRESSION } from '../src/audio/Suppression.js';
import { DEFAULT_VOLUMES } from '../src/audio/Mixer.js';
import { loadSettings } from '../src/core/Settings.js';
import { CollisionWorld } from '../src/world/CollisionWorld.js';
import { makeWorld } from './helpers.js';

const energy = (x, a, b) => {
  let s = 0;
  for (let i = a; i < b; i++) s += x[i] * x[i];
  return s;
};

test('the plaza reverb: stereo, early slaps off the walls, then a decaying tail', () => {
  const sr = 48000;
  const [L, R] = plazaImpulse(sr);
  assert.equal(L.length, Math.floor(sr * PLAZA.duration));
  assert.notDeepEqual(L.slice(2000, 2100), R.slice(2000, 2100), 'left and right differ (width)');
  // The Western Wall's slap stands out of the tail right around its delay.
  const tap = Math.floor(PLAZA.taps[1][0] * sr);
  const at = energy(L, tap, tap + 200) + energy(R, tap, tap + 200);
  const before = energy(L, tap - 600, tap - 400) + energy(R, tap - 600, tap - 400);
  assert.ok(at > before * 3, `slap at ${PLAZA.taps[1][0]} s (${at.toFixed(4)} vs ${before.toFixed(4)})`);
  // Decays: each half second quieter than the one before.
  const h = sr / 2;
  const e = [0, 1, 2, 3].map((k) => energy(L, k * h, (k + 1) * h));
  for (let k = 1; k < e.length; k++) assert.ok(e[k] < e[k - 1], `half-second ${k} quieter`);
  assert.ok(e[3] < e[0] * 0.05, 'mostly gone after 2 s');
  // Same every time (no random IR per run).
  assert.deepEqual(plazaImpulse(sr)[0].slice(0, 500), L.slice(0, 500));
});

test('a wall throws a shot back: later and quieter the farther it is, from the mirror image', () => {
  const wall = { n: [1, 0, 0], d: 0 }; // the Western Wall at x = 0, the plaza at x < 0
  const me = { x: -20, y: 1.6, z: 0 };
  const near = wallEcho(me, me, wall);
  assert.ok(near, 'heard');
  assert.ok(Math.abs(near.delay - 40 / 343) < 1e-6, `there and back (${near.delay})`);
  assert.equal(near.position.x, 20, 'from behind the wall');
  const far = wallEcho({ x: -60, y: 1.6, z: 0 }, { x: -60, y: 1.6, z: 0 }, wall);
  assert.ok(far.delay > near.delay, 'later (and quieter: it plays from farther away)');
  assert.ok(Math.hypot(far.position.x - -60, far.position.z) > Math.hypot(near.position.x - -20, near.position.z));
  // A shooter across the plaza: the echo arrives after the direct sound.
  const e = wallEcho({ x: -50, y: 1.6, z: 30 }, me, wall);
  assert.ok(e.delay > 0);
  // Behind the wall: no echo into the plaza.
  assert.equal(wallEcho({ x: 5, y: 1, z: 0 }, me, wall), null);
  // Beyond its reach: nothing.
  assert.equal(wallEcho({ x: -150, y: 1, z: 0 }, { x: -150, y: 1, z: 0 }, { ...wall, reach: 200 }), null);
});

test('suppression: near misses pile up, hearing dulls and the edges blur, then it drains', () => {
  const s = new Suppression();
  assert.equal(s.muffle, 0);
  assert.equal(s.blur, 0);
  s.nearMiss(2);
  assert.ok(s.level > 0 && s.muffle === 0, 'one crack does not muffle');
  for (let i = 0; i < 8; i++) s.nearMiss(0.8);
  assert.ok(s.muffle > 0.3 && s.blur > 0.3, `heavy fire (${s.level.toFixed(2)})`);
  assert.ok(s.level <= SUPPRESSION.max);
  const peak = s.level;
  s.update(0.3);
  assert.equal(s.level, peak, 'held for a moment');
  for (let i = 0; i < 60 * 8; i++) s.update(1 / 60);
  assert.equal(s.level, 0, 'gone a few seconds later');
  // A blast close by is a lot; far away nothing.
  s.blast(2);
  assert.ok(s.level > 0.4);
  s.reset();
  s.blast(SUPPRESSION.blastRange + 5);
  assert.equal(s.level, 0);
});

test('volumes fall back to defaults without storage', () => {
  assert.deepEqual(loadSettings(null).volumes, DEFAULT_VOLUMES);
});

test('the collision world knows what a ray hit is made of', () => {
  const world = makeWorld((g) => {
    const deck = new Mesh(new BoxGeometry(4, 0.2, 4));
    deck.position.set(10, 0.5, 0);
    deck.userData.surface = 'wood';
    g.add(deck);
  });
  const hit = { point: new Vector3(), normal: new Vector3(), distance: 0 };
  const down = new Vector3(0, -1, 0);
  assert.equal(world.raycast(new Vector3(10, 2, 0), down, 5, hit)?.surface, 'wood');
  assert.equal(world.raycast(new Vector3(-10, 2, 0), down, 5, hit)?.surface, 'stone');
  // A world without tags: stone everywhere.
  const plain = new CollisionWorld().build(new Group().add(new Mesh(new BoxGeometry(2, 0.1, 2))));
  assert.equal(plain.raycast(new Vector3(0, 1, 0), down, 3, hit)?.surface, 'stone');
});
