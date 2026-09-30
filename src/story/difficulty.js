// Mission 1 difficulty: everything you'd tune to make the defense easier or harder.
// Wave sizes and timing, where attackers come from, enemy accuracy/damage per role,
// grenades (theirs and yours) and ammo. Coordinates are Kotel plaza meters
// (+X east toward the wall, +Z south); `delay`/`interval` are seconds.

import { ATTACKER } from '../ai/config.js';

const DEG = Math.PI / 180;

export const DIFFICULTY = {
  // Global multipliers on every attacker (1 = as tuned below).
  accuracy: 1, // > 1 = tighter aim (spread divided by this)
  damage: 1, // damage per bullet that hits you
  reaction: 1, // > 1 = slower to open fire

  // Enemy roles: overrides on top of the base attacker (src/ai/config.js ATTACKER).
  roles: {
    rifleman: {},
    // Stays in cover and keeps firing long bursts at where you were, pinning you down.
    suppressor: { suppress: true, suppressTime: 7, burst: [6, 12], burstPause: [0.5, 0.9], maxSpread: 8 * DEG, minSpread: 3 * DEG, seekTime: 0, assault: false, bandColor: 0x7a6a2a },
    // Runs a route along the plaza edge before joining the fight.
    flanker: { runSpeed: 4.8, viaShootRange: 22, bandColor: 0x2f5d6e },
    // Charges straight at you, firing on the move.
    rusher: { rusher: true, rushStop: 3, runSpeed: 5.4, reactionTime: 0.45, maxSpread: 9 * DEG, minSpread: 2.5 * DEG, health: 70, bandColor: 0x9a2020 },
    // Stays on the upper terraces: slow aimed single shots, a scope glint while aiming.
    marksman: { marksman: true, aimTime: 1.6, boltTime: 1.4, damage: 34, minSpread: 0.25 * DEG, maxSpread: 0.9 * DEG, visionRange: 140, preferredRange: [40, 140], coverSearchRadius: 5, seekTime: 0, assault: false, bandColor: 0x222222 },
  },

  grenades: {
    fuse: 3.2, // seconds from the throw
    radius: 7, // damage falls off to zero here
    playerDamage: 190, // at the center (you have 100 health)
    enemyDamage: 220,
    player: { max: 3, throwSpeed: 15, cooldown: 0.8 },
    enemy: {
      minInterval: 8, // at most one enemy grenade this often (whole wave)
      cooldown: [16, 28], // per enemy, between his throws
      campTime: 5, // you stayed within campRadius this long: you're camping
      campRadius: 2.5,
      campChance: 0.7, // chance per check to throw at a camping player
      otherChance: 0.04, // chance per check to throw anyway (at you or a teammate)
      checkInterval: 1, // seconds between checks, per enemy
      range: [7, 30], // throw distance
      inaccuracy: 1.8, // meters of scatter at the landing point
    },
  },

  ammo: {
    reserve: 150, // rounds beside the magazine when you (re)start
    crateReserve: 240, // an ammo crate fills you up to this
  },

  // Quiet time before each wave (the steps after it are timed from these).
  prep: { beforeWave1: 18, beforeWave2: 16, beforeWave3: 20 },

  // Named spawn points and flanking routes (all checked walkable in tests/mission.test.js).
  spawns: {
    stairs: [[-121, 26], [-123, 30], [-120, 29], [-122, 24.5], [-122.5, 28]],
    south: [[-64, 99], [-70.5, 100], [-67, 98], [-65.5, 100], [-69, 97]],
    north: [[-46, -42], [-40, -42], [-52, -42]],
    terrace: [[-100, -36]],
  },
  routes: {
    northEdge: [[-95, -40], [-70, -41], [-48, -40], [-35, -34]],
    southEdge: [[-58, 58], [-51, 34], [-37, 27]],
  },

  // Waves: groups of `count` attackers of one role from one spawn list, the first after
  // `delay`, then one every `interval`. `via` names a route to run before engaging.
  waves: {
    // Part 2, first contact.
    contact: [
      { from: 'south', role: 'rifleman', count: 3, delay: 0.5, interval: 0.85 },
      { from: 'stairs', role: 'rifleman', count: 2, delay: 10, interval: 1 },
      { from: 'south', role: 'rifleman', count: 1, delay: 17, interval: 0 },
    ],
    // Part 3, holding the plaza.
    wave1: [
      { from: 'stairs', role: 'rifleman', count: 3, delay: 0, interval: 1 },
      { from: 'stairs', role: 'rifleman', count: 2, delay: 9, interval: 1.5 },
    ],
    wave2: [
      { from: 'stairs', role: 'suppressor', count: 2, delay: 0, interval: 1 },
      { from: 'stairs', role: 'flanker', count: 2, delay: 2, interval: 1.2, via: 'northEdge' },
      { from: 'south', role: 'rifleman', count: 2, delay: 1, interval: 1 },
      { from: 'south', role: 'flanker', count: 1, delay: 4, interval: 0, via: 'southEdge' },
      { from: 'stairs', role: 'rifleman', count: 2, delay: 16, interval: 1.5 },
    ],
    // The line gives way on the north side: they come over the fence there.
    breach: [{ from: 'north', role: 'rusher', count: 3, delay: 1, interval: 0.8 }],
    wave3: [
      { from: 'terrace', role: 'marksman', count: 1, delay: 0, interval: 0 },
      { from: 'stairs', role: 'rifleman', count: 3, delay: 1, interval: 1 },
      { from: 'south', role: 'suppressor', count: 2, delay: 3, interval: 1 },
      { from: 'south', role: 'rusher', count: 3, delay: 8, interval: 0.8 },
      { from: 'stairs', role: 'flanker', count: 2, delay: 12, interval: 1.2, via: 'northEdge' },
      { from: 'stairs', role: 'rusher', count: 2, delay: 22, interval: 1 },
    ],
  },
};

/** The AI config for an attacker of this role, with the global multipliers applied. */
export function attackerConfig(role, d = DIFFICULTY) {
  const r = d.roles[role];
  if (!r) throw new Error(`Unknown attacker role "${role}"`);
  const c = { ...ATTACKER, ...r, role };
  c.maxSpread /= d.accuracy;
  c.minSpread /= d.accuracy;
  c.damage *= d.damage;
  c.reactionTime *= d.reaction;
  c.grenades = d.grenades.enemy;
  return c;
}

/** Expands a wave into individual spawns: [{ at: [x, z], role, delay, via, from }]. */
export function expandWave(groups, d = DIFFICULTY) {
  const used = {};
  const out = [];
  for (const g of groups) {
    const points = d.spawns[g.from];
    if (!points) throw new Error(`Unknown spawn list "${g.from}"`);
    for (let i = 0; i < g.count; i++) {
      const k = (used[g.from] = (used[g.from] ?? 0) + 1) - 1;
      out.push({
        at: points[k % points.length],
        role: g.role,
        from: g.from,
        delay: g.delay + i * (g.interval ?? 0),
        via: g.via ? d.routes[g.via] : null,
      });
    }
  }
  return out;
}
