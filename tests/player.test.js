import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLAYER } from '../src/player/config.js';
import { makePlayer, makeWorld, simulate } from './helpers.js';

// The player spawns at the origin facing -Z, so "forward" walks toward -Z.

test('stands still on flat ground without drifting', () => {
  const p = makePlayer(makeWorld());
  simulate(p, {}, 2);
  assert.equal(p.grounded, true);
  assert.ok(Math.abs(p.position.y) < 1e-6, `y=${p.position.y}`);
  assert.ok(Math.hypot(p.position.x, p.position.z) < 1e-9);
});

test('walk, sprint and crouch reach their target speeds', () => {
  const walk = makePlayer(makeWorld());
  simulate(walk, { forward: 1 }, 1);
  assert.ok(Math.abs(walk.horizontalSpeed - PLAYER.walkSpeed) < 1e-6);
  assert.ok(walk.position.z < -3.5, `walked to z=${walk.position.z}`);

  const sprint = makePlayer(makeWorld());
  simulate(sprint, { forward: 1, sprint: true }, 1);
  assert.equal(sprint.sprinting, true);
  assert.ok(Math.abs(sprint.horizontalSpeed - PLAYER.sprintSpeed) < 1e-6);

  const back = makePlayer(makeWorld());
  simulate(back, { forward: -1, sprint: true }, 1);
  assert.equal(back.sprinting, false, 'no sprinting backwards');
  assert.ok(Math.abs(back.horizontalSpeed - PLAYER.walkSpeed) < 1e-6);

  const crouch = makePlayer(makeWorld());
  simulate(crouch, (i) => ({ forward: 1, crouch: i === 0 }), 1);
  assert.equal(crouch.crouched, true);
  assert.ok(Math.abs(crouch.horizontalSpeed - PLAYER.crouchSpeed) < 1e-6);
});

test('diagonal input is not faster than straight input', () => {
  const p = makePlayer(makeWorld());
  simulate(p, { forward: 1, right: 1 }, 1);
  assert.ok(Math.abs(p.horizontalSpeed - PLAYER.walkSpeed) < 1e-6);
});

test('stops quickly when input is released', () => {
  const p = makePlayer(makeWorld());
  simulate(p, { forward: 1, sprint: true }, 1);
  simulate(p, {}, 0.3);
  assert.equal(p.horizontalSpeed, 0);
});

test('jump reaches the configured height and lands', () => {
  const p = makePlayer(makeWorld());
  simulate(p, {}, 0.1);
  let apex = 0;
  let airSteps = 0;
  simulate(p, { jump: true }, 1.2, (s) => {
    apex = Math.max(apex, s.y);
    if (!s.grounded) airSteps++;
  });
  assert.ok(Math.abs(apex - PLAYER.jumpHeight) < 0.02, `apex=${apex}`);
  assert.equal(p.grounded, true);
  assert.ok(Math.abs(p.position.y) < 1e-6);
  const expectedAir = 2 * Math.sqrt((2 * PLAYER.jumpHeight) / PLAYER.gravity);
  assert.ok(Math.abs(airSteps / 120 - expectedAir) < 0.03, `air time ${airSteps / 120}`);
});

test('holding jump does not bunny-hop', () => {
  const p = makePlayer(makeWorld());
  simulate(p, {}, 0.1);
  let jumps = 0;
  simulate(p, (i) => ({ jump: i === 0 }), 2, () => {
    if (p.jumped) jumps++;
  });
  assert.equal(jumps, 1);
});

test('jump pressed just before landing is buffered', () => {
  const p = makePlayer(makeWorld());
  simulate(p, {}, 0.1);
  simulate(p, { jump: true }, 0.2);
  // Wait until we are about to land, then press jump a few steps early.
  let pressedAt = -1;
  let jumpedAgain = false;
  simulate(p, (i) => {
    const falling = p.velocity.y < 0 && p.position.y < 0.08 && pressedAt < 0;
    if (falling) pressedAt = i;
    return { jump: falling };
  }, 1, () => {
    if (p.jumped) jumpedAgain = true;
  });
  assert.ok(pressedAt >= 0);
  assert.equal(jumpedAgain, true);
});

test('jump while crouched stands up instead of jumping (CoD style)', () => {
  const p = makePlayer(makeWorld());
  simulate(p, { crouch: true }, 0.3);
  assert.equal(p.crouched, true);
  simulate(p, { jump: true }, 0.3);
  assert.equal(p.crouched, false);
  assert.equal(p.grounded, true);
});

test('sprinting cancels crouch; crouching while sprinting ends the sprint', () => {
  const p = makePlayer(makeWorld());
  simulate(p, { crouch: true }, 0.2);
  simulate(p, { forward: 1, sprint: true }, 0.5);
  assert.equal(p.crouched, false);
  assert.equal(p.sprinting, true);
  simulate(p, (i) => ({ forward: 1, sprint: true, crouch: i === 0 }), 0.5);
  assert.equal(p.crouched, true);
  assert.equal(p.sprinting, false);
});

test('moveScale slows movement (aiming down sights)', () => {
  const p = makePlayer(makeWorld());
  simulate(p, { forward: 1, moveScale: 0.6 }, 1);
  assert.ok(Math.abs(p.horizontalSpeed - PLAYER.walkSpeed * 0.6) < 1e-6);
});
