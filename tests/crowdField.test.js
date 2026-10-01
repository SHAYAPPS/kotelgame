// The Selichot crowd's field (story/crowd/CrowdField.js) without a browser: flow fields on the navmesh, arrivals through
// the evening, making way for the player and glancing at him, and the run for the exits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NavGrid } from '../src/ai/NavGrid.js';
import { flowField, flowStep } from '../src/ai/FlowField.js';
import { ACT, CROWD, CrowdField, zoneSpots } from '../src/story/crowd/CrowdField.js';
import { box, makeWorld } from './helpers.js';

// A walled yard: a wall across x = 0 from z = -15 to z = 8 (a gap at the north end).
function yard() {
  const world = makeWorld((g) => box(g, { x: 0, z: -3.5, w: 0.6, h: 3, d: 23 }));
  return new NavGrid(world, { minX: -15, maxX: 15, minZ: -15, maxZ: 15 }).build();
}

let seq = 0;
const rand = () => {
  seq = (seq * 16807 + 12345) % 2147483647;
  return seq / 2147483647;
};

test('a flow field leads around the wall, through the gap, to the nearest target', () => {
  const nav = yard();
  const dist = flowField(nav, [nav.nodeAt(8, -10)]);
  const from = nav.nodeAt(-8, -10);
  assert.ok(Number.isFinite(dist[from]));
  assert.ok(dist[from] > 30, `walks around (${dist[from].toFixed(1)} m, 16 m straight)`);
  // Following the field from behind the wall gets there.
  const p = { x: -8, z: -10 };
  const step = { x: 0, z: 0, d: 0 };
  let steps = 0;
  while (steps++ < 2000) {
    flowStep(nav, dist, p.x, p.z, step);
    if (step.d < 0.8) break;
    p.x += step.x * 0.1;
    p.z += step.z * 0.1;
  }
  assert.ok(Math.hypot(p.x - 8, p.z + 10) < 1.5, `arrived (${p.x.toFixed(1)}, ${p.z.toFixed(1)})`);
  assert.ok(steps < 600, `without wandering (${steps} steps of 0.1 m)`);
  // Two targets: each point heads for its nearer one.
  const two = flowField(nav, [nav.nodeAt(-12, -12), nav.nodeAt(12, -12)]);
  flowStep(nav, two, -10, -5, step);
  assert.ok(step.x < 0, 'west side: to the west target');
});

test('people arrive through the evening: out of view simply there, in view walking in', () => {
  const nav = yard();
  const f = new CrowdField(nav, { rand });
  f.field('in:yard', [[-5, 0]]);
  const early = f.add({ type: 0, outfit: 0, x: -10, z: 5, act: ACT.pray, arriveAt: 0, entry: 'in:yard', from: [-12, 12] });
  const late = f.add({ type: 0, outfit: 0, x: -6, z: -6, act: ACT.stand, arriveAt: 60, entry: 'in:yard', from: [-12, 12] });
  const far = { x: 30, z: 30 };
  f.update(0.1, far, far);
  assert.equal(early.state, 'stay');
  assert.equal(late.state, 'off', 'not yet');
  assert.equal(f.present, 1);
  for (let i = 0; i < 30; i++) f.update(0.1, far, far);
  assert.equal(early.fade, 1, 'faded in');
  // The late one arrives while the player watches its spot: it walks in from the entrance.
  const watcher = { x: -6, z: -9 };
  for (let t = 0; t < 70; t += 0.1) f.update(0.1, watcher, watcher);
  assert.notEqual(late.state, 'off');
  assert.equal(late.act === ACT.walk || late.state === 'stay', true);
  for (let t = 0; t < 40 && late.state !== 'stay'; t += 0.1) f.update(0.1, watcher, watcher);
  assert.equal(late.state, 'stay', 'walked to its spot');
  assert.ok(Math.hypot(late.x - late.hx, late.z - late.hz) < 0.8);
});

test('the crowd makes way for the player, glances at him, and he cannot walk through it', () => {
  const nav = yard();
  const f = new CrowdField(nav, { rand });
  const people = [];
  for (let i = 0; i < 12; i++) people.push(f.add({ type: 0, outfit: 0, x: -10 + i * 0.9, z: 10, act: ACT.pray, yaw: 0 }));
  const p = { x: -14, z: 10.3 };
  let maxDodge = 0;
  let glanced = 0;
  for (let t = 0; t < 12; t += 0.05) {
    p.x += 0.07; // walking along the row
    f.update(0.05, p, p);
    f.pushOut(p);
    for (const m of people) {
      maxDodge = Math.max(maxDodge, Math.hypot(m.dx, m.dz));
      if (Math.abs(m.lookTarget) > 0.05) glanced++;
      if (m.fade >= 0.5) assert.ok(Math.hypot(p.x - m.x, p.z - m.z) > CROWD.personal + 0.3, 'never inside someone');
    }
  }
  assert.ok(maxDodge > 0.2 && maxDodge <= CROWD.maxDodge + 1e-6, `stepped aside (${maxDodge.toFixed(2)} m)`);
  assert.ok(glanced > 0, 'some looked at him');
  // He's gone: they go back to their spots.
  for (let t = 0; t < 12; t += 0.1) f.update(0.1, { x: 100, z: 100 }, { x: 100, z: 100 });
  for (const m of people) assert.ok(Math.hypot(m.dx, m.dz) < 0.05);
});

test('the sirens: everyone runs to the nearest exit and is gone; fast-forward empties the plaza', () => {
  const nav = yard();
  const f = new CrowdField(nav, { rand });
  const spots = zoneSpots(nav, [-12, -2, -12, 12], 1.2, rand);
  assert.ok(spots.length > 60, `${spots.length} spots`);
  for (const [x, z] of spots) f.add({ type: 0, outfit: 0, x, z, act: ACT.stand });
  const away = { x: 50, z: 50 };
  f.update(0.1, away, away);
  assert.equal(f.present, spots.length);
  f.evacuate([{ name: 'out:ne', points: [[12, 12]] }, { name: 'out:sw', points: [[-13, -13]] }]);
  let maxSpeed = 0;
  for (let t = 0; t < 60 && f.present > 0; t += 0.1) {
    const before = f.members.map((m) => [m.x, m.z]);
    f.update(0.1, away, away);
    f.members.forEach((m, i) => (maxSpeed = Math.max(maxSpeed, Math.hypot(m.x - before[i][0], m.z - before[i][1]) / 0.1)));
  }
  assert.equal(f.present, 0, 'all out');
  assert.ok(maxSpeed > 2, `running (${maxSpeed.toFixed(1)} m/s)`);
  f.reset(0);
  f.update(0.1, away, away);
  assert.equal(f.present, spots.length, 'a checkpoint restart brings them back');
  f.evacuate([{ name: 'out:ne', points: [[12, 12]] }], { fast: true });
  f.update(0.1, away, away);
  assert.equal(f.present, 0, 'fast-forwarded: gone at once');
});
