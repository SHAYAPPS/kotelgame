// The crowd (src/story/Npc.js): small-talk groups take turns, people standing still let their
// physics sleep (a big crowd is cheap) and wake when someone bumps into them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { NpcManager, NPC } from '../src/story/Npc.js';
import { PlayerController } from '../src/player/PlayerController.js';
import { makeWorld, DT } from './helpers.js';

const world = makeWorld();
// Flat open ground: every spot walkable, paths straight.
const nav = { nodeAt: () => 0, y: [0], findPath: (a, b) => [a.clone(), b.clone()] };
const player = { position: new Vector3(50, 0, 50) };
const playerBody = new PlayerController(world);
playerBody.setSpawn(new Vector3(50, 0, 50), 0);

function seeded(seed) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}

test('a chat group faces in and takes turns, one talker at a time', () => {
  const npcs = new NpcManager({ world, nav, rand: seeded(7) });
  npcs.populate({ chats: [{ at: [0, 0], kinds: ['civilian', 'tourist', 'civilian'] }] });
  const g = npcs.chats[0];
  assert.equal(g.members.length, 3);
  for (const m of g.members) {
    // Facing the middle (yaw 0 looks down -Z).
    const toMiddle = Math.atan2(m.position.x, m.position.z);
    const diff = Math.atan2(Math.sin(m.faceYaw - toMiddle), Math.cos(m.faceYaw - toMiddle));
    assert.ok(Math.abs(diff) < 1e-6, `faces the middle (${diff})`);
  }
  const talkers = new Set();
  let most = 0;
  for (let i = 0; i < 60 / DT; i++) {
    npcs.update(DT, player, playerBody);
    const now = g.members.filter((m) => m.chatting);
    most = Math.max(most, now.length);
    for (const m of now) talkers.add(m);
  }
  assert.equal(most, 1, 'never two at once');
  assert.equal(talkers.size, 3, 'everyone gets a turn');
});

test('leaving a group (sent somewhere, panicking) ends its part in the talk', () => {
  const npcs = new NpcManager({ world, nav, rand: seeded(3) });
  npcs.populate({ chats: [{ at: [0, 0], kinds: ['civilian', 'civilian'] }] });
  const g = npcs.chats[0];
  const [a, b] = g.members;
  for (let i = 0; i < 10 / DT && !a.chatting; i++) npcs.update(DT, player, playerBody);
  assert.ok(a.chatting, 'a gets to talk');
  a.setRoute({ points: [[10, 0]], speed: 1.4 });
  assert.ok(!a.chatting && !a.chat && g.members.length === 1 && g.talker === null);
  for (let i = 0; i < 20 / DT; i++) npcs.update(DT, player, playerBody);
  assert.ok(!b.chatting, 'nobody left to talk to');
});

test('people standing still sleep; a bump wakes them and they settle again', () => {
  const npcs = new NpcManager({ world, nav, rand: seeded(5) });
  const a = npcs.spawn({ kind: 'civilian', at: [0, 0, 0] });
  for (let i = 0; i < 2 / DT; i++) npcs.update(DT, player, playerBody);
  assert.ok(a._still > NPC.settle, 'asleep');
  const at = a.position.clone();
  let bodyUpdates = 0;
  const update = a.body.update.bind(a.body);
  a.body.update = (...args) => {
    bodyUpdates++;
    return update(...args);
  };
  for (let i = 0; i < 1 / DT; i++) npcs.update(DT, player, playerBody);
  assert.equal(bodyUpdates, 0, 'no physics while asleep');
  assert.ok(a.position.distanceTo(at) < 1e-9, 'stays put');
  // Someone walks right into it.
  const b = npcs.spawn({ kind: 'tourist', at: [-3, 0, 0.2] });
  b.setRoute({ points: [[3, 0.2]], speed: 1.4 });
  let woke = false;
  for (let i = 0; i < 6 / DT; i++) {
    npcs.update(DT, player, playerBody);
    if (a._still === 0) woke = true;
  }
  assert.ok(woke && bodyUpdates > 0, 'the bump woke it');
  assert.ok(a.position.distanceTo(b.position) > 0.5, 'they did not walk through each other');
  for (let i = 0; i < 2 / DT; i++) npcs.update(DT, player, playerBody);
  assert.ok(a._still > NPC.settle, 'asleep again');
});
