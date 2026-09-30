import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { Enemy } from '../src/ai/Enemy.js';
import { NavGrid } from '../src/ai/NavGrid.js';
import { CoverPoints } from '../src/ai/CoverPoints.js';
import { ENEMY } from '../src/ai/config.js';
import { rayCapsule } from '../src/ai/hitZones.js';
import { PlayerHealth } from '../src/player/PlayerHealth.js';
import { box, makeWorld } from './helpers.js';

const DT = 1 / 120;

function setup(build = () => {}) {
  const world = makeWorld(build);
  const nav = new NavGrid(world, { minX: -30, maxX: 30, minZ: -40, maxZ: 30 }).build();
  const cover = new CoverPoints(world, nav).generate();
  return { world, nav, cover };
}

/** A stand-in player: a capsule at `pos` that records the shots that hit it. */
function fakePlayer(x, z, { crouched = false } = {}) {
  const p = {
    position: new Vector3(x, 0, z),
    head: new Vector3(),
    chest: new Vector3(),
    speed: 0,
    crouched,
    firing: false,
    alive: true,
    hits: 0,
    place(nx, nz) {
      this.position.set(nx, 0, nz);
      const h = this.crouched ? 1.1 : 1.8;
      this.head.set(nx, h - 0.15, nz);
      this.chest.set(nx, h * 0.72, nz);
    },
    hitTest(origin, dir, maxDist) {
      const h = this.crouched ? 1.1 : 1.8;
      const a = new Vector3(this.position.x, 0.3, this.position.z);
      const b = new Vector3(this.position.x, h - 0.3, this.position.z);
      return rayCapsule(origin, dir, a, b, 0.3, maxDist);
    },
  };
  p.place(x, z);
  return p;
}

function makeEnemy(env, x, z, yaw = 0, shots = []) {
  let seed = 1;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  return new Enemy({ ...env, rand, onFire: (s) => shots.push({ ...s, t: shots.t }) }, new Vector3(x, 0, z), yaw);
}

function run(enemy, player, seconds, onStep) {
  for (let i = 0; i < seconds / DT; i++) {
    enemy.update(DT, player, [enemy]);
    if (onStep) onStep(i * DT);
  }
}

test('headshots kill in one, body shots take three', () => {
  const env = setup();
  const e = makeEnemy(env, 0, 0);
  const origin = new Vector3(0, ENEMY.headHeight, 10);
  const dir = new Vector3(0, 0, -1);
  assert.equal(e.raycast(origin, dir, 50).zone, 'head');
  const bodyOrigin = new Vector3(0, 1.0, 10);
  assert.equal(e.raycast(bodyOrigin, dir, 50).zone, 'body');
  assert.equal(e.raycast(new Vector3(1, 1, 10), dir, 50), null, 'misses beside him');

  assert.equal(e.takeHit('body', dir), false);
  assert.equal(e.takeHit('body', dir), false);
  assert.equal(e.takeHit('body', dir), true);
  assert.equal(e.state, 'dead');

  const e2 = makeEnemy(env, 0, 0);
  assert.equal(e2.takeHit('head', dir), true);
});

test('sees a player in front of him, not behind him or through a wall', () => {
  const env = setup();
  const e = makeEnemy(env, 0, 0, 0); // facing -Z
  run(e, fakePlayer(0, -20), 2);
  assert.equal(e.state, 'combat');

  const behind = makeEnemy(env, 0, 0, 0);
  run(behind, fakePlayer(0, 15), 3);
  assert.equal(behind.state, 'idle', 'player behind him');

  const walled = setup((g) => box(g, { z: -8, w: 10, h: 3, d: 0.5 }));
  const w = makeEnemy(walled, 0, 0, 0);
  run(w, fakePlayer(0, -20), 3);
  assert.equal(w.state, 'idle', 'wall in between');
});

test('hears gunshots behind him and turns toward them', () => {
  const env = setup();
  const e = makeEnemy(env, 0, 0, 0);
  const p = fakePlayer(0, 15);
  e.hearGunshot(new Vector3(0, 1.6, 15));
  assert.equal(e.state, 'alerted');
  run(e, p, 3);
  assert.ok(Math.abs(Math.abs(e.facing) - Math.PI) < 0.3, `turned around, facing=${e.facing}`);
  assert.equal(e.state, 'combat', 'and then spots the player');
});

test('waits for his reaction time before the first shot', () => {
  const env = setup();
  const shots = [];
  const e = makeEnemy(env, 0, 0, 0, shots);
  const p = fakePlayer(0, -15);
  let combatAt = -1;
  let firstShotAt = -1;
  run(e, p, 4, (t) => {
    if (combatAt < 0 && e.state === 'combat') combatAt = t;
    if (firstShotAt < 0 && shots.length) firstShotAt = t;
  });
  assert.ok(combatAt >= 0 && firstShotAt >= 0);
  assert.ok(firstShotAt - combatAt >= ENEMY.reactionTime * 0.8, `reacted after ${firstShotAt - combatAt}s`);
});

test('spread tightens the longer he keeps line of sight', () => {
  const env = setup();
  const shots = [];
  const e = makeEnemy(env, 0, 0, 0, shots);
  const p = fakePlayer(0, -30);
  run(e, p, 8);
  const early = shots.slice(0, 8);
  const late = shots.slice(-8);
  const err = (s) => s.dir.angleTo(new Vector3().subVectors(p.chest, s.origin).normalize());
  const avg = (arr) => arr.reduce((a, s) => a + err(s), 0) / arr.length;
  assert.ok(shots.length > 16, `fired ${shots.length}`);
  assert.ok(avg(late) < avg(early), `late ${avg(late)} < early ${avg(early)}`);
});

test('takes cover behind a low wall, hides, then peeks and shoots', () => {
  // Low wall 4 m in front of him, the player 20 m away beyond it.
  const env = setup((g) => box(g, { x: 0, z: -4, w: 6, h: 1.0, d: 0.4 }));
  const shots = [];
  const e = makeEnemy(env, 2, 0, 0, shots);
  const p = fakePlayer(0, -24);
  let hid = false;
  let peeked = false;
  run(e, p, 10, () => {
    if (e.mode === 'hiding' && e.crouched) hid = true;
    if (e.mode === 'peeking' && hid) peeked = true;
  });
  assert.ok(e.coverPoint, 'picked a cover point');
  assert.ok(e.coverPoint.low);
  assert.ok(Math.abs(e.position.z - -3.35) < 0.4, `behind the wall, z=${e.position.z}`);
  assert.ok(hid, 'crouched behind it');
  assert.ok(peeked, 'peeked out');
  assert.ok(shots.length > 0, 'and shot');
});

test('relocates when the player flanks his cover', () => {
  const env = setup((g) => {
    box(g, { x: 0, z: -4, w: 6, h: 1.0, d: 0.4 }); // faces north
    box(g, { x: 8, z: 0, w: 0.4, h: 1.0, d: 6 }); // faces east
  });
  const e = makeEnemy(env, 0, 0, 0);
  const p = fakePlayer(0, -24);
  run(e, p, 6);
  const first = e.coverPoint;
  assert.ok(first && first.dz === -1, 'first cover faces the player to the north');
  p.place(24, -2); // move around to his east side
  run(e, p, 6);
  assert.ok(e.coverPoint && e.coverPoint !== first, 'moved to new cover');
  assert.ok(e.coverPoint.dx === 1, `new cover faces east (dx=${e.coverPoint.dx}, dz=${e.coverPoint.dz})`);
});

test('nav grid paths around walls and up stairs', () => {
  const env = setup((g) => {
    box(g, { x: 0, z: -10, w: 20, h: 3, d: 0.5 }); // wall
    for (let i = 0; i < 8; i++) box(g, { x: 15, z: -2 - i * 0.3 - 0.15, w: 3, h: 0.18 * (i + 1), d: 0.3 });
    box(g, { x: 15, z: -2 - 2.4 - 3, w: 3, h: 1.44, d: 6 }); // landing
  });
  const around = env.nav.findPath(new Vector3(0, 0, 0), new Vector3(0, 0, -20));
  assert.ok(around, 'found a path around the wall');
  assert.ok(around.some((p) => Math.abs(p.x) > 10), 'goes around the end of the wall');

  const up = env.nav.findPath(new Vector3(15, 0, 2), new Vector3(15, 1.44, -7));
  assert.ok(up, 'found a path up the stairs');
  assert.ok(Math.abs(up.at(-1).y - 1.44) < 0.05);

  // And an enemy actually walks it with the character controller.
  const e = makeEnemy(env, 15, 2, 0);
  e._goTo(new Vector3(15, 1.44, -7), 3);
  run(e, fakePlayer(-25, 25), 8);
  assert.ok(Math.abs(e.position.y - 1.44) < 0.05, `climbed to y=${e.position.y}`);
});

test('player health regenerates after a few seconds out of fire, and dies at zero', () => {
  const h = new PlayerHealth();
  h.damage(60, { x: 1, z: 0 });
  assert.equal(h.health, 40);
  assert.equal(h.indicators.length, 1);
  for (let t = 0; t < 3; t += DT) h.update(DT);
  assert.equal(h.health, 40, 'no regen while recently hit');
  for (let t = 0; t < 4; t += DT) h.update(DT);
  assert.equal(h.health, 100, 'regenerated');
  assert.equal(h.indicators.length, 0, 'indicators faded');
  h.damage(100);
  assert.equal(h.dead, true);
});
