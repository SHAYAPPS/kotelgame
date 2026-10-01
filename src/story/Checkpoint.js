// The security checkpoint at the southern entrance (Mission 1, task 1; pure logic, no three.js):
// a queue of people; each one puts a bag on the X-ray belt and walks through the metal
// detector. The player looks at the X-ray screen, opens a bag that looks off, runs the hand
// detector over someone the gate beeped at, then lets them in (E) or stops them (F). His
// teammate keeps him honest (a blade on the screen must be looked at, a beep must be checked,
// a knife stays at the checkpoint). CheckpointView draws the bags, the screen and the gate's
// light; the HUD shows the screen and the bag's contents up close.

// The east lane of the checkpoint pavilion (world/kotel/kotelSurroundings.js: the lane's X-ray
// belt runs along x = -64.8 from z 89.4 to 86.6, its walk-through detector stands at z = 85).
export const LANE = {
  queue: [-63.7, 91.9], // the head of the line; it goes back south
  spacing: 1.05,
  drop: [-63.95, 89.7], // where they put the bag on the belt (facing west)
  gate: [-63.75, 85.9], // just before the detector
  inspect: [-63.85, 83.55], // where they stand to be checked (facing the player)
  exit: [-63.75, 78.5], // out into the corridor toward the plaza
  belt: { from: [-64.8, 89.15], to: [-64.8, 86.85], y: 1.2 + 0.78, time: 3.4 },
  table: [-62.45, 1.2 + 0.8, 84.95], // the bag is checked on the little table by the player
  monitor: [-62.42, 1.2 + 1.18, 85.42], // the X-ray screen on the table, facing north
  post: [-62.55, 1.2, 83.65], // where the player stands
  detector: [-63.75, 1.2 + 2.3, 85], // the gate's light
};

const REACH = 2.7; // m: what the player can act on
const AIM = 0.32; // rad off the view center

const W = Math.PI / 2; // facing west (yaw: 0 looks down -Z)
const yawTo = (fx, fz, tx, tz) => Math.atan2(-(tx - fx), -(tz - fz));

/**
 * @typedef {{ id: string, kind: string, bag: string, items: string[], metal?: string,
 *   odd?: boolean, blade?: boolean, lines: { arrive?: (string|object)[], open?: string[],
 *   wand?: string[], letIn?: string[], confiscate?: string[], unopened?: string[] },
 *   then?: { to: number[], behavior?: string, pray?: boolean, speed?: number }, with?: object }} Person
 * metal: what the gate beeps at (in a pocket: keys, buckle); odd: the X-ray looks off (open it,
 * optional); blade: a knife in the bag (must be opened and confiscated); with: someone along
 * (a child) { id, kind, lines }; then: where they go once in.
 */

export class Checkpoint {
  /**
   * @param {{ npcs: import('./Npc.js').NpcManager, people: Person[], extras?: string[], rand?: () => number }} o
   *   extras: kinds of the people waiting behind (the guard screens them later)
   */
  constructor({ npcs, people, extras = [], rand = Math.random }) {
    this.npcs = npcs;
    this.defs = people;
    this.extras = extras;
    this.rand = rand;
    /** (lines: (string|{id, who})[], { interrupt }) => void */
    this.onLines = null;
    /** ('beep' | 'wand' | 'belt' | 'open' | 'clear') => void */
    this.onSound = null;
    /** (person) => void: someone was let in */
    this.onDone = null;
    this.reset();
  }

  reset() {
    this.active = false;
    this.cur = null; // the person being screened: { def, npc, kid, state, ... }
    this.done = new Set();
    this.line = []; // npcs waiting (front first)
    this.bag = { visible: false, at: [0, 0, 0], kind: null, open: false, items: [], scanned: false, t: 0, onTable: false };
    this.gate = { beep: 0 }; // s left of the red light
    this.focus = null; // 'monitor' | 'bag' | 'person' | null
    this.panel = null; // 'xray' | 'bag' | null: what the HUD shows up close
    this.message = null; // the last result: { text: key, item }
    this.handedOver = false;
    this.screened = 0;
  }

  /** The queue (fast: nobody, the screening is over or skipped). */
  begin(fast = false) {
    this.active = !fast;
    if (fast) return;
    let k = 0;
    for (const d of this.defs) {
      if (this.done.has(d.id) || this.npcs.get(d.id)) continue;
      this._queue(d.id, d.kind, k++, d);
      if (d.with) this._queue(d.with.id, d.with.kind, k++, null, d.id);
    }
    for (const kind of this.extras) this._queue(null, kind, k++);
  }

  _queue(id, kind, k, def = null, parent = null) {
    const [x, z] = LANE.queue;
    const npc = this.npcs.spawn({ id, kind, at: [x + (this.rand() - 0.5) * 0.25, 1.2, z + k * LANE.spacing], yaw: Math.PI, prop: def?.prop, parent, sex: def?.sex });
    npc.faceYaw = Math.PI; // facing north, up the lane
    npc.screening = true;
    if (!parent) this.line.push(npc);
    else npc.follow = { leader: this.npcs.get(parent), dx: 0.45, dz: 0.5 };
    return npc;
  }

  /** The mission's step for one person: they come up (fast: already through). */
  screen(id, fast = false) {
    const def = this.defs.find((d) => d.id === id);
    if (!def) throw new Error(`Unknown checkpoint person "${id}"`);
    if (fast) {
      this.done.add(id);
      this.screened = this.done.size;
      return;
    }
    if (!this.active) this.begin();
    const npc = this.npcs.get(id);
    this.line = this.line.filter((n) => n !== npc);
    const kid = def.with ? this.npcs.get(def.with.id) : null;
    this.cur = { def, npc, kid, state: 'toBelt', t: 0, opened: false, wanded: false, taken: false, beeped: false, alarm: false, said: new Set() };
    this.bag = { visible: false, at: [LANE.belt.from[0], LANE.belt.y, LANE.belt.from[1]], kind: def.bag, open: false, items: [...def.items], scanned: false, t: 0, onTable: false, seed: this.rand() };
    this.panel = null;
    this.message = null;
    npc.setRoute({ points: [LANE.drop], speed: 1.1, face: W });
    this._advanceLine();
  }

  /** The guard takes over: the rest of the line is let through, one at a time. */
  handover() {
    this.handedOver = true;
    this.active = false;
    this.cur = null;
    this.panel = null;
    this.focus = null;
  }

  _advanceLine() {
    const [x, z] = LANE.queue;
    this.line.forEach((n, i) => {
      if (n.route && !n.arrived) return;
      const tz = z + i * LANE.spacing;
      if (Math.abs(n.position.z - tz) > 0.3) n.setRoute({ points: [[x + (i % 2 ? 0.08 : -0.08), tz]], speed: 0.9, face: Math.PI });
    });
  }

  _say(key) {
    const c = this.cur;
    const lines = c?.def.lines?.[key];
    if (!lines || c.said.has(key)) return false;
    c.said.add(key);
    this.onLines?.(lines.map((l) => (typeof l === 'string' ? { id: l, who: this._who(l) } : { ...l, who: l.who ?? this._who(l.id) })), { interrupt: false });
    return true;
  }

  _who(id) {
    // Lines by the person (generic speakers) unless the line is the teammate's / the player's.
    if (id.startsWith('cp_ok') || id.startsWith('cp_need') || id.startsWith('cp_no_') || id === 'cp_unopened' || id === 'cp_next') return null;
    if (id.endsWith('_me') || id === 'cp_tourist_me') return null;
    if (this.cur?.kid && id.endsWith('_kid')) return this.cur.kid.id;
    return this.cur?.npc.id ?? null;
  }

  _team(id) {
    this.onLines?.([{ id }], { interrupt: false });
  }

  /** Fixed step: the people and the bag. */
  update(dt) {
    this.gate.beep = Math.max(0, this.gate.beep - dt);
    if (this.handedOver) return this._guardUpdate(dt);
    if (!this.active) return;
    this._advanceLine();
    const c = this.cur;
    if (c) this._person(c, dt);
    this._bag(dt);
  }

  /** Per frame: what the player looks at (the HUD's prompt and panel). */
  look(eye, dir) {
    this.focus = this.active ? this._focus(eye, dir) : null;
    this.panel = this.focus === 'monitor' && this.bag.scanned && this.bag.visible ? 'xray' : this.focus === 'bag' && this.bag.open ? 'bag' : null;
    return this.focus;
  }

  _person(c, dt) {
    const n = c.npc;
    c.t += dt;
    switch (c.state) {
      case 'toBelt':
        if (!n.arrived) return;
        n.act = { clip: 'reach_out', until: n.time + 1.4 };
        c.state = 'drop';
        c.t = 0;
        return;
      case 'drop':
        if (c.t < 0.9) return;
        // The bag goes on the belt and rides into the machine.
        this.bag.visible = true;
        this.bag.t = 0;
        this.onSound?.('belt');
        this._say('arrive');
        c.state = 'toGate';
        n.setRoute({ points: [LANE.gate, LANE.inspect], speed: 0.85 });
        if (c.kid) c.kid.follow = { leader: n, dx: 0.5, dz: 0.55 };
        return;
      case 'toGate':
        if (!c.beeped && n.position.z < 85.1) {
          c.beeped = true;
          if (c.def.metal) {
            c.alarm = true;
            this.gate.beep = 1.6;
            this.onSound?.('beep');
          } else this.onSound?.('clear');
        }
        if (!n.arrived) return;
        n.faceYaw = yawTo(n.position.x, n.position.z, LANE.post[0], LANE.post[2]);
        c.state = 'inspect';
        c.t = 0;
        return;
      case 'inspect':
        return;
      case 'leaving':
        if (!n.arrived) return;
        this._release(c);
    }
  }

  _bag(dt) {
    const b = this.bag;
    if (!b.visible || b.onTable) return;
    const B = LANE.belt;
    b.t += dt;
    const k = Math.min(1, b.t / B.time);
    b.at[0] = B.from[0] + (B.to[0] - B.from[0]) * k;
    b.at[1] = B.y;
    b.at[2] = B.from[1] + (B.to[1] - B.from[1]) * k;
    // Through the machine (the middle of the belt): on the screen.
    if (k > 0.45) b.scanned = true;
    // Off the belt onto the inspection table once its owner is there.
    if (k >= 1 && this.cur?.state === 'inspect') {
      b.onTable = true;
      b.at = [...LANE.table];
    }
  }

  /** What the player looks at (in reach): the screen, the bag, the person. */
  _focus(eye, dir) {
    const c = this.cur;
    const cand = [['monitor', LANE.monitor]];
    if (this.bag.onTable) cand.push(['bag', [this.bag.at[0], this.bag.at[1] + 0.12, this.bag.at[2]]]);
    if (c?.state === 'inspect') cand.push(['person', [c.npc.position.x, c.npc.position.y + 1.35, c.npc.position.z]]);
    let best = null;
    let bestA = AIM;
    for (const [name, p] of cand) {
      const x = p[0] - eye.x;
      const y = p[1] - eye.y;
      const z = p[2] - eye.z;
      const d = Math.hypot(x, y, z);
      if (d > REACH) continue;
      const a = Math.acos(Math.min(1, (x * dir.x + y * dir.y + z * dir.z) / d));
      if (a < bestA) {
        bestA = a;
        best = name;
      }
    }
    return best;
  }

  /** What E / F do right now (the HUD prompt): { use: key | null, deny: key | null }. */
  get actions() {
    const c = this.cur;
    const f = this.focus;
    if (!c || c.state !== 'inspect') return { use: null, deny: null };
    if (f === 'bag' && this.bag.onTable) {
      if (!this.bag.open) return { use: 'open', deny: null };
      if (c.def.blade && !c.taken) return { use: null, deny: 'confiscate' };
      return { use: null, deny: null };
    }
    if (f === 'person') {
      if (c.def.metal && !c.wanded) return { use: 'wand', deny: 'stop' };
      return { use: 'letIn', deny: c.def.blade && this.bag.open && !c.taken ? 'confiscate' : 'stop' };
    }
    return { use: null, deny: null };
  }

  /** E. Returns true when it did something. */
  use() {
    const c = this.cur;
    const a = this.actions.use;
    if (!a) return false;
    if (a === 'open') {
      this.bag.open = true;
      c.opened = true;
      this.onSound?.('open');
      this.message = { text: 'contents' };
      this._say('open');
      return true;
    }
    if (a === 'wand') {
      c.wanded = true;
      this.onSound?.('wand');
      this.message = { text: 'wandFound', item: c.def.metal };
      this._say('wand');
      return true;
    }
    if (a === 'letIn') {
      // The teammate keeps an eye on it: what has to be checked is checked.
      if (c.def.blade && !c.opened) return this._team('cp_need_open'), true;
      if (c.def.blade && !c.taken) return this._team('cp_need_take'), true;
      if (c.def.metal && !c.wanded) return this._team('cp_need_wand'), true;
      if (c.def.odd && !c.opened) this._say('unopened');
      this._letIn(c);
      return true;
    }
    return false;
  }

  /** F. Returns true when it did something. */
  deny() {
    const c = this.cur;
    const a = this.actions.deny;
    if (!a) return false;
    if (a === 'confiscate') {
      c.taken = true;
      this.bag.items = this.bag.items.filter((i) => i !== 'knife');
      this.message = { text: 'taken', item: 'knife' };
      this._say('confiscate');
      return true;
    }
    if (a === 'stop') {
      // Nothing to stop them for (the one who needs stopping only needs his knife taken).
      if (c.def.blade && !c.opened) this._team('cp_need_open');
      else this._team('cp_no_stop');
      return true;
    }
    return false;
  }

  _letIn(c) {
    const ok = !c.said.has('letIn') && this._say('letIn');
    if (!ok && !c.said.has('unopened')) this._team(this.rand() < 0.5 ? 'cp_ok_1' : 'cp_ok_2');
    c.state = 'leaving';
    const then = c.def.then;
    // Bag back in hand (gone from the table), off into the plaza.
    this.bag.visible = false;
    this.panel = null;
    c.npc.setRoute({ points: [LANE.exit, ...(then?.to ? [then.to] : [])], speed: then?.speed ?? 1.15, face: then?.face ?? null });
    if (c.kid) c.kid.follow = { leader: c.npc, dx: 0.55, dz: 0.6 };
    this.done.add(c.def.id);
    this.screened = this.done.size;
    this.onDone?.(c);
    c.npc.screening = false;
  }

  _release(c) {
    const then = c.def.then;
    if (then?.pray) c.npc.pray = true;
    if (then?.behavior) {
      c.npc.behavior = then.behavior;
      c.npc.home = { x: c.npc.position.x, z: c.npc.position.z, yaw: c.npc.facing };
    }
    if (this.cur === c) this.cur = null;
  }

  /** After the handover: the guard lets the rest in, one every few seconds. */
  _guardUpdate(dt) {
    if (this.cur?.state === 'leaving' && this.cur.npc.arrived) this._release(this.cur);
    this._guardT = (this._guardT ?? 2) - dt;
    if (this._guardT > 0 || !this.line.length) return;
    this._guardT = 5 + this.rand() * 3;
    const n = this.line.shift();
    n.screening = false;
    n.setRoute({ points: [LANE.gate, LANE.exit, [-62 + (this.rand() - 0.5) * 6, 60 - this.rand() * 10]], speed: 1.1 });
    this._advanceLine();
  }

  /** The person the step is waiting for has been let in (and walked off). */
  isDone(id) {
    return this.done.has(id);
  }
}
