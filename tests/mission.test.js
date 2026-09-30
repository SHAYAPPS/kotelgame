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
import { PLAYER } from '../src/player/config.js';
import { ENEMY } from '../src/ai/config.js';
import { CoverPoints } from '../src/ai/CoverPoints.js';
import { EnemyManager } from '../src/ai/EnemyManager.js';
import { GrenadeSim } from '../src/weapons/Grenades.js';
import { GrenadeThrower } from '../src/weapons/GrenadeThrower.js';
import { DIFFICULTY, expandWave } from '../src/story/difficulty.js';

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
  for (const b of MISSION1.groups.bystanders) check(b.at[0], b.at[1], 'bystander');
  for (const [x, z] of MISSION1.shelter.spots) {
    const n = nav.nodeAt(x, z);
    assert.ok(n >= 0 && nav.y[n] < 0.5, `shelter spot (${x}, ${z}) is on the hall floor`);
  }
  // A few spots are enough to prove the hall is connected (every path search is slow-ish).
  for (const [x, z] of MISSION1.shelter.spots.filter((_, i) => i % 17 === 0)) check(x, z, 'shelter spot');
  for (const [name, points] of Object.entries(DIFFICULTY.spawns)) for (const at of points) spawnOk(at, name);
  for (const [name, route] of Object.entries(DIFFICULTY.routes)) for (const [x, z] of route) check(x, z, `${name} route`);
  for (const [name, groups] of Object.entries(DIFFICULTY.waves)) assert.ok(expandWave(groups).length > 0, `wave ${name}`);
  // Ammo crates stand on open floor (their footprint is walkable).
  for (const a of MISSION1.steps.flatMap((st) => st.do ?? []).filter((x) => x.type === 'crate' && !x.remove)) {
    for (const [dx, dz] of [[0, 0], [0.5, 0], [-0.5, 0], [0, 0.3], [0, -0.3]]) {
      const n = nav.nodeAt(a.at[0] + dx, a.at[1] + dz);
      const q = n >= 0 ? nav.nodePosition(n, new Vector3()) : null;
      assert.ok(q && Math.hypot(q.x - a.at[0] - dx, q.z - a.at[1] - dz) < 0.5, `crate ${a.id} footprint on open floor`);
    }
    check(a.at[0] + 1.2, a.at[1], `crate ${a.id} reachable`);
  }
  function spawnOk(at, name) {
    const sp = { at };
    check(sp.at[0], sp.at[1], `wave spawn (${name})`);
    // A body dropped there stands on the floor (not wedged into a wall and pushed through it).
    const n = nav.nodeAt(sp.at[0], sp.at[1]);
    const body = new PlayerController(world, { ...PLAYER, radius: ENEMY.radius });
    body.setSpawn(new Vector3(sp.at[0], nav.y[n], sp.at[1]), 0);
    for (let i = 0; i < 60; i++) body.update(DT, { forward: 0, right: 0, jump: false, sprint: false, crouch: false });
    assert.ok(Math.abs(body.position.y - nav.y[n]) < 0.2, `attacker spawn (${sp.at}) keeps its footing (y ${body.position.y.toFixed(2)})`);
  }
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
  const rifle = { mode: 'ready', onMagCheck: null, state: { ammo: 30, reserve: 150 }, get lowered() { return this.mode === 'lowered'; } };
  const scene = { add() {} };
  const grenadeSim = new GrenadeSim(world, { fuse: DIFFICULTY.grenades.fuse });
  const thrower = new GrenadeThrower({ sim: grenadeSim, config: DIFFICULTY.grenades.player });
  const enemies = new EnemyManager({
    scene,
    world,
    nav,
    cover: new CoverPoints(world, nav).generate(),
    audio: { ready: false, shotAt() {}, crack() {} },
    impacts: { add() {} },
    health: { damage() {} }, // the scripted player can't die
    spawns: [],
  });
  enemies.grenades = grenadeSim;
  let explosions = 0;
  grenadeSim.onExplode = (g) => {
    explosions++;
    enemies.explode(g.position, DIFFICULTY.grenades.radius, DIFFICULTY.grenades.enemyDamage, g.owner === 'player' ? info : g.thrower?.asTarget);
  };
  const story = new StoryDirector({
    script: MISSION1,
    scene,
    world,
    nav,
    player,
    rifle,
    enemies,
    audio: { ready: false },
    hud: fakeHud(),
    grenades: thrower,
  });
  let enemyGrenades = 0;
  const onThrown = enemies.onGrenadeThrown;
  enemies.onGrenadeThrown = (g, e) => {
    enemyGrenades++;
    onThrown(g, e);
  };
  const info = {
    position: player.position,
    head: new Vector3(),
    chest: new Vector3(),
    speed: 0,
    crouched: false,
    firing: false,
    alive: true,
    hitTest: () => -1,
  };
  const idle = { forward: 0, right: 0, jump: false, sprint: false, crouch: false };
  const step = (controls) => {
    player.update(DT, controls);
    info.head.set(player.position.x, player.position.y + 1.65, player.position.z);
    info.chest.set(player.position.x, player.position.y + 1.3, player.position.z);
    enemies.update(DT, info, player);
    grenadeSim.update(DT);
    story.update(DT, info);
  };
  const run = (seconds, controls = () => idle) => {
    for (let i = 0; i < seconds / DT; i++) step(controls());
  };
  const runUntil = (until, maxSeconds) => {
    for (let i = 0; i < maxSeconds / DT && !until(); i++) step(idle);
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
      step(near ? idle : { ...idle, forward: 1 });
    }
  };
  const teleport = (x, y, z) => {
    player.spawnPoint.set(x, y, z);
    player.respawn();
  };
  const at = (id) => story.mission.step.id === id;
  const where = () => `step ${story.mission.step.id}`;

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
  assert.ok(at('briefing'), `talked to the commander (${where()})`);
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

  // Follow the squad to the wall, then up to the terraces.
  const followCmd = () => [cmd.position.x, cmd.position.z];
  walkTo(followCmd, null, () => at('at_wall'), 120, 2.5);
  assert.ok(at('at_wall'), `reached the wall with the squad (${where()}, cmd at ${cmd.position.x.toFixed(1)}, ${cmd.position.z.toFixed(1)}, player at ${player.position.x.toFixed(1)}, ${player.position.z.toFixed(1)})`);
  run(30);
  walkTo(followCmd, null, () => at('radio'), 150, 2.5);
  assert.ok(at('radio'), `reached the terraces (${where()})`);

  // Part 2: sirens, weapons ready.
  runUntil(() => at('weapons_ready'), 90);
  assert.ok(at('weapons_ready'), `radio chatter cut off by the sirens (${where()})`);
  assert.equal(rifle.mode, 'ready', 'weapon raised');
  assert.equal(story.mission.checkpointIndex, story.mission.indexOf('weapons_ready'), 'checkpoint at weapons ready');
  runUntil(() => at('shelter'), 30);
  assert.ok(at('shelter'), where());

  // Four bystanders froze; send each one off with E.
  const frozen = story.npcs.list.filter((n) => n.frozen);
  assert.equal(frozen.length, 4, 'bystanders froze');
  for (const f of frozen) {
    teleport(f.position.x + 1.5, f.position.y + 0.1, f.position.z);
    run(0.3);
    const e = player.position.clone().add(new Vector3(0, 1.66, 0));
    const d = new Vector3().subVectors(f.position.clone().add(new Vector3(0, 1.1, 0)), e).normalize();
    story.interact(e, d);
    assert.ok(!f.frozen, 'E sends a frozen civilian running');
  }
  runUntil(() => at('contact'), 95);
  assert.ok(at('contact'), `first contact (${where()})`);
  const outsideAtContact = story.npcs.civiliansOutside;

  // First contact: the squad fights with the combat AI.
  assert.equal(enemies.friendlies.length, 3, 'squad switched to combat AI');
  runUntil(() => story.enemiesLeft === 0, 150);
  const shots = enemies.friendlies.reduce((n, f) => n + f.shotsFired, 0);
  assert.ok(enemies.enemies.length >= 4 && enemies.enemies.length <= 6, `4-6 attackers (${enemies.enemies.length})`);
  assert.ok(shots > 0, 'the squad fired at the attackers');
  const squadKills = enemies.friendlyKills;
  // The scripted player never shoots: finish off whoever is left.
  for (const e of enemies.enemies) if (e.alive) enemies.hit({ enemy: e, zone: 'head' }, new Vector3(1, 0, 0), info);
  run(0.1);
  assert.ok(at('after_wave'), `wave cleared (${where()})`);
  assert.equal(enemies.friendlies.length, 0, 'squad back to story NPCs');
  assert.equal(story.npcs.civiliansOutside, 0, `every civilian sheltered (${outsideAtContact} were still outside at contact)`);
  teleport(-50, 0.1, 5);
  runUntil(() => at('defense_orders'), 90);
  assert.ok(at('defense_orders'), `debrief finished (${where()}, cmd arrived ${cmd.arrived})`);
  console.log(`# squad: ${shots} shots, ${squadKills} kills; ${outsideAtContact} civilians outside at contact`);

  // Part 3: take the line at the low wall, resupply at the crate.
  teleport(-28.3, 0.1, -3.5);
  runUntil(() => at('defense_prep'), 60);
  assert.ok(at('defense_prep'), where());
  const crate = story.crates.get('crate1');
  assert.ok(crate, 'ammo crate at the line');
  rifle.state.reserve = 0;
  thrower.count = 0;
  const lookAt = (pt) => {
    const e = player.position.clone().add(new Vector3(0, 1.66, 0));
    return [e, new Vector3().subVectors(pt, e).normalize()];
  };
  teleport(crate.position.x - 1.3, 0.1, crate.position.z);
  run(0.2);
  story.interact(...lookAt(crate.position.clone().add(new Vector3(0, 0.3, 0))));
  assert.equal(rifle.state.reserve, DIFFICULTY.ammo.crateReserve, 'E at the crate refills the reserve');
  assert.equal(thrower.count, DIFFICULTY.grenades.player.max, 'and the grenades');
  // The crate is solid: walking into it doesn't go through.
  player.yaw = -Math.PI / 2; // east, into the crate
  run(1.5, () => ({ ...idle, forward: 1 }));
  assert.ok(player.position.x < crate.position.x - 0.5, `the crate blocks the player (x ${player.position.x.toFixed(2)})`);
  teleport(-28.3, 0.1, -3.5);

  // Waves: let the AI fight for a while (the scripted player stands still, so it gets
  // grenades thrown at it), then finish off whoever is left.
  const fight = (id, seconds) => {
    runUntil(() => !at(id), seconds);
    for (let k = 0; k < 20 && at(id); k++) {
      for (const e of enemies.enemies) if (e.alive) enemies.hit({ enemy: e, zone: 'head' }, new Vector3(1, 0, 0), info);
      run(2);
    }
  };
  runUntil(() => at('wave1'), 30);
  assert.equal(story.mission.checkpointIndex, story.mission.indexOf('wave1'), 'checkpoint before wave 1');
  assert.equal(enemies.friendlies.length, 3, 'squad fighting');
  fight('wave1', 40);
  assert.ok(at('between1'), `wave 1 over (${where()})`);
  runUntil(() => at('wave2'), 30);
  const w2 = [];
  run(8);
  for (const e of enemies.enemies) w2.push(e.cfg.role);
  assert.ok(w2.includes('suppressor') && w2.includes('flanker'), `wave 2 has suppressors and flankers (${w2})`);
  fight('wave2', 40);
  assert.ok(at('overrun'), `wave 2 over, the line is overrun (${where()})`);
  assert.ok(story.crates.get('crate2'), 'second crate');
  teleport(-10, 0.1, -22);
  fight('overrun', 20);
  assert.ok(at('position2'), `fell back to the second position (${where()})`);
  assert.equal(story.mission.checkpointIndex, story.mission.indexOf('position2'));
  runUntil(() => at('wave3'), 30);
  run(12);
  const roles = enemies.enemies.map((e) => e.cfg.role);
  assert.ok(roles.includes('marksman') && roles.includes('rusher'), `wave 3 has a marksman and rushers (${roles})`);
  fight('wave3', 40);
  assert.ok(at('lull'), `wave 3 over (${where()})`);
  runUntil(() => at('part3_end'), 90);
  assert.ok(at('part3_end'), `the attack pauses, part 3 ends (${where()})`);
  assert.ok(enemyGrenades > 0, 'enemies threw grenades at the camping player');
  console.log(`# part 3: ${enemyGrenades} enemy grenades, ${explosions} explosions, squad kills ${enemies.friendlyKills}`);

  // F2-style jumps and checkpoint restarts.
  story.jumpTo(story.mission.indexOf('at_wall'));
  assert.ok(Math.hypot(player.position.x + 14, player.position.z + 12.8) < 0.5, 'player at the wall checkpoint');
  assert.ok(story.npcs.get('cmd').position.x > -13, 'commander placed at the wall');
  story.jumpTo(story.mission.indexOf('wave2'));
  assert.ok(story.crates.get('crate1') && !story.crates.get('crate2'), 'jump to wave 2: first crate only');
  assert.equal(enemies.friendlies.length, 3, 'jump to wave 2: squad in combat');
  story.jumpTo(story.mission.indexOf('after_talk'));
  assert.equal(story.npcs.civiliansOutside, 0, 'fast-forward past contact: civilians in the shelter');
  assert.equal(story.enemiesLeft, 0, 'fast-forward past contact: no attackers');
  assert.equal(enemies.friendlies.length, 0);
  story.jumpTo(story.mission.indexOf('contact'));
  assert.equal(enemies.friendlies.length, 3, 'jump to contact: squad in combat');
  assert.ok(story.enemiesLeft >= 4, 'jump to contact: the wave comes again');
  run(3);
  assert.ok(enemies.enemies.length > 0, 'attackers spawning');
  story.restartFromCheckpoint();
  assert.equal(story.mission.step.id, 'weapons_ready', 'death during contact restarts at weapons ready');
  assert.equal(enemies.enemies.length, 0, 'restart clears the attackers');
  assert.equal(enemies.friendlies.length, 0, 'restart clears the squad AI');
});
