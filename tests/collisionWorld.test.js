import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { Capsule } from 'three/addons/math/Capsule.js';
import { box, makeWorld } from './helpers.js';

const hit = () => ({ point: new Vector3(), normal: new Vector3(), distance: 0 });

test('faces lying exactly on grid cell borders are not lost', () => {
  // Cell size is 2 m, so these boxes have faces on cell borders at x=0/2 and z=-2/-4.
  const world = makeWorld((g) => {
    box(g, { x: 1, z: -3, w: 2, h: 1.44, d: 2 });
    box(g, { x: -1, z: -3, w: 2, h: 2, d: 2 });
  });
  const down = new Vector3(0, -1, 0);
  for (const [x, z, y] of [[0.5, -2.5, 1.44], [1.99, -3.99, 1.44], [0.01, -2.01, 1.44], [-0.01, -2.01, 2]]) {
    const h = world.raycast(new Vector3(x, 5, z), down, 10, hit());
    assert.ok(h, `miss at ${x},${z}`);
    assert.ok(Math.abs(h.point.y - y) < 1e-4, `at ${x},${z} got y=${h.point.y}`);
  }
});

test('long diagonal rays walk the grid and return the nearest hit', () => {
  const world = makeWorld((g) => {
    box(g, { x: 30, z: -30, w: 2, h: 4, d: 2 });
    box(g, { x: 60, z: -60, w: 2, h: 4, d: 2 });
  });
  const dir = new Vector3(1, 0, -1).normalize();
  const h = world.raycast(new Vector3(0, 1, 0), dir, 200, hit());
  assert.ok(h);
  assert.ok(Math.abs(h.point.x - 29) < 1e-3, `hit x=${h.point.x}`);
  assert.ok(h.normal.x < -0.99 || h.normal.z > 0.99, 'hit the near face');
  assert.equal(world.raycast(new Vector3(0, 1, 0), dir, 20, hit()), null, 'respects max distance');
});

test('rays ignore back faces and miss outside the world', () => {
  const world = makeWorld((g) => box(g, { z: -5, w: 2, h: 2, d: 2 }));
  // From inside the box, looking up: its top face is seen from behind.
  assert.equal(world.raycast(new Vector3(0, 1, -5), new Vector3(0, 1, 0), 10, hit()), null);
  assert.equal(world.raycast(new Vector3(500, 5, 500), new Vector3(0, -1, 0), 10, hit()), null);
});

test('capsule queries find nearby triangles only', () => {
  const world = makeWorld((g) => box(g, { x: 20, z: 20, w: 2, h: 2, d: 2 }));
  const cap = new Capsule(new Vector3(0, 0.3, 0), new Vector3(0, 1.5, 0), 0.3);
  const near = world.trianglesNear(cap);
  assert.equal(near.length, 2, 'just the two ground triangles');
  let contacts = 0;
  for (const t of near) if (world.capsuleContact(cap, t)) contacts++;
  assert.equal(contacts, 0, 'resting exactly on the ground is not a penetration');
});
