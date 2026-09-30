import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { GrenadeSim, solveThrow } from '../src/weapons/Grenades.js';
import { GrenadeThrower } from '../src/weapons/GrenadeThrower.js';
import { NavGrid } from '../src/ai/NavGrid.js';
import { CoverPoints } from '../src/ai/CoverPoints.js';
import { EnemyManager } from '../src/ai/EnemyManager.js';
import { attackerConfig, expandWave, DIFFICULTY } from '../src/story/difficulty.js';
import { AmmoCrate } from '../src/story/AmmoCrate.js';
import { DT, box, makeWorld } from './helpers.js';

const flat = makeWorld();

test('a grenade falls, bounces, comes to rest and goes off after its fuse', () => {
  const sim = new GrenadeSim(flat, { fuse: 3 });
  const booms = [];
  sim.onExplode = (g) => booms.push(g.position.clone());
  const g = sim.spawn(new Vector3(0, 1.5, 0), new Vector3(6, 3, 0));
  let maxY = 0;
  for (let t = 0; t < 2.9; t += DT) {
    sim.update(DT);
    maxY = Math.max(maxY, g.position.y);
    assert.ok(g.position.y > -0.01, 'never below the floor');
  }
  assert.ok(maxY > 1.8, 'it flies in an arc');
  assert.ok(g.resting, 'rolled to a stop');
  assert.ok(g.position.x > 4, `travelled (${g.position.x.toFixed(2)} m)`);
  assert.equal(booms.length, 0);
  for (let t = 0; t < 0.2; t += DT) sim.update(DT);
  assert.equal(booms.length, 1, 'exploded at the fuse');
  assert.equal(g.live, false);
});

test('grenades bounce off walls instead of passing through', () => {
  const world = makeWorld((g) => box(g, { x: 3, w: 0.4, h: 3, d: 10 }));
  const sim = new GrenadeSim(world);
  const g = sim.spawn(new Vector3(0, 1, 0), new Vector3(12, 1, 0));
  for (let t = 0; t < 2; t += DT) sim.update(DT);
  assert.ok(g.position.x < 2.8, `stayed on this side of the wall (x ${g.position.x.toFixed(2)})`);
});

test('solveThrow lands near the target, also up or down a level', () => {
  const sim = new GrenadeSim(flat);
  const v = new Vector3();
  for (const [dist, h] of [[8, 0], [20, 0], [30, 0], [12, -3], [10, 2]]) {
    const world = h === 0 ? flat : makeWorld((g) => box(g, { x: dist, w: 6, h: Math.max(h, 0.01), d: 6, bottom: Math.min(h, 0) }));
    const s = new GrenadeSim(world);
    const from = new Vector3(0, 1.8 + Math.max(0, -h), 0);
    const to = new Vector3(dist, Math.max(h, 0), 0);
    solveThrow(from, to, v);
    const pts = Array.from({ length: 200 }, () => new Vector3());
    // Where it first touches down.
    let p = from.clone();
    const vel = v.clone();
    for (let t = 0; t < 5; t += DT) {
      if (s._integrate(p, vel, DT)) break;
    }
    assert.ok(Math.abs(p.x - dist) < 1.2, `${dist} m throw (h ${h}) lands at ${p.x.toFixed(2)}`);
    assert.ok(sim.predict(from, v, pts) > 5, 'the arc prediction has points');
  }
});

test('the player has 3 grenades: hold G to aim, release to throw, refilled at a crate', () => {
  const sim = new GrenadeSim(flat);
  const t = new GrenadeThrower({ sim, config: DIFFICULTY.grenades.player });
  const eye = new Vector3(0, 1.7, 0);
  const dir = new Vector3(0, 0, -1);
  let thrown = 0;
  for (let k = 0; k < 5; k++) {
    for (let i = 0; i < 20; i++) t.update(DT, true, eye, dir, null);
    assert.equal(t.aiming, t.count > 0);
    if (t.update(DT, false, eye, dir, null)) thrown++;
    for (let i = 0; i < 120; i++) t.update(DT, false, eye, dir, null);
  }
  assert.equal(thrown, 3, 'three throws, then empty');
  assert.equal(t.count, 0);
  t.refill();
  assert.equal(t.count, 3);
  const g = sim.live[0];
  assert.ok(g.velocity.z < -10 && g.velocity.y > 0, 'thrown forward and up');
});

test('explosions hurt attackers by distance and cover; kills count for the thrower', () => {
  const world = makeWorld((g) => box(g, { x: 0, z: -6, w: 6, h: 2, d: 0.4 })); // a wall at z = -6
  const nav = new NavGrid(world, { minX: -15, maxX: 15, minZ: -15, maxZ: 15 }).build();
  const cover = new CoverPoints(world, nav).generate();
  const m = new EnemyManager({ scene: { add() {} }, world, nav, cover, audio: { shotAt() {}, crack() {} }, impacts: { add() {} }, health: { damage() {} }, spawns: [] });
  const cfg = attackerConfig('rifleman');
  const near = m.spawn(new Vector3(1, 0, 0), 0, cfg);
  const far = m.spawn(new Vector3(6, 0, 0), 0, cfg);
  const behind = m.spawn(new Vector3(0, 0, -7.5), 0, cfg);
  const out = m.spawn(new Vector3(12, 0, 0), 0, cfg);
  for (const e of [near, far, behind, out]) e.asTarget.update();
  const player = { position: new Vector3(), hitTest: () => -1, alive: true };
  const killed = [];
  m.onEnemyKilled = (e, k) => killed.push([e, k]);
  const kills = m.explode(new Vector3(0, 0.1, 0), 7, 220, player);
  assert.equal(near.alive, false, 'right next to it: dead');
  assert.ok(far.alive && far.health < 100, `6 m away: hurt (${far.health.toFixed(0)})`);
  assert.ok(behind.health > far.health || behind.health > 90, `behind the wall: mostly shielded (${behind.health.toFixed(0)})`);
  assert.equal(out.health, 100, 'outside the radius: untouched');
  assert.equal(kills, 1);
  assert.equal(m.kills, 1, 'counts as the player\'s kill');
  assert.equal(killed[0][1], player);
});

test('enemies throw grenades at a player who camps in one spot', () => {
  const world = makeWorld((g) => box(g, { x: 0, z: -4, w: 8, h: 1, d: 0.5 }));
  const nav = new NavGrid(world, { minX: -20, maxX: 20, minZ: -25, maxZ: 10 }).build();
  const cover = new CoverPoints(world, nav).generate();
  const m = new EnemyManager({ scene: { add() {} }, world, nav, cover, audio: { shotAt() {}, crack() {} }, impacts: { add() {} }, health: { damage() {} }, spawns: [] });
  const sim = new GrenadeSim(world);
  m.grenades = sim;
  let thrown = 0;
  m.onGrenadeThrown = () => thrown++;
  const pos = new Vector3(0, 0, 0);
  const player = { position: pos, head: new Vector3(0, 1.65, 0), chest: new Vector3(0, 1.3, 0), speed: 0, crouched: false, firing: false, alive: true, hitTest: () => -1 };
  m.spawnAttacker(new Vector3(0, 0, -18), 0, pos, attackerConfig('rifleman'));
  m.spawnAttacker(new Vector3(5, 0, -17), 0, pos, attackerConfig('rifleman'));
  for (let t = 0; t < 25 && thrown === 0; t += DT) {
    m.update(DT, player, { position: pos });
    sim.update(DT);
  }
  assert.ok(m.campTime > DIFFICULTY.grenades.enemy.campTime || thrown > 0);
  assert.ok(thrown > 0, 'a grenade came over');
  const g = sim.items.find((x) => x.owner === 'hostile' && x.thrower);
  assert.ok(g, 'owned by the thrower');
});

test('difficulty: roles and waves expand into spawns', () => {
  const w3 = expandWave(DIFFICULTY.waves.wave3);
  assert.ok(w3.some((s) => s.role === 'marksman') && w3.some((s) => s.role === 'rusher'));
  assert.ok(w3.every((s) => Array.isArray(s.at) && s.delay >= 0));
  const easy = attackerConfig('rifleman', { ...DIFFICULTY, accuracy: 0.5 });
  const normal = attackerConfig('rifleman');
  assert.ok(easy.maxSpread > normal.maxSpread, 'lower accuracy = wider spread');
  assert.equal(attackerConfig('marksman').marksman, true);
  assert.throws(() => attackerConfig('nobody'));
});

test('an ammo crate is reachable with E and pushes the player out of its box', () => {
  const c = new AmmoCrate({ id: 'c', position: new Vector3(0, 0, 0), yaw: 0.7 });
  const eye = new Vector3(-1.4, 1.6, 0);
  assert.ok(c.inReach(eye, new Vector3(1, -0.8, 0).normalize()));
  assert.ok(!c.inReach(eye, new Vector3(-1, 0, 0)), 'looking away');
  assert.ok(!c.inReach(new Vector3(-5, 1.6, 0), new Vector3(1, 0, 0)), 'too far');
  const p = new Vector3(0.1, 0, 0.05);
  c.pushOut(p, 0.3);
  const lx = p.x * Math.cos(0.7) - p.z * Math.sin(0.7);
  const lz = p.x * Math.sin(0.7) + p.z * Math.cos(0.7);
  assert.ok(Math.abs(lx - 0.15) >= 0.5 + 0.3 + 0.3 - 1e-6 || Math.abs(lz) >= 0.3 + 0.3 - 1e-6, 'outside the box after the push');
});
