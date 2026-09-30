import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLAYER } from '../src/player/config.js';
import { box, makePlayer, makeWorld, simulate } from './helpers.js';

const R = PLAYER.radius;
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test('a tall wall stops the player without climbing or jitter', () => {
  // Wall face at z = -2.5.
  const world = makeWorld((g) => box(g, { z: -3, w: 6, h: 3, d: 1 }));
  const p = makePlayer(world);
  const zs = [];
  simulate(p, { forward: 1, sprint: true }, 2, (s) => zs.push(s.z));
  assert.ok(p.position.z > -2.5 + R - 0.02, `z=${p.position.z}`);
  assert.ok(near(p.position.y, 0));
  assert.equal(p.grounded, true);
  // Resting against the wall: last half second should be perfectly still.
  const tail = zs.slice(-60);
  assert.ok(Math.max(...tail) - Math.min(...tail) < 1e-4, 'no jitter against the wall');
});

test('slides along a wall hit at an angle', () => {
  const world = makeWorld((g) => box(g, { z: -3, w: 20, h: 3, d: 1 }));
  const p = makePlayer(world);
  simulate(p, { forward: 1, right: 1 }, 2);
  assert.ok(p.position.x > 3, `slid to x=${p.position.x}`);
  assert.ok(p.position.z > -2.5 + R - 0.02);
});

test('walks up onto a low step without jumping', () => {
  for (const h of [0.15, 0.3]) {
    const world = makeWorld((g) => box(g, { z: -6, w: 4, h, d: 8 }));
    const p = makePlayer(world);
    simulate(p, { forward: 1 }, 1.5);
    assert.ok(near(p.position.y, h), `h=${h} y=${p.position.y}`);
    assert.equal(p.grounded, true);
  }
});

test('a box taller than the step height blocks walking', () => {
  const world = makeWorld((g) => box(g, { z: -3, w: 4, h: 0.6, d: 2 }));
  const p = makePlayer(world);
  simulate(p, { forward: 1 }, 1.5);
  assert.ok(near(p.position.y, 0));
  assert.ok(p.position.z > -2 + R - 0.02, `z=${p.position.z}`);
});

test('jumps onto a 0.9 m box', () => {
  const world = makeWorld((g) => box(g, { z: -6, w: 4, h: 0.9, d: 8 }));
  const p = makePlayer(world);
  simulate(p, (i) => ({ forward: 1, jump: i === 30 }), 2);
  assert.ok(near(p.position.y, 0.9), `y=${p.position.y}`);
  assert.equal(p.grounded, true);
});

test('a 1.3 m box needs a crouch-jump', () => {
  const build = (g) => box(g, { z: -6, w: 4, h: 1.3, d: 8 });

  const plain = makePlayer(makeWorld(build));
  simulate(plain, (i) => ({ forward: 1, jump: i === 30 }), 2);
  assert.ok(near(plain.position.y, 0), 'plain jump falls short');

  const tucked = makePlayer(makeWorld(build));
  simulate(tucked, (i) => ({ forward: 1, jump: i === 30, crouch: i === 45 }), 2);
  assert.ok(near(tucked.position.y, 1.3), `y=${tucked.position.y}`);
  assert.equal(tucked.crouched, true);
});

test('crouch tunnel: blocked standing, passable crouched, cannot stand up inside', () => {
  // Slab from z=-2 to z=-5 with its underside at 1.3 m.
  const world = makeWorld((g) => box(g, { z: -3.5, bottom: 1.3, w: 4, h: 0.3, d: 3 }));

  const standing = makePlayer(world);
  simulate(standing, { forward: 1 }, 2);
  assert.ok(standing.position.z > -2 + R - 0.05, `standing stopped at z=${standing.position.z}`);

  const p = makePlayer(world);
  simulate(p, { crouch: true }, 0.2);
  simulate(p, { forward: 1 }, 1.8); // ~3.6 m in, under the slab
  assert.ok(p.position.z < -3 && p.position.z > -5, `z=${p.position.z}`);
  simulate(p, { crouch: true }, 0.3); // try to stand
  assert.equal(p.crouched, true, 'no room to stand');
  simulate(p, { forward: 1 }, 1.5); // walk out the far side
  assert.ok(p.position.z < -5.5);
  assert.equal(p.crouched, false, 'stands up automatically once there is room');
});

test('walks up and down a 20 degree ramp staying grounded', () => {
  const angle = (20 * Math.PI) / 180;
  const world = makeWorld((g) => {
    box(g, { z: -6, bottom: -0.1, w: 3, h: 0.2, d: 8, rotX: angle }); // rises toward -Z
    box(g, { z: -16, w: 3, h: 1.7, d: 12 }); // landing platform at the top
  });
  const p = makePlayer(world);
  simulate(p, {}, 0.1); // settle
  let airborne = 0;
  simulate(p, { forward: 1 }, 4, (s) => {
    if (!s.grounded) airborne++;
  });
  assert.ok(p.position.y > 1.3, `reached y=${p.position.y}`);
  assert.equal(airborne, 0, 'never left the ground going up');
  p.yaw = Math.PI; // turn around and walk back down
  airborne = 0;
  simulate(p, { forward: 1, sprint: true }, 3, (s) => {
    if (!s.grounded) airborne++;
  });
  assert.ok(near(p.position.y, 0), `y=${p.position.y}`);
  assert.equal(airborne, 0, 'stayed glued to the ramp going down');
});

test('cannot walk up a 60 degree slope', () => {
  const angle = (60 * Math.PI) / 180;
  const world = makeWorld((g) => box(g, { z: -6, bottom: -0.1, w: 3, h: 0.2, d: 8, rotX: angle }));
  const p = makePlayer(world);
  simulate(p, { forward: 1 }, 3);
  assert.ok(p.position.y < 0.05, `y=${p.position.y}`);
});

test('climbs a staircase smoothly', () => {
  const rise = 0.18;
  const run = 0.3;
  const world = makeWorld((g) => {
    for (let i = 0; i < 8; i++) box(g, { z: -2 - run * i - run / 2, w: 2, h: rise * (i + 1), d: run });
    box(g, { z: -2 - run * 8 - 5, w: 2, h: rise * 8, d: 10 });
  });
  const p = makePlayer(world);
  simulate(p, {}, 0.1); // settle
  let airborne = 0;
  simulate(p, { forward: 1 }, 3, (s) => {
    if (!s.grounded) airborne++;
  });
  assert.ok(near(p.position.y, rise * 8), `y=${p.position.y}`);
  assert.equal(airborne, 0);
});

test('small drops are followed, big drops are a fall with a landing', () => {
  const small = makePlayer(makeWorld((g) => box(g, { z: -1, w: 4, h: 0.3, d: 4 })), 0, 0.3, 0);
  simulate(small, {}, 0.1); // settle
  let airborne = 0;
  simulate(small, { forward: 1 }, 1.5, (s) => {
    if (!s.grounded) airborne++;
  });
  assert.ok(near(small.position.y, 0));
  assert.equal(airborne, 0, 'stepped down without falling');

  const big = makePlayer(makeWorld((g) => box(g, { z: -1, w: 4, h: 1.5, d: 4 })), 0, 1.5, 0);
  let landing = 0;
  simulate(big, { forward: 1 }, 2, () => {
    landing = Math.max(landing, big.landingSpeed);
  });
  assert.ok(near(big.position.y, 0));
  assert.ok(landing > 4, `landing speed ${landing}`);
});

test('coyote time allows a jump just after walking off a ledge', () => {
  const p = makePlayer(makeWorld((g) => box(g, { z: -1, w: 4, h: 1.5, d: 4 })), 0, 1.5, 0);
  let leftAt = -1;
  let jumped = false;
  simulate(p, (i) => {
    if (leftAt < 0 && !p.grounded && p.position.y > 1.4) leftAt = i;
    return { forward: 1, jump: leftAt >= 0 && i === leftAt + 6 };
  }, 1, () => {
    if (p.jumped) jumped = true;
  });
  assert.ok(leftAt >= 0);
  assert.equal(jumped, true);
});

test('respawns after falling out of the world', () => {
  const world = makeWorld();
  const p = makePlayer(world, 0, 0, 0);
  p.position.set(500, 0, 500); // off the edge of the ground
  p.grounded = false;
  let respawned = false;
  simulate(p, {}, 3, () => {
    if (p.teleported) respawned = true;
  });
  assert.equal(respawned, true);
  assert.ok(Math.hypot(p.position.x, p.position.z) < 1e-6);
});
