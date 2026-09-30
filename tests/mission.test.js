import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { Mission } from '../src/story/Mission.js';
import { Dialogue, lineDuration } from '../src/story/Dialogue.js';
import { MISSION1 } from '../src/story/mission1.js';
import { CARDS, HINTS, LINES, OBJECTIVES, SPEAKERS } from '../src/story/text.he.js';
import { StoryDirector } from '../src/story/StoryDirector.js';
import { createKotelLevel } from '../src/world/kotel/KotelLevel.js';
import { CollisionWorld } from '../src/world/CollisionWorld.js';
import { NavGrid } from '../src/ai/NavGrid.js';
import { PlayerController } from '../src/player/PlayerController.js';

const DT = 1 / 120;

/** A context that records what the mission asked for. */
function recorder(overrides = {}) {
  const log = [];
  const rec = (name) => (...args) => log.push([name, ...args]);
  return {
    log,
    player: { x: 0, z: 0 },
    dialogueBusy: false,
    enemies: 0,
    arrived: {},
    reset: rec('reset'),
    playerDistance(x, z) {
      return Math.hypot(this.player.x - x, this.player.z - z);
    },
    enemiesAlive() {
      return this.enemies;
    },
    dialogueIdle() {
      return !this.dialogueBusy;
    },
    npcArrived(id) {
      return !!this.arrived[id];
    },
    objective: rec('objective'),
    hint: rec('hint'),
    dialogue: rec('dialogue'),
    npc: rec('npc'),
    populate: rec('populate'),
    weapon: rec('weapon'),
    sound: rec('sound'),
    ambience: rec('ambience'),
    fade: rec('fade'),
    title: rec('title'),
    endCard: rec('endCard'),
    checkpoint: rec('checkpoint'),
    ...overrides,
  };
}

const SCRIPT = {
  id: 'test',
  steps: [
    { id: 'a', do: [{ type: 'weapon', mode: 'lowered' }, { type: 'dialogue', lines: ['x'] }], until: { timer: 1 } },
    { id: 'b', do: [{ type: 'checkpoint', at: [1, 0, 2] }], until: { reach: [10, 0], radius: 2 } },
    { id: 'c', do: [{ type: 'npc', id: 'cmd', route: { points: [[5, 5]] } }], until: { all: [{ talk: 'cmd' }, { action: 'crouch' }] } },
    { id: 'd', do: [{ type: 'objective', text: 'o' }], until: { any: [{ enemiesDead: true }, { dialogueDone: true }] } },
    { id: 'e', do: [], until: { arrived: 'cmd' } },
  ],
};

test('mission steps advance on their triggers', () => {
  const ctx = recorder();
  const m = new Mission(SCRIPT, ctx);
  m.start();
  assert.equal(m.step.id, 'a');
  m.update(0.5);
  assert.equal(m.step.id, 'a');
  m.update(0.6);
  assert.equal(m.step.id, 'b', 'timer');
  ctx.player = { x: 9, z: 0.5 };
  m.update(DT);
  assert.equal(m.step.id, 'c', 'reach');
  m.notify('talk:cmd');
  m.update(DT);
  assert.equal(m.step.id, 'c', 'all: needs both');
  m.notify('action:crouch');
  ctx.dialogueBusy = true;
  ctx.enemies = 2;
  m.update(DT);
  assert.equal(m.step.id, 'd');
  m.update(DT);
  assert.equal(m.step.id, 'd', 'any: neither yet');
  ctx.dialogueBusy = false;
  m.update(DT);
  assert.equal(m.step.id, 'e');
  ctx.arrived.cmd = true;
  m.update(DT);
  assert.equal(m.finished, true);
});

test('events only count for the step they happen in', () => {
  const ctx = recorder();
  const m = new Mission(SCRIPT, ctx);
  m.jumpTo(2);
  m.notify('talk:cmd');
  m.jumpTo(2); // re-entering clears events
  m.notify('action:crouch');
  m.update(DT);
  assert.equal(m.step.id, 'c');
});

test('jumpTo fast-forwards state and skips presentation', () => {
  const ctx = recorder();
  const m = new Mission(SCRIPT, ctx);
  m.jumpTo(3);
  const kinds = ctx.log.map((e) => e[0]);
  assert.ok(kinds.includes('weapon'), 'state actions replayed');
  assert.ok(!kinds.includes('dialogue'), 'dialogue skipped when fast-forwarding');
  const npc = ctx.log.find((e) => e[0] === 'npc');
  assert.equal(npc[2], true, 'npc route applied in fast mode (placed at its end)');
  assert.equal(m.checkpointIndex, 1, 'checkpoint from step b');
  assert.equal(m.step.id, 'd');
});

test('fail stops the mission until it restarts from the checkpoint', () => {
  const ctx = recorder();
  const m = new Mission(SCRIPT, ctx);
  m.jumpTo(1);
  m.fail('friendlyFire');
  ctx.player = { x: 10, z: 0 };
  m.update(DT);
  assert.equal(m.step.id, 'b', 'frozen while failed');
  m.restartFromCheckpoint();
  assert.equal(m.failed, null);
  assert.equal(m.step.id, 'b');
});

test('dialogue plays lines in order with reading-time durations', () => {
  const started = [];
  const d = new Dialogue({ onLine: (l) => started.push(l.id) });
  d.play(['brief_1', 'brief_2']);
  assert.equal(d.current.id, 'brief_1');
  assert.equal(d.current.name, SPEAKERS.cmd.name);
  const dur = lineDuration(LINES.brief_1.text);
  for (let t = 0; t < dur + 0.05; t += DT) d.update(DT);
  assert.equal(d.current.id, 'brief_2');
  d.play(['radio_1'], { interrupt: true });
  assert.equal(d.current.id, 'radio_1');
  assert.equal(d.current.radio, true);
  assert.deepEqual(started, ['brief_1', 'brief_2', 'radio_1']);
  assert.throws(() => d.play(['no_such_line']));
});

test('mission 1 data: every text id exists and NPCs are spawned before use', () => {
  const spawned = new Set();
  for (const step of MISSION1.steps) {
    assert.ok(step.label, `step ${step.id} has a label for the F2 menu`);
    for (const a of step.do ?? []) {
      if (a.type === 'dialogue') for (const id of a.lines) assert.ok(LINES[id], `line ${id}`);
      if (a.type === 'objective' && a.text) assert.ok(OBJECTIVES[a.text], `objective ${a.text}`);
      if (a.type === 'hint' && a.hint) assert.ok(HINTS[a.hint], `hint ${a.hint}`);
      if ((a.type === 'title' || a.type === 'endCard') && a.card) assert.ok(CARDS[a.card], `card ${a.card}`);
      if (a.type === 'npc') {
        if (a.spawn) spawned.add(a.id);
        else assert.ok(spawned.has(a.id), `npc ${a.id} used in ${step.id} before it is spawned`);
      }
      if (a.type === 'populate') assert.ok(MISSION1.groups[a.group], `group ${a.group}`);
    }
  }
  for (const line of Object.values(LINES)) assert.ok(SPEAKERS[line.speaker], `speaker ${line.speaker}`);
});

// ---------------------------------------------------------------------------
// On the real plaza

const level = createKotelLevel();
const world = new CollisionWorld().build(level.collisionRoots);
const nav = new NavGrid(world, level.navBounds).build();

test('mission 1 routes, reach points and checkpoints are walkable and connected', () => {
  const start = level.spawn.position;
  const check = (x, z, what) => {
    const n = nav.nodeAt(x, z);
    assert.ok(n >= 0, `${what} (${x}, ${z}) is on the navmesh`);
    const p = nav.findPath(start, new Vector3(x, nav.y[n], z));
    assert.ok(p, `${what} (${x}, ${z}) is reachable from the spawn`);
  };
  for (const step of MISSION1.steps) {
    const reach = [step.until].flatMap((u) => (u?.all ?? u?.any ?? [u])).filter((u) => u?.reach);
    for (const r of reach) check(r.reach[0], r.reach[1], `${step.id} reach`);
    for (const a of step.do ?? []) {
      if (a.type === 'checkpoint') check(a.at[0], a.at[2], `${step.id} checkpoint`);
      if (a.type === 'npc' && a.route) for (const [x, z] of a.route.points) check(x, z, `${step.id} ${a.id} route`);
    }
  }
  for (const c of MISSION1.groups.crossers) for (const [x, z] of c.route) check(x, z, 'crosser route');
  for (const [x, z] of MISSION1.groups.tour.guide.route) check(x, z, 'tour route');
});

function fakeHud() {
  const calls = {};
  return new Proxy(calls, {
    get: (target, key) => (key in target ? target[key] : () => {}),
  });
}

test('mission 1 plays through with a scripted player', () => {
  const player = new PlayerController(world);
  player.setSpawn(level.spawn.position, level.spawn.yaw);
  const rifle = { mode: 'ready', onMagCheck: null, get lowered() { return this.mode === 'lowered'; } };
  const story = new StoryDirector({
    script: MISSION1,
    scene: { add() {} },
    world,
    nav,
    player,
    rifle,
    enemies: { enemies: [] },
    audio: { ready: false },
    hud: fakeHud(),
  });
  const info = { position: player.position };
  const idle = { forward: 0, right: 0, jump: false, sprint: false, crouch: false };
  let t = 0;
  const run = (seconds, controls = () => idle) => {
    for (let i = 0; i < seconds / DT; i++) {
      player.update(DT, controls());
      story.update(DT, info);
      t += DT;
    }
  };
  // Walks straight at a point (or at a moving target, e.g. to tag along behind an NPC).
  const walkTo = (x, z, until, maxSeconds = 90, stopAt = 1.2) => {
    const target = typeof x === 'function' ? x : () => [x, z];
    for (let i = 0; i < maxSeconds / DT && !until(); i++) {
      const [tx, tz] = target();
      const dx = tx - player.position.x;
      const dz = tz - player.position.z;
      const near = Math.hypot(dx, dz) < stopAt;
      player.yaw = Math.atan2(-dx, -dz);
      player.update(DT, near ? idle : { ...idle, forward: 1 });
      story.update(DT, info);
    }
  };
  const at = (id) => story.mission.step.id === id;

  story.start();
  assert.equal(rifle.mode, 'lowered', 'weapon lowered for the shift');
  assert.ok(story.npcs.list.length > 25, `crowd spawned (${story.npcs.list.length} NPCs)`);
  run(5);
  assert.ok(at('report'));
  const cmd = story.npcs.get('cmd');
  walkTo(cmd.position.x, cmd.position.z + 1.5, () => false, 6);
  const eye = player.position.clone().add(new Vector3(0, 1.66, 0));
  const dir = new Vector3().subVectors(cmd.position.clone().add(new Vector3(0, 1.4, 0)), eye).normalize();
  story.interact(eye, dir);
  run(0.1);
  assert.ok(at('briefing'), `talked to the commander (step ${story.mission.step.id})`);
  run(40);
  assert.ok(at('tut_sprint'));
  run(1.2, () => ({ ...idle, forward: 1, sprint: true }));
  assert.ok(at('tut_crouch'));
  run(0.2, () => ({ ...idle, crouch: true }));
  run(0.1);
  assert.ok(at('tut_mag'));
  rifle.onMagCheck();
  run(0.1);
  assert.ok(at('patrol_wall'));
  player.wantCrouch = false;

  // Follow the squad to the wall.
  const followCmd = () => [cmd.position.x, cmd.position.z];
  walkTo(followCmd, null, () => at('at_wall'), 120, 2.5);
  assert.ok(at('at_wall'), `reached the wall with the squad (step ${story.mission.step.id}, cmd at ${cmd.position.x.toFixed(1)}, ${cmd.position.z.toFixed(1)}, player at ${player.position.x.toFixed(1)}, ${player.position.z.toFixed(1)})`);
  run(30);
  walkTo(followCmd, null, () => at('radio'), 150, 2.5);
  assert.ok(at('radio'), `reached the terraces (step ${story.mission.step.id})`);
  run(80);
  assert.ok(at('part1_end'), `radio chatter finished, part 1 ends (step ${story.mission.step.id})`);

  // F2-style jump and checkpoint restart put the player at the checkpoint.
  story.jumpTo(story.mission.indexOf('at_wall'));
  assert.ok(Math.hypot(player.position.x + 14, player.position.z + 12.8) < 0.5, 'player at the wall checkpoint');
  assert.ok(story.npcs.get('cmd').position.x > -13, 'commander placed at the wall');
});
