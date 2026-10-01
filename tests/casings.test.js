// Spent casings (src/weapons/Casings.js): thrown from the port, they fall, bounce on the
// floor (each impact reported for the clink), then lie still on their side.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene, Vector3 } from 'three';
import { Casings } from '../src/weapons/Casings.js';
import { makeWorld } from './helpers.js';

test('a casing bounces on the floor, each bounce softer, then lies flat', () => {
  const casings = new Casings(new Scene(), makeWorld());
  const bounces = [];
  casings.onBounce = (p, speed) => bounces.push({ y: p.y, speed });
  casings.eject(new Vector3(0, 1.5, 0), new Vector3(3, 1.5, 0.5));
  for (let i = 0; i < 300; i++) casings.update(1 / 60);
  const c = casings.items[0];
  assert.ok(!c.moving, 'came to rest');
  assert.ok(bounces.length >= 2, `bounced (${bounces.length})`);
  assert.ok(bounces[1].speed < bounces[0].speed, 'second impact softer');
  assert.ok(Math.abs(c.p.y) < 0.02, `on the floor (${c.p.y})`);
  assert.ok(c.p.x > 0.5, 'thrown to the side it was ejected');
  // Lying on its side: the case's long axis (local +Y) is horizontal.
  const axis = new Vector3(0, 1, 0).applyQuaternion(c.q);
  assert.ok(Math.abs(axis.y) < 0.05, `lies flat (${axis.y})`);
  assert.equal(casings.mesh.count, 1);
});

test('the pool reuses the oldest casing', () => {
  const casings = new Casings(new Scene(), makeWorld(), 4);
  for (let i = 0; i < 6; i++) casings.eject(new Vector3(i, 1, 0), new Vector3(0, 0, 0));
  casings.update(1 / 60);
  assert.equal(casings.used, 4);
  assert.equal(casings.mesh.count, 4);
  assert.equal(casings.items[0].p.x, 4, 'slot 0 now holds the fifth casing');
});
