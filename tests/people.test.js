// The Selichot night's people (src/story/people.js, Npc.js): what they say, what they do on
// their own (notes into the wall, walking away backwards), how they react to the player
// (making way, greeting him), and the run at the sirens (the shelter or the nearest exit;
// people on duty stay).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { NpcManager } from '../src/story/Npc.js';
import { EXCHANGES, GREETINGS, PEOPLE, SPECIALS, exchangeFor, greetingFor, react, speakerOf } from '../src/story/people.js';
import { LINES, SPEAKERS } from '../src/story/text.he.js';
import { PlayerController } from '../src/player/PlayerController.js';
import { makeWorld, DT } from './helpers.js';

const world = makeWorld();
const nav = { nodeAt: () => 0, y: [0], findPath: (a, b) => [a.clone(), b.clone()] };

function seeded(seed) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}

test('every kind has a speaker, every greeting / exchange / special line exists', () => {
  for (const [kind, p] of Object.entries(PEOPLE)) {
    assert.ok(SPEAKERS[p.speaker], `${kind} speaker`);
    if (p.speakerF) assert.ok(SPEAKERS[p.speakerF], `${kind} speakerF`);
  }
  for (const list of Object.values(GREETINGS)) for (const id of list) assert.ok(LINES[id], id);
  for (const list of Object.values(EXCHANGES)) for (const ex of list) for (const id of ex) assert.ok(LINES[id], id);
  for (const list of Object.values(SPECIALS)) for (const l of list) assert.ok(LINES[l.id], l.id);
  assert.equal(speakerOf({ kind: 'family', sex: 'f' }), 'mom');
  assert.equal(speakerOf({ kind: 'family', sex: 'm' }), 'dad');
});

test('E: a special exchange once, then the ordinary ones by kind, in turn', () => {
  const n = { kind: 'elder', sex: 'm', special: 'blessing' };
  const first = exchangeFor(n, seeded(1));
  assert.equal(first[0].id, 'sp_bless_1');
  assert.ok(first.some((l) => l.act === 'reach_out'), 'the blessing has its gesture');
  const a = exchangeFor(n, seeded(1));
  assert.ok(a[0].id.startsWith('ex_elder'), 'then an ordinary exchange');
  const w = { kind: 'worshipperWoman', sex: 'f' };
  const x = exchangeFor(w, seeded(2))[0].id;
  const y = exchangeFor(w, seeded(2))[0].id;
  assert.notEqual(x, y, 'the next one each time');
  assert.ok(LINES[greetingFor(w, seeded(3))], 'a greeting');
});

test('a person standing in the way steps aside, comes back, and greets the player once', () => {
  const npcs = new NpcManager({ world, nav, rand: seeded(7) });
  const n = npcs.spawn({ kind: 'civilian', at: [0, 0, 0], yaw: 0, sex: 'm' });
  const player = new PlayerController(world);
  player.setSpawn(new Vector3(0, 0, 3), 0);
  const ctx = { rand: () => 0.1 };
  let greeted = 0;
  // Walking straight at them.
  for (let i = 0; i < 2 / DT; i++) {
    player.velocity.set(0, 0, -1.4);
    player.position.z = Math.max(0.95, player.position.z - 1.4 * DT);
    if (react(n, DT, player, null, ctx)) greeted++;
    npcs.update(DT, { position: player.position }, player);
  }
  assert.ok(Math.hypot(n.position.x, n.position.z) > 0.6, `stepped aside (${n.position.x.toFixed(2)}, ${n.position.z.toFixed(2)})`);
  assert.equal(greeted, 1, 'greeted once');
  // The player walks off: back to their spot.
  player.position.set(0, 0, 20);
  player.velocity.set(0, 0, 0);
  for (let i = 0; i < 8 / DT; i++) {
    react(n, DT, player, null, ctx);
    npcs.update(DT, { position: player.position }, player);
  }
  assert.ok(Math.hypot(n.position.x, n.position.z) < 0.55, `back home (within a route's arrival radius) (${n.position.x.toFixed(2)}, ${n.position.z.toFixed(2)})`);
});

test('a note into the wall: walk up, reach into the stones, back away facing the wall, pray', () => {
  const npcs = new NpcManager({ world, nav, rand: seeded(4) });
  const n = npcs.spawn({ kind: 'worshipper', at: [-4, 0, 0], yaw: -Math.PI / 2, behavior: 'notes' });
  const player = { position: new Vector3(-30, 0, 0) };
  const body = new PlayerController(world);
  body.setSpawn(new Vector3(-30, 0, 0), 0);
  const seen = new Set();
  let backward = false;
  for (let i = 0; i < 40 / DT; i++) {
    npcs.update(DT, player, body);
    if (n.act) seen.add(n.act.clip);
    if (n.route?.backward && !n.arrived) backward = true;
    if (n.pray) break;
  }
  assert.ok(seen.has('wall_reach'), 'reached into the wall');
  assert.ok(backward, 'walked back facing the wall');
  assert.ok(n.pray, 'praying again');
  assert.ok(Math.abs(n.facing + Math.PI / 2) < 0.2, 'facing the wall');
});

test('at the sirens: the nearest of the shelter and the exits; out of an exit they are gone; police stay', () => {
  const npcs = new NpcManager({ world, nav, rand: seeded(9) });
  const nearExit = npcs.spawn({ kind: 'civilian', at: [20, 0, 0] });
  const nearShelter = npcs.spawn({ kind: 'tourist', at: [-2, 0, 0] });
  const police = npcs.spawn({ kind: 'police', at: [5, 0, 5] });
  const spots = [new Vector3(-6, 0, 0), new Vector3(-6, 0, 1)];
  npcs.panic(spots, { exits: [[24, 0]], maxDelay: 0.1 });
  assert.ok(police.act?.clip === 'wave' && !police.fleeing, 'the officer stays, waving people on');
  const body = new PlayerController(world);
  body.setSpawn(new Vector3(0, 0, 30), 0);
  for (let i = 0; i < 20 / DT; i++) npcs.update(DT, { position: body.position }, body);
  assert.ok(!npcs.list.includes(nearExit), 'out through the exit: gone');
  assert.ok(nearShelter.sheltered, 'the other one in the shelter');
  assert.equal(npcs.civiliansOutside, 0, 'nobody left outside (the officer does not count)');
});
