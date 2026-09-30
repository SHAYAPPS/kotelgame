// Stairs: bodies stay on the steps (never falling), the drawn height climbs smoothly
// (src/player/StairTracker.js), footsteps and the stair blend know when a body is on stairs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createKotelLevel, groundY } from '../src/world/kotel/KotelLevel.js';
import { KOTEL } from '../src/world/kotel/config.js';
import { CollisionWorld } from '../src/world/CollisionWorld.js';
import { PlayerController } from '../src/player/PlayerController.js';
import { PLAYER } from '../src/player/config.js';
import { StairTracker } from '../src/player/StairTracker.js';

const DT = 1 / 120;
const level = createKotelLevel();
const world = new CollisionWorld().build(level.collisionRoots);
const TERRACE = KOTEL.plaza.terraces[1]; // 12 steps, 1.8 m (x = -78, rising west)

/** A body (like an NPC's) walking in +X (down the terraces) or -X (up) at `speed` along z. */
function walkAcross(fromX, toX, z, speed, onStep) {
  const body = new PlayerController(world, { ...PLAYER, walkSpeed: speed });
  body.setSpawn(new Vector3(fromX, groundY(fromX, z), z), 0);
  for (let i = 0; i < 30; i++) body.update(DT, { forward: 0, right: 0 });
  const dir = Math.sign(toX - fromX);
  body.yaw = dir > 0 ? -Math.PI / 2 : Math.PI / 2; // yaw 0 looks down -Z
  for (let i = 0; i < 20 / DT; i++) {
    body.update(DT, { forward: 1, right: 0 });
    onStep(body, i * DT);
    if ((body.position.x - toX) * dir > 0) break;
  }
  return body;
}

for (const [name, speed] of [['walking', 1.4], ['running', 4.6]]) {
  test(`${name} down and up the terraces: always on the ground, one snap per step`, () => {
    const x0 = TERRACE.x - 6;
    const x1 = TERRACE.x + 6;
    for (const [from, to] of [[x0, x1], [x1, x0]]) {
      let airborne = 0;
      let snaps = 0;
      const body = walkAcross(from, to, 0, speed, (b) => {
        if (!b.grounded) airborne++;
        if (Math.abs(b.feetShift) > 0.05) snaps++;
      });
      assert.equal(airborne, 0, `${from > to ? 'up' : 'down'}: left the ground ${airborne} steps`);
      assert.ok(Math.abs(body.position.x - to) < 1, `got across (${body.position.x.toFixed(2)})`);
      // Every riser is one snap (running may take a riser and the next landing together).
      assert.ok(snaps >= TERRACE.steps * (speed > 3 ? 0.5 : 0.9) && snaps <= TERRACE.steps + 1, `snaps ${snaps}`);
    }
  });
}

test('the drawn height climbs a flight smoothly and catches up at the top', () => {
  const t = new StairTracker();
  const rise = 0.15;
  const every = 0.27; // a step at 1.3 m/s on 0.35 m treads
  const dt = 1 / 60;
  let y = 0;
  let next = every;
  let prevDrawn = 0;
  let prevVel = 0;
  let maxErr = 0;
  let maxAccel = 0;
  for (let time = 0; time < 5; time += dt) {
    const climbing = time < 12 * every;
    if (climbing && time >= next) {
      y += rise;
      next += every;
    }
    t.update(dt, y, true, climbing ? 1.3 : 0);
    const drawn = y + t.offset;
    const vel = (drawn - prevDrawn) / dt;
    if (time > 0.1) maxAccel = Math.max(maxAccel, Math.abs(vel - prevVel) / dt);
    if (climbing && time > 3 * every) {
      const ramp = (time / every) * rise - rise / 2; // the flight as a slope
      maxErr = Math.max(maxErr, Math.abs(drawn - ramp));
      assert.ok(t.amount > 0.8 && t.dir === 1, 'on stairs, going up');
    }
    assert.ok(vel > -0.05 || !climbing, `never drops back while climbing (${vel.toFixed(2)} m/s)`);
    prevDrawn = drawn;
    prevVel = vel;
  }
  assert.ok(maxErr < 0.12, `follows the flight (max off ${maxErr.toFixed(3)} m)`);
  assert.ok(maxAccel < 60, `no jerks (max accel ${maxAccel.toFixed(1)} m/s²)`);
  assert.ok(Math.abs(t.offset) < 0.01, 'caught up at the top');
  assert.ok(t.amount < 0.05, 'off the stairs');
});

test('slopes and teleports are not stairs', () => {
  const t = new StairTracker();
  for (let i = 0; i < 120; i++) t.update(1 / 60, i * 0.01, true, 1.3); // a ramp: 1 cm a frame
  assert.equal(t.steps, 0);
  assert.ok(Math.abs(t.offset) < 1e-6 && t.amount === 0);
  t.update(1 / 60, 30, true, 0); // respawned far away
  assert.equal(t.steps, 0);
  assert.ok(Math.abs(t.offset) < 1e-6);
});

test('the player\'s view climbs the terraces smoothly (no jerk per step)', async () => {
  const { PlayerCamera } = await import('../src/player/PlayerCamera.js');
  const { PerspectiveCamera } = await import('three');
  const body = new PlayerController(world);
  const x0 = TERRACE.x + 5;
  body.setSpawn(new Vector3(x0, groundY(x0, 0), 0), 0);
  for (let i = 0; i < 30; i++) body.update(DT, { forward: 0, right: 0 });
  const view = new PlayerCamera(new PerspectiveCamera(), body);
  view.yaw = Math.PI / 2; // west: up the terrace
  view.snap();
  let prevY = null;
  let prevV = null;
  let maxAccel = 0;
  let steps = 0;
  for (let i = 0; i < 9 / DT; i++) {
    body.yaw = view.yaw;
    body.update(DT, { forward: 1, right: 0 });
    view.fixedUpdate(DT);
    if (Math.abs(body.feetShift) > 0.05) steps++;
    // The view's height without the head bob (what the stairs do to it).
    const y = body.position.y + view.eyeHeight + view.steps.offset;
    if (prevY !== null) {
      const v = (y - prevY) / DT;
      if (prevV !== null && i > 60) maxAccel = Math.max(maxAccel, Math.abs(v - prevV) / DT);
      prevV = v;
    }
    prevY = y;
  }
  assert.ok(steps >= TERRACE.steps * 0.9, `climbed ${steps} steps`);
  // Before: each 15 cm step came through at 14/s (a jolt of several m/s² per step).
  assert.ok(maxAccel < 40, `smooth: max vertical accel ${maxAccel.toFixed(1)} m/s²`);
});
