import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createKotelLevel, groundY } from '../src/world/kotel/KotelLevel.js';
import { KOTEL } from '../src/world/kotel/config.js';
import { CollisionWorld } from '../src/world/CollisionWorld.js';
import { PlayerController } from '../src/player/PlayerController.js';

const DT = 1 / 120;
const level = createKotelLevel();
const world = new CollisionWorld().build(level.collisionRoots);

function playerAt(x, z, y = groundY(x, z)) {
  const p = new PlayerController(world);
  p.setSpawn(new Vector3(x, y, z), 0);
  for (let i = 0; i < 30; i++) p.update(DT, { forward: 0, right: 0 });
  return p;
}

/** Walks toward (tx, tz) for up to `seconds`, re-aiming every step. */
function walkTo(p, tx, tz, seconds = 30, sprint = false) {
  for (let i = 0; i < seconds / DT; i++) {
    const dx = tx - p.position.x;
    const dz = tz - p.position.z;
    if (Math.hypot(dx, dz) < 0.3) return true;
    p.yaw = Math.atan2(-dx, -dz);
    p.update(DT, { forward: 1, right: 0, sprint });
  }
  return false;
}

test('spawn is on the ground at the checkpoint', () => {
  const p = playerAt(level.spawn.position.x, level.spawn.position.z, level.spawn.position.y);
  assert.equal(p.grounded, true);
  assert.ok(Math.abs(p.position.y - KOTEL.south.level) < 1e-3);
});

test('route: checkpoint -> plaza -> men\'s opening -> touch the wall', () => {
  const p = playerAt(level.spawn.position.x, level.spawn.position.z, level.spawn.position.y);
  const [o0, o1] = KOTEL.prayer.openings[0];
  const oz = (o0 + o1) / 2;
  assert.ok(walkTo(p, -67.5, 40), 'up the corridor onto the plaza');
  assert.ok(walkTo(p, -40, oz), 'down the terraces');
  assert.ok(walkTo(p, -25, oz), 'through the opening');
  walkTo(p, 5, oz, 6); // into the wall
  assert.ok(p.position.x > -0.5 && p.position.x < -0.2, `stopped at the wall, x=${p.position.x}`);
  assert.ok(Math.abs(p.position.y) < 1e-3);
});

test('the back fence blocks outside the openings', () => {
  const p = playerAt(-40, 0);
  walkTo(p, -20, 0, 6);
  assert.ok(p.position.x < -KOTEL.prayer.depth, `x=${p.position.x}`);
});

test('the mechitza separates the sections', () => {
  const p = playerAt(-10, 10);
  walkTo(p, -10, 25, 6);
  assert.ok(p.position.z < KOTEL.prayer.mechitzaZ, `z=${p.position.z}`);
});

test('the Mughrabi Bridge climbs to the gate, which is blocked', () => {
  const br = KOTEL.mughrabi;
  const p = playerAt(br.start.x - 2, br.start.z + 1);
  walkTo(p, br.start.x, br.start.z, 5);
  walkTo(p, br.end.x + 5, br.end.z, 40); // past the gate, into the wall
  assert.ok(p.position.y > br.gateY - 0.1, `reached y=${p.position.y}`);
  assert.ok(p.position.x < -1.5, `stopped before the gate, x=${p.position.x}`);
});

test('the top of the Jewish Quarter stairs is closed off', () => {
  const s = KOTEL.stairs;
  const z = (s.z[0] + s.z[1]) / 2;
  const p = playerAt(-100, z);
  walkTo(p, -200, z, 20);
  const top = KOTEL.plaza.terraces.reduce((a, t) => a + t.rise, 0) + s.flights * s.stepsPerFlight * s.rise;
  assert.ok(Math.abs(p.position.y - top) < 0.05, `on the top landing, y=${p.position.y}`);
  assert.ok(p.position.x > -140, `blocked, x=${p.position.x}`);
});

test('the dig south of the prayer area is fenced off', () => {
  const p = playerAt(-52, 45);
  walkTo(p, -20, 45, 8);
  assert.ok(p.position.x < KOTEL.dig.x[0], `x=${p.position.x}`);
  const q = playerAt(-10, 25);
  walkTo(q, -10, 45, 6);
  assert.ok(q.position.z < KOTEL.wall.prayerZ[1] + 0.5, `z=${q.position.z}`);
});

test('the Dung Gate end of the corridor is closed', () => {
  const p = playerAt(-67.5, 95);
  walkTo(p, -67.5, 130, 8);
  assert.ok(p.position.z < KOTEL.south.z[1], `z=${p.position.z}`);
});

test('bullets hit the wall face', () => {
  const hit = world.raycast(new Vector3(-20, 1.6, 0), new Vector3(1, 0, 0), 100, { point: new Vector3(), normal: new Vector3(), distance: 0 });
  assert.ok(hit && Math.abs(hit.point.x) < 0.05);
});
