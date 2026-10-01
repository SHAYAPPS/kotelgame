// The Selichot night's people, as the story's full characters (pure logic, no three.js):
// what each kind of person is (who speaks their lines, what they carry, their size), what
// they do on their own (tuck a note into the wall, touch and kiss it and walk away from it
// backwards, sit with a prayer book, take photos, run around their parents, hand out paper
// kippot, collect charity...), and how they react to the player (a glance, making way, a
// greeting). Story/Npc.js runs the routes; the view (NpcView) the animations and props.

const E = -Math.PI / 2; // facing the wall
const WALL_X = -0.75; // where you stand to touch the wall

/**
 * Kinds: the generic speaker of their lines (text.he.js SPEAKERS; women: speakerF), what they
 * carry, their size; `stays`: on duty, they don't run for the shelter (they wave people on).
 */
export const PEOPLE = {
  worshipper: { speaker: 'man' },
  worshipperWoman: { speaker: 'woman' },
  civilian: { speaker: 'visitor', speakerF: 'visitorF' },
  tourist: { speaker: 'tourist', speakerF: 'touristWoman' },
  guide: { speaker: 'guide' },
  yeshiva: { speaker: 'yeshiva' },
  family: { speaker: 'dad', speakerF: 'mom' },
  elder: { speaker: 'elder', speakerF: 'grandma', prop: 'cane', slow: true },
  grandma: { speaker: 'grandma', slow: true },
  kid: { speaker: 'kid', speakerF: 'kidGirl', scale: 0.62 },
  teen: { speaker: 'teen', scale: 0.94 },
  secular: { speaker: 'visitor', speakerF: 'visitorF' },
  usher: { speaker: 'usher', prop: 'box' },
  collector: { speaker: 'collector', prop: 'can' },
  guard: { speaker: 'guard', stays: true },
  soldierVisitor: { speaker: 'soldierVisitor', soldier: true },
  police: { speaker: 'police', soldier: true, armed: true, stays: true },
};

/** The generic speaker for an NPC's lines (its sex is known once its model is built). */
export function speakerOf(npc) {
  const p = PEOPLE[npc.kind] ?? PEOPLE.civilian;
  return npc.sex === 'f' && p.speakerF ? p.speakerF : p.speaker;
}

const rnd = (r, a, b) => a + r() * (b - a);

/**
 * What people do on their own, one step at a time: `npc.behavior` names one, its state lives
 * in `npc.b`. Each returns nothing; it sets routes (Npc.setRoute) and acts (npc.act: a clip
 * the animator plays standing, until `npc.act.until`).
 */
export const BEHAVIORS = {
  /** At the wall: walk up, tuck a note into a crack, step back facing it, pray, again. */
  notes(n, dt, ctx) {
    const b = n.b;
    switch (b.phase ?? 'wait') {
      case 'wait':
        b.t = (b.t ?? rnd(ctx.rand, 1, 12)) - dt;
        if (b.t > 0) return;
        b.z = n.home.z + rnd(ctx.rand, -1.2, 1.2);
        n.setRoute({ points: [[WALL_X, b.z]], speed: 0.9, face: E });
        b.phase = 'toWall';
        return;
      case 'toWall':
        if (!n.arrived) return;
        n.act = { clip: 'wall_reach', until: n.time + 4.4 };
        b.phase = 'reach';
        return;
      case 'reach':
        if (n.act) return;
        n.setRoute({ points: [[n.home.x, n.home.z]], speed: 0.75, face: E, backward: true });
        b.phase = 'back';
        return;
      case 'back':
        if (!n.arrived) return;
        n.pray = true;
        b.t = rnd(ctx.rand, 20, 45);
        b.phase = 'pray';
        return;
      case 'pray':
        b.t -= dt;
        if (b.t > 0) return;
        n.pray = false;
        b.phase = 'wait';
        b.t = 0;
    }
  },

  /** At the wall: a hand on the stones, a kiss, walking away backwards (facing the wall). */
  kiss(n, dt, ctx) {
    const b = n.b;
    switch (b.phase ?? 'wait') {
      case 'wait':
        b.t = (b.t ?? rnd(ctx.rand, 2, 15)) - dt;
        if (b.t > 0) return;
        n.pray = false;
        b.z = n.home.z + rnd(ctx.rand, -1, 1);
        n.setRoute({ points: [[WALL_X, b.z]], speed: 0.85, face: E });
        b.phase = 'toWall';
        return;
      case 'toWall':
        if (!n.arrived) return;
        n.act = { clip: 'wall_touch', until: n.time + rnd(ctx.rand, 4, 7) };
        b.phase = 'touch';
        return;
      case 'touch':
        if (n.act) return;
        n.act = { clip: 'bow_quick', until: n.time + 2.6 };
        b.phase = 'kiss';
        return;
      case 'kiss':
        if (n.act) return;
        // Backwards, a few meters, before turning away (the custom).
        n.setRoute({ points: [[WALL_X - rnd(ctx.rand, 3, 4.5), b.z + rnd(ctx.rand, -0.6, 0.6)]], speed: 0.7, face: E, backward: true });
        b.phase = 'back';
        return;
      case 'back':
        if (!n.arrived) return;
        n.setRoute({ points: [[n.home.x, n.home.z]], speed: 0.95, face: E });
        b.phase = 'home';
        return;
      case 'home':
        if (!n.arrived) return;
        n.pray = true;
        b.t = rnd(ctx.rand, 25, 50);
        b.phase = 'rest';
        return;
      case 'rest':
        b.t -= dt;
        if (b.t <= 0) {
          b.phase = 'wait';
          b.t = 0;
        }
    }
  },

  /** A child running circles around a parent, now and then stopping to clap or jump about. */
  kidRun(n, dt, ctx) {
    const b = n.b;
    const parent = ctx.npcs.get(n.parent);
    if (!parent) return;
    if (b.t === undefined) b.t = rnd(ctx.rand, 0.5, 3);
    if (!n.arrived) return;
    b.t -= dt;
    if (b.t > 0) return;
    if (ctx.rand() < 0.35) {
      n.act = { clip: ctx.rand() < 0.5 ? 'clap' : 'happy_idle', until: n.time + rnd(ctx.rand, 1.5, 3) };
      b.t = rnd(ctx.rand, 1.6, 3.2);
      return;
    }
    const a0 = Math.atan2(n.position.x - parent.position.x, n.position.z - parent.position.z);
    const r = rnd(ctx.rand, 1.4, 2.6);
    const pts = [];
    for (let k = 1; k <= 4; k++) {
      const a = a0 + (k / 4) * Math.PI * 1.6 * (b.dir ?? 1);
      pts.push([parent.position.x + Math.sin(a) * r, parent.position.z + Math.cos(a) * r]);
    }
    b.dir = ctx.rand() < 0.3 ? -(b.dir ?? 1) : b.dir ?? 1;
    n.setRoute({ points: pts, speed: rnd(ctx.rand, 2.4, 3.3) });
    b.t = rnd(ctx.rand, 0.3, 1.5);
  },

  /** An usher at an entrance, handing out paper kippot. */
  usher(n, dt, ctx) {
    const b = n.b;
    b.t = (b.t ?? rnd(ctx.rand, 1, 5)) - dt;
    if (b.t > 0 || n.act) return;
    n.act = { clip: 'reach_out', until: n.time + 3.6 };
    b.t = rnd(ctx.rand, 5, 9);
  },

  /** A charity collector going from person to person with a can. */
  collector(n, dt, ctx) {
    const b = n.b;
    switch (b.phase ?? 'pick') {
      case 'pick': {
        const near = ctx.npcs.list.filter((o) => o !== n && !o.isTeammate && o.position.distanceTo(n.home) < 9 && !o.fleeing);
        const o = near[Math.floor(ctx.rand() * near.length)];
        if (!o) {
          b.phase = 'idle';
          b.t = 4;
          return;
        }
        const a = ctx.rand() * Math.PI * 2;
        n.setRoute({ points: [[o.position.x + Math.sin(a) * 1.1, o.position.z + Math.cos(a) * 1.1]], speed: 1.0 });
        b.target = o;
        b.phase = 'go';
        return;
      }
      case 'go':
        if (!n.arrived) return;
        n.faceYaw = Math.atan2(-(b.target.position.x - n.position.x), -(b.target.position.z - n.position.z));
        n.act = { clip: 'reach_out', until: n.time + 3.8 };
        ctx.bark?.(n, 'collector');
        b.phase = 'ask';
        return;
      case 'ask':
        if (n.act) return;
        b.phase = 'idle';
        b.t = rnd(ctx.rand, 3, 8);
        return;
      case 'idle':
        b.t -= dt;
        if (b.t <= 0) b.phase = 'pick';
    }
  },

  /** Taking pictures of the wall (or of themselves in front of it), a flash now and then. */
  photo(n, dt, ctx) {
    const b = n.b;
    b.t = (b.t ?? rnd(ctx.rand, 1, 6)) - dt;
    if (b.t > 0 || n.act) return;
    n.act = { clip: 'texting', until: n.time + rnd(ctx.rand, 3, 6), flash: true };
    b.t = rnd(ctx.rand, 6, 14);
  },

  /** An old man / woman: a slow walk between two spots with long rests. */
  elder(n, dt, ctx) {
    const b = n.b;
    if (!n.arrived) return;
    b.t = (b.t ?? rnd(ctx.rand, 5, 20)) - dt;
    if (b.t > 0) return;
    const there = b.there ? n.home : { x: n.home.x + rnd(ctx.rand, -5, 5), z: n.home.z + rnd(ctx.rand, -5, 5) };
    b.there = !b.there;
    n.setRoute({ points: [[there.x, there.z]], speed: rnd(ctx.rand, 0.4, 0.55), face: E });
    b.t = rnd(ctx.rand, 20, 45);
  },
};

/**
 * Reactions to the player walking by (StoryDirector calls this for each calm civilian):
 * a glance (`npc.lookAt` the player for a moment), making way (a step aside when he's about
 * to walk into them, back to their spot when he's gone). Returns true when the person may
 * greet him now (first time within reach, not busy).
 */
export function react(n, dt, player, eye, ctx) {
  const dx = player.position.x - n.position.x;
  const dz = player.position.z - n.position.z;
  const d = Math.hypot(dx, dz);
  const busy = n.frozen || n.fleeing || n.panicking || n.act || n.brain || n.chatting;
  // A glance: once per pass, for a second or two.
  n._glance = Math.max(0, (n._glance ?? 0) - dt);
  if (d < 4.5 && !n._passed) {
    n._passed = true;
    if (!busy && ctx.rand() < (n.pray ? 0.2 : 0.5)) n._glance = rnd(ctx.rand, 1.2, 2.6);
  } else if (d > 7) n._passed = false;
  n.glancing = n._glance > 0;
  // Making way: standing people take a step aside, then go back.
  if (!n.route || n.arrived) {
    if (!n.home) n.home = { x: n.position.x, z: n.position.z, yaw: n.facing };
    const v = player.velocity;
    const toward = v ? (v.x * -dx + v.z * -dz) / Math.max(1e-3, d * Math.hypot(v.x, v.z)) : 0;
    if (d < 1.1 && toward > 0.4 && !busy && !n._yielding && !n.sit) {
      // Sideways, away from his line.
      const side = (v.x * dz - v.z * dx) > 0 ? 1 : -1;
      const len = Math.hypot(v.x, v.z) || 1;
      // (a route stops within NPC.arrive of its end: about 0.9 m aside)
      const sx = n.position.x + (-v.z / len) * side * 1.4;
      const sz = n.position.z + (v.x / len) * side * 1.4;
      n._yielding = true;
      n._wasPraying = n.pray;
      n.pray = false;
      n.setRoute({ points: [[sx, sz]], speed: 1.1, face: n.facing });
    } else if (n._yielding && d > 2.6 && n.arrived) {
      n._yielding = false;
      n.setRoute({ points: [[n.home.x, n.home.z]], speed: 0.9, face: n.home.yaw });
      n._returning = true;
    } else if (n._returning && n.arrived) {
      n._returning = false;
      n.pray = n._wasPraying ?? n.pray;
    }
  }
  if (d < 3.2 && !n.greeted && !busy && !n.pray) {
    n.greeted = true;
    return true;
  }
  if (d > 12) n.greeted = n.greeted && ctx.rand() > 0.002; // much later, maybe again
  return false;
}

// What people say (text.he.js ids), by their speaker: a greeting as the player walks by, and
// a short exchange when he presses E (their line, his reply, ...; `me` lines are his).
export const GREETINGS = {
  man: ['greet_man_1', 'greet_man_2', 'greet_man_3'],
  woman: ['greet_woman_1', 'greet_woman_2'],
  visitor: ['greet_visitor_1', 'greet_visitor_2'],
  visitorF: ['greet_visitorF_1'],
  dad: ['greet_dad_1'],
  mom: ['greet_mom_1'],
  elder: ['greet_elder_1'],
  grandma: ['greet_grandma_1'],
  kid: ['greet_kid_1'],
  kidGirl: ['greet_kidGirl_1'],
  teen: ['greet_teen_1'],
  tourist: ['greet_tourist_1'],
  touristWoman: ['greet_touristWoman_1'],
  yeshiva: ['greet_yeshiva_1'],
  usher: ['greet_usher_1'],
  police: ['greet_police_1'],
  soldierVisitor: ['greet_soldierVisitor_1'],
  collector: ['collector_ask_1'],
};

export const EXCHANGES = {
  man: [['ex_man_1', 'ex_man_1r'], ['ex_man_2', 'ex_man_2r']],
  woman: [['ex_woman_1', 'ex_woman_1r'], ['ex_woman_2', 'ex_woman_2r']],
  visitor: [['ex_visitor_1', 'ex_visitor_1r'], ['ex_visitor_2', 'ex_visitor_2r']],
  visitorF: [['ex_visitorF_1', 'ex_visitorF_1r'], ['ex_visitorF_2', 'ex_visitorF_2r']],
  dad: [['ex_dad_1', 'ex_dad_1r']],
  mom: [['ex_mom_1']],
  elder: [['ex_elder_1', 'ex_elder_1r']],
  grandma: [['ex_grandma_1', 'ex_grandma_1r']],
  kid: [['ex_kid_1', 'ex_kid_1r']],
  kidGirl: [['ex_kidGirl_1', 'ex_kidGirl_1r']],
  teen: [['ex_teen_1', 'ex_teen_1r']],
  tourist: [['ex_tourist_1', 'ex_tourist_1r']],
  touristWoman: [['ex_touristWoman_1', 'ex_touristWoman_1r']],
  yeshiva: [['ex_yeshiva_1', 'ex_yeshiva_1r', 'ex_yeshiva_2']],
  usher: [['ex_usher_1', 'ex_usher_1r', 'ex_usher_2']],
  collector: [['ex_collector_1', 'ex_collector_1r', 'ex_collector_2']],
  guide: [['ex_guide_1', 'ex_guide_1r']],
  police: [['ex_police_1', 'ex_police_1r']],
  soldierVisitor: [['ex_soldierVisitor_1', 'ex_soldierVisitor_1r']],
  guard: [['ex_guard_1', 'ex_guard_1r']],
};

/**
 * The special people (npc.special): a longer exchange, once. Each line: an id, or
 * { id, by: 'parent' } (said by the child's parent), act: a clip the speaker plays with it,
 * flash: a photo's flash.
 */
export const SPECIALS = {
  blessing: [{ id: 'sp_bless_1' }, { id: 'sp_bless_2' }, { id: 'sp_bless_3', act: 'reach_out' }, { id: 'sp_bless_4' }, { id: 'sp_bless_5' }],
  salute: [{ id: 'sp_salute_1', act: 'salute' }, { id: 'sp_salute_2' }, { id: 'sp_salute_3', act: 'happy_idle' }, { id: 'sp_salute_4', by: 'parent' }],
  snack: [{ id: 'sp_snack_1', act: 'reach_out' }, { id: 'sp_snack_2' }, { id: 'sp_snack_3' }, { id: 'sp_snack_4' }, { id: 'sp_snack_5', act: 'thumbs_up' }],
  notes: [{ id: 'sp_notes_1' }, { id: 'sp_notes_2' }, { id: 'sp_notes_3' }, { id: 'sp_notes_4' }, { id: 'sp_notes_5', act: 'clap' }],
  photo: [{ id: 'sp_photo_1' }, { id: 'sp_photo_2' }, { id: 'sp_photo_3', act: 'texting', flash: true }, { id: 'sp_photo_4', act: 'thumbs_up' }],
};

/**
 * The lines for pressing E on this person: their special once, else a short exchange of their
 * kind (the next one each time). Returns [{ id, by?, act?, flash? }]: the director binds each
 * line to its speaker (the person, the child's parent, or the player for `me` lines).
 */
export function exchangeFor(n, rand = Math.random) {
  if (n.special && SPECIALS[n.special] && !n.specialDone) {
    n.specialDone = true;
    return SPECIALS[n.special];
  }
  const sp = speakerOf(n);
  const list = EXCHANGES[sp] ?? EXCHANGES[n.sex === 'f' ? 'visitorF' : 'visitor'];
  n._ex = ((n._ex ?? Math.floor(rand() * list.length)) + 1) % list.length;
  return list[n._ex].map((id) => ({ id }));
}

/** A greeting for this person (a line id), or null. */
export function greetingFor(n, rand = Math.random) {
  const list = GREETINGS[speakerOf(n)];
  return list ? list[Math.floor(rand() * list.length) % list.length] : null;
}
