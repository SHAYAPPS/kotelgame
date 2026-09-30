import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { Launcher } from '../src/weapons/Launcher.js';
import { RocketSim } from '../src/weapons/Rockets.js';
import { LAUNCHER } from '../src/weapons/config.js';
import { Truck } from '../src/ai/Truck.js';
import { NavGrid } from '../src/ai/NavGrid.js';
import { CoverPoints } from '../src/ai/CoverPoints.js';
import { EnemyManager } from '../src/ai/EnemyManager.js';
import { DIFFICULTY } from '../src/story/difficulty.js';
import { DT, box, makeWorld } from './helpers.js';

const flat = makeWorld();
const idle = { trigger: false, aim: false, reload: false, blocked: false };
const fire = { trigger: true, aim: true, reload: false, blocked: false };

test('launcher: one rocket at a time, reloads itself from the reserve', () => {
  const l = new Launcher(LAUNCHER);
  const shots = [];
  l.onFire = (o, d) => shots.push(d.clone());
  const eye = new Vector3(0, 1.7, 0);
  const dir = new Vector3(0, 0, -1);
  assert.equal(l.fixedUpdate(DT, fire, eye, dir), false, 'nothing to fire before you have it');
  l.give(3);
  assert.ok(l.owned);
  assert.equal(l.state.ammo, 1);
  assert.equal(l.state.reserve, 2);
  for (let i = 0; i < 30; i++) l.fixedUpdate(DT, fire, eye, dir); // aim in, then fire
  assert.equal(shots.length, 1, 'fired once');
  assert.equal(l.state.ammo, 0);
  for (let t = 0; t < 0.5 + LAUNCHER.reloadTime + 0.1; t += DT) l.fixedUpdate(DT, idle, eye, dir);
  assert.equal(l.state.ammo, 1, 'reloaded on its own');
  assert.equal(l.state.reserve, 1);
  assert.ok(shots[0].z < -0.99, 'aimed where you look');
  l.reset();
  assert.equal(l.owned, false);
});

test('rockets fly straight and stop at walls or targets', () => {
  const world = makeWorld((g) => box(g, { x: 0, z: -40, w: 10, h: 5, d: 1 }));
  const sim = new RocketSim(world, LAUNCHER);
  const impacts = [];
  sim.onImpact = (r, p, n, t) => impacts.push({ p, t });
  sim.spawn(new Vector3(0, 1.5, 0), new Vector3(0, 0, -1), LAUNCHER.rocketSpeed);
  for (let t = 0; t < 1.5; t += DT) sim.update(DT);
  assert.equal(impacts.length, 1);
  assert.ok(Math.abs(impacts[0].p.z + 39.5) < 0.3, `hit the wall face (z ${impacts[0].p.z.toFixed(2)})`);
  // A target in front of the wall is hit first.
  sim.targets = { raycast: (o, d, max) => (o.z > -20.3 && o.z + d.z * max <= -20.3 ? { distance: (o.z + 20.3) / -d.z, enemy: 'x' } : null) };
  sim.spawn(new Vector3(0, 1.5, 0), new Vector3(0, 0, -1), LAUNCHER.rocketSpeed);
  for (let t = 0; t < 1.5; t += DT) sim.update(DT);
  assert.equal(impacts[1].t.enemy, 'x');
  assert.ok(Math.abs(impacts[1].p.z + 20.3) < 0.2);
});

function truckAt(world, path) {
  return new Truck({ world, config: DIFFICULTY.truck, path: path.map(([x, z]) => new Vector3(x, 0, z)) });
}

test('the truck drives its path and parks at the end', () => {
  const t = truckAt(flat, [[0, 40], [0, 20], [10, 5]]);
  const player = { position: new Vector3(50, 0, -50), head: new Vector3(50, 1.6, -50), chest: new Vector3(50, 1.3, -50), alive: true, hitTest: () => -1 };
  for (let s = 0; s < 15; s += DT) t.update(DT, player);
  assert.equal(t.driving, false, 'parked');
  assert.ok(Math.hypot(t.position.x - 10, t.position.z - 5) < 0.6, `at the end (${t.position.x.toFixed(1)}, ${t.position.z.toFixed(1)})`);
});

test('its machine gun opens up on a visible target; rifles barely hurt it', () => {
  const t = truckAt(flat, [[0, 1], [0, 0]]);
  const shots = [];
  t.onFire = (s) => shots.push(s);
  const pos = new Vector3(0, 0, -40);
  const player = { position: pos, head: new Vector3(0, 1.6, -40), chest: new Vector3(0, 1.3, -40), alive: true, hitTest: () => -1 };
  for (let s = 0; s < 4; s += DT) t.update(DT, player);
  assert.ok(shots.length > 5, `fired (${shots.length} rounds)`);
  assert.ok(shots.every((s) => s.shooter === t && s.dir.z < -0.9), 'toward the target');
  for (let i = 0; i < 20; i++) t.takeHit('vehicle', new Vector3(0, 0, 1), null);
  assert.ok(t.health >= DIFFICULTY.truck.health - 20 * DIFFICULTY.truck.bulletDamage);
  assert.ok(t.alive, '20 rifle hits: still going');
  // Its box stops rays and pushes bodies out.
  const h = t.raycast(new Vector3(0, 1, -10), new Vector3(0, 0, 1), 20);
  assert.ok(h && Math.abs(h.distance - (10 + t.position.z - 2.6)) < 0.05, 'ray hits the front');
  const p = t.position.clone().add(new Vector3(0.2, 0, 0.5));
  t.pushOut(p, 0.3);
  assert.ok(Math.abs(p.x - t.position.x) >= 1.3 - 1e-6 || Math.abs(p.z - t.position.z) >= 2.9 - 1e-6, 'pushed out of the footprint');
});

test('a rocket kills the truck (through the enemy manager) and it reports the kill', () => {
  const world = makeWorld();
  const nav = new NavGrid(world, { minX: -20, maxX: 20, minZ: -20, maxZ: 20 }).build();
  const m = new EnemyManager({ scene: { add() {} }, world, nav, cover: new CoverPoints(world, nav).generate(), audio: { shotAt() {}, crack() {} }, impacts: { add() {} }, health: { damage() {} }, spawns: [] });
  const truck = m.spawnTruck(DIFFICULTY.truck, [new Vector3(0, 0, 1), new Vector3(0, 0, 0)], new Vector3(0, 0, -30));
  let destroyed = 0;
  const kills = [];
  m.onVehicleDestroyed = () => destroyed++;
  m.onEnemyKilled = (e) => kills.push(e);
  const sim = new RocketSim(world, LAUNCHER);
  sim.targets = { raycast: (o, d, max) => m.raycast(o, d, max) };
  const player = { position: new Vector3(0, 0, -30), hitTest: () => -1, alive: true };
  sim.onImpact = (r, p, n, t) => {
    if (t) m.applyDamage(t.enemy, DIFFICULTY.truck.rocketDirect, new Vector3(0, 0, 1), player);
    m.explode(p, LAUNCHER.blastRadius, LAUNCHER.blastDamage, player);
  };
  sim.spawn(new Vector3(0, 1.2, -25), new Vector3(0, 0, 1), LAUNCHER.rocketSpeed);
  for (let t = 0; t < 1; t += DT) sim.update(DT);
  assert.equal(truck.alive, false, 'one direct hit destroys it');
  assert.equal(destroyed, 1);
  assert.deepEqual(kills, [truck]);
  assert.equal(m.kills, 1, "counted as the player's kill");
});
