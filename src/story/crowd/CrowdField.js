import { flowField, flowStep } from '../../ai/FlowField.js';

// The Selichot crowd around the story's own characters (pure): thousands of people as plain
// records (no physics, no path search per person). Each has a spot (in front of the wall, on
// a chair, in the plaza), arrives at its time (walking in from an entrance, or simply there
// when it's far from the player), prays / stands / talks / sits there, turns its head toward
// the player walking by, steps aside for him, and when the sirens start runs down a flow
// field to the nearest shelter or exit, where it is gone. CrowdRenderer draws them.

const E = -Math.PI / 2; // facing the wall (east, +X)

/** What a member is doing; the renderer maps each to a clip of its character type. */
export const ACT = { pray: 0, stand: 1, talk: 2, walk: 3, run: 4, sit: 5, oldWalk: 6, back: 7 };

export const CROWD = {
  walkSpeed: [1.0, 1.35],
  runSpeed: [2.4, 3.8],
  near: 16, // m from the camera: drawn in more detail (the renderer)
  // Drawn share of the far crowd (graphics presets: low draws fewer; the people near the
  // player are all drawn, all of them still count): from `thinFrom` m out it eases down to
  // `density` by `thinTo`.
  density: 1,
  thinFrom: 20,
  thinTo: 36,
  arriveView: 26, // m: arrivals closer than this to the player walk in from an entrance
  fadeTime: 1.6, // s to fade in / out
  personal: 0.42, // m: radius each person keeps clear
  makeWay: 1.45, // m: closer than this, people shuffle out of the player's way
  maxDodge: 0.75,
  glanceRange: 7,
  glanceChance: 0.35, // per person per pass
  maxGlancers: 10,
  goneAt: 1.6, // m from the target: inside (shelter / exit)
};

const _step = { x: 0, z: 0, d: 0 };

function hash(i) {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export class CrowdField {
  /**
   * @param {import('../../ai/NavGrid.js').NavGrid} nav
   * @param {{ rand?: () => number }} [o]
   */
  constructor(nav, { rand = Math.random } = {}) {
    this.nav = nav;
    this.rand = rand;
    /** @type {object[]} */
    this.members = [];
    this.time = 0;
    this.fields = new Map(); // name -> distance field (Float32Array)
    this.fleeing = false;
    this.glancers = 0;
    this.version = 0; // bumps when members appear / disappear (the renderer rebuilds its lists)
    // Spatial hash of the people who are out (for the player pushing through, separation).
    this._cell = 2;
    this._grid = new Map();
  }

  /** A distance field toward some points (computed once, kept by name). */
  field(name, points) {
    if (!this.fields.has(name)) {
      const seeds = points.map(([x, z]) => this.nav.nodeAt(x, z)).filter((n) => n >= 0);
      this.fields.set(name, flowField(this.nav, seeds));
    }
    return this.fields.get(name);
  }

  /**
   * Adds a member.
   * @param {{ type: number, outfit: number, wear?: number, sex?: string, x: number, z: number,
   *   yaw?: number, act?: number, arriveAt?: number, entry?: string, from?: number[],
   *   rate?: number }} m entry: the field (by name) leading to its spot's zone; from: where it
   *   walks in from (an entrance) when it arrives within the player's view
   */
  add(m) {
    const n = this.nav.nodeAt(m.x, m.z);
    const y = n >= 0 ? this.nav.y[n] : 0;
    const member = {
      i: this.members.length,
      type: m.type,
      outfit: m.outfit,
      wear: m.wear ?? 0,
      sex: m.sex ?? 'm',
      hx: m.x,
      hz: m.z,
      x: m.x,
      z: m.z,
      y,
      yaw: m.yaw ?? E,
      homeYaw: m.yaw ?? E,
      act: m.act ?? ACT.stand,
      stayAct: m.act ?? ACT.stand,
      phase: m.phase ?? this.rand(),
      rate: m.rate ?? 0.85 + this.rand() * 0.3,
      arriveAt: m.arriveAt ?? 0,
      entry: m.entry ?? null,
      from: m.from ?? null,
      state: 'off', // off -> walk (arriving) | stay -> flee -> gone
      fade: 0,
      look: 0,
      lookTarget: 0,
      lookTime: 0,
      glanced: false,
      dx: 0, // stepping aside for the player (offset from the spot)
      dz: 0,
      speed: 0,
      target: null,
    };
    this.members.push(member);
    return member;
  }

  /** How many are out (arrived and not gone). */
  get present() {
    let n = 0;
    for (const m of this.members) if (m.state !== 'off' && m.state !== 'gone') n++;
    return n;
  }

  /**
   * The sirens: everyone runs for the nearest of `targets` ({ name, points }), after a short,
   * spread out reaction. Fast: they're simply gone (fast-forwarding past the evacuation).
   */
  evacuate(targets, { maxDelay = 4, fast = false } = {}) {
    this.fleeing = true;
    const fields = targets.map((t) => this.field(t.name, t.points));
    for (const m of this.members) {
      if (m.state === 'gone') continue;
      if (fast || m.state === 'off') {
        m.state = 'gone';
        m.fade = 0;
        continue;
      }
      // The nearest target by walking distance from where they are.
      const n = this.nav.nodeAt(m.x, m.z);
      let best = 0;
      let bestD = Infinity;
      fields.forEach((f, k) => {
        const d = n >= 0 ? f[n] : Infinity;
        if (d < bestD) {
          bestD = d;
          best = k;
        }
      });
      m.target = fields[best];
      m.state = 'flee';
      m.delay = 0.3 + this.rand() * maxDelay;
      m.speed = CROWD.runSpeed[0] + this.rand() * (CROWD.runSpeed[1] - CROWD.runSpeed[0]);
      m.dx = 0;
      m.dz = 0;
    }
    this.version++;
  }

  /** Everyone back where they were (a checkpoint restart): arrivals replay from `time`. */
  reset(time = 0) {
    this.fleeing = false;
    this.time = time;
    for (const m of this.members) {
      m.state = 'off';
      m.fade = 0;
      m.x = m.hx;
      m.z = m.hz;
      m.dx = m.dz = 0;
      m.yaw = m.homeYaw;
      m.act = m.stayAct;
      m.look = m.lookTarget = 0;
      m.glanced = false;
      m.target = null;
    }
    this.glancers = 0;
    this.version++;
  }

  /**
   * @param {number} dt
   * @param {{ x: number, z: number, vx?: number, vz?: number } | null} player
   * @param {{ x: number, z: number } | null} camera where the viewer is (who sees arrivals)
   */
  update(dt, player, camera = player) {
    this.time += dt;
    const C = CROWD;
    let changed = false;
    this._grid.clear();
    for (const m of this.members) {
      if (m.state === 'off') {
        if (this.fleeing || m.arriveAt > this.time) continue;
        // Arrives: in view, walking in from the entrance; out of view, simply there.
        const near = camera && Math.hypot(camera.x - m.hx, camera.z - m.hz) < C.arriveView;
        if (near && m.from && m.entry && Math.hypot(camera.x - m.from[0], camera.z - m.from[1]) > C.arriveView * 0.6) {
          m.x = m.from[0];
          m.z = m.from[1];
          m.state = 'walk';
          m.act = ACT.walk;
          m.speed = C.walkSpeed[0] + this.rand() * (C.walkSpeed[1] - C.walkSpeed[0]);
          m.leg = 0;
        } else {
          m.state = 'stay';
          m.act = m.stayAct;
          m.x = m.hx;
          m.z = m.hz;
          m.yaw = m.homeYaw;
        }
        changed = true;
      }
      if (m.state === 'gone') {
        if (m.fade > 0) m.fade = Math.max(0, m.fade - dt / C.fadeTime);
        continue;
      }
      if (m.state === 'walk') this._walkIn(m, dt);
      else if (m.state === 'flee') this._flee(m, dt);
      else if (m.state === 'stay' && player) this._react(m, dt, player);
      if (m.state !== 'gone') m.fade = Math.min(1, m.fade + dt / C.fadeTime);
      // The head turn eases toward its target.
      m.look += (m.lookTarget - m.look) * Math.min(1, dt * 4);
      const key = this._key(m.x + m.dx, m.z + m.dz);
      let list = this._grid.get(key);
      if (!list) this._grid.set(key, (list = []));
      list.push(m);
    }
    if (this.fleeing) this._separate();
    if (changed) this.version++;
  }

  _key(x, z) {
    return Math.floor(x / this._cell) * 4096 + Math.floor(z / this._cell);
  }

  /** Walking in: down the field to their zone's way in, then straight to the spot. */
  _walkIn(m, dt) {
    const toSpot = Math.hypot(m.hx - m.x, m.hz - m.z);
    let dirX;
    let dirZ;
    const f = m.entry ? this.fields.get(m.entry) : null;
    if (f && m.leg === 0) {
      flowStep(this.nav, f, m.x, m.z, _step);
      if (_step.d < 1.2 || !Number.isFinite(_step.d) || toSpot < 4) m.leg = 1;
      dirX = _step.x;
      dirZ = _step.z;
    }
    if (!f || m.leg === 1) {
      dirX = (m.hx - m.x) / (toSpot || 1);
      dirZ = (m.hz - m.z) / (toSpot || 1);
    }
    if (m.leg === 1 && toSpot < 0.25) {
      m.state = 'stay';
      m.act = m.stayAct;
      m.x = m.hx;
      m.z = m.hz;
      m.yaw = m.homeYaw;
      return;
    }
    const step = Math.min(m.speed * dt, m.leg === 1 ? toSpot : Infinity);
    m.x += dirX * step;
    m.z += dirZ * step;
    if (dirX || dirZ) m.yaw = Math.atan2(-dirX, -dirZ);
    this._ground(m);
  }

  _flee(m, dt) {
    if (m.delay > 0) {
      m.delay -= dt;
      m.lookTarget = 0;
      return;
    }
    m.act = ACT.run;
    flowStep(this.nav, m.target, m.x, m.z, _step);
    if (_step.d < CROWD.goneAt || !Number.isFinite(_step.d)) {
      m.state = 'gone';
      this.version++;
      return;
    }
    m.x += _step.x * m.speed * dt;
    m.z += _step.z * m.speed * dt;
    if (_step.x || _step.z) m.yaw = Math.atan2(-_step.x, -_step.z);
    this._ground(m);
  }

  _ground(m) {
    const n = this.nav.nodeAt(m.x, m.z);
    if (n >= 0) m.y += (this.nav.y[n] - m.y) * 0.5;
  }

  /** Standing or praying in place: glance at the player going by, shuffle aside for him. */
  _react(m, dt, p) {
    const C = CROWD;
    const ex = m.hx - p.x;
    const ez = m.hz - p.z;
    const d = Math.hypot(ex, ez);
    // Make way: pushed off the spot by the player, back when he's gone.
    if (d < C.makeWay) {
      const push = (C.makeWay - d) / C.makeWay;
      const k = Math.min(1, dt * 6);
      m.dx += ((ex / (d || 1)) * C.maxDodge * push - m.dx) * k;
      m.dz += ((ez / (d || 1)) * C.maxDodge * push - m.dz) * k;
    } else if (m.dx || m.dz) {
      const k = Math.min(1, dt * 0.8);
      m.dx -= m.dx * k;
      m.dz -= m.dz * k;
      if (Math.abs(m.dx) + Math.abs(m.dz) < 0.01) m.dx = m.dz = 0;
    }
    m.x = m.hx + m.dx;
    m.z = m.hz + m.dz;
    // Glance: someone in range, now and then (once per pass), looks at the player.
    if (m.lookTime > 0) {
      m.lookTime -= dt;
      if (m.lookTime <= 0) {
        m.lookTarget = 0;
        this.glancers = Math.max(0, this.glancers - 1);
      } else {
        const rel = Math.atan2(-(p.x - m.x), -(p.z - m.z)) - m.yaw;
        m.lookTarget = Math.max(-1.1, Math.min(1.1, Math.atan2(Math.sin(rel), Math.cos(rel))));
      }
    } else if (d < C.glanceRange && !m.glanced && this.glancers < C.maxGlancers) {
      m.glanced = true;
      if (hash(m.i + Math.floor(this.time / 30)) < C.glanceChance) {
        const rel = Math.atan2(-(p.x - m.x), -(p.z - m.z)) - m.yaw;
        if (Math.abs(Math.atan2(Math.sin(rel), Math.cos(rel))) < 1.9) {
          m.lookTime = 1.2 + this.rand() * 2;
          this.glancers++;
        }
      }
    } else if (d > C.glanceRange * 1.6) m.glanced = false;
  }

  /** Runners keep a little room between them (crowding at the bottlenecks). */
  _separate() {
    const r = CROWD.personal * 2;
    for (const list of this._grid.values()) {
      for (let a = 0; a < list.length; a++) {
        const A = list[a];
        if (A.state !== 'flee') continue;
        for (let b = a + 1; b < list.length; b++) {
          const B = list[b];
          const ex = B.x - A.x;
          const ez = B.z - A.z;
          const d2 = ex * ex + ez * ez;
          if (d2 > r * r || d2 < 1e-6) continue;
          const d = Math.sqrt(d2);
          const push = (r - d) * 0.5;
          const px = (ex / d) * push;
          const pz = (ez / d) * push;
          if (this.nav.nodeAt(B.x + px, B.z + pz) >= 0) {
            B.x += px;
            B.z += pz;
          }
          if (this.nav.nodeAt(A.x - px, A.z - pz) >= 0) {
            A.x -= px;
            A.z -= pz;
          }
        }
      }
    }
  }

  /** Keeps a point (the player) out of the crowd: returns it pushed out of anyone too close. */
  pushOut(pos, radius = 0.35) {
    const R = CROWD.personal + radius;
    const k0 = Math.floor(pos.x / this._cell);
    const l0 = Math.floor(pos.z / this._cell);
    for (let dk = -1; dk <= 1; dk++) {
      for (let dl = -1; dl <= 1; dl++) {
        const list = this._grid.get((k0 + dk) * 4096 + (l0 + dl));
        if (!list) continue;
        for (const m of list) {
          if (m.fade < 0.5) continue;
          const ex = pos.x - (m.x);
          const ez = pos.z - (m.z);
          const d = Math.hypot(ex, ez);
          if (d < R && d > 1e-4) {
            pos.x += (ex / d) * (R - d);
            pos.z += (ez / d) * (R - d);
          }
        }
      }
    }
    return pos;
  }

  /** The member nearest a point within `range` (who the player talks to), or null. */
  nearest(x, z, range, filter = null) {
    let best = null;
    let bestD = range;
    const k0 = Math.floor(x / this._cell);
    const l0 = Math.floor(z / this._cell);
    const span = Math.ceil(range / this._cell);
    for (let dk = -span; dk <= span; dk++) {
      for (let dl = -span; dl <= span; dl++) {
        const list = this._grid.get((k0 + dk) * 4096 + (l0 + dl));
        if (!list) continue;
        for (const m of list) {
          if (m.state !== 'stay' || (filter && !filter(m))) continue;
          const d = Math.hypot(m.x - x, m.z - z);
          if (d < bestD) {
            bestD = d;
            best = m;
          }
        }
      }
    }
    return best;
  }
}

/**
 * Spots in a zone: a jittered grid `spacing` m apart on walkable floor, inside the rectangle
 * and outside the `avoid` rectangles ([x0, x1, z0, z1]).
 */
export function zoneSpots(nav, rect, spacing, rand, avoid = []) {
  const [x0, x1, z0, z1] = rect;
  const out = [];
  for (let x = x0 + spacing / 2; x < x1; x += spacing) {
    for (let z = z0 + spacing / 2; z < z1; z += spacing) {
      const px = x + (rand() - 0.5) * spacing * 0.45;
      const pz = z + (rand() - 0.5) * spacing * 0.45;
      if (avoid.some(([a0, a1, b0, b1]) => px >= a0 && px <= a1 && pz >= b0 && pz <= b1)) continue;
      const n = nav.nodeAt(px, pz);
      if (n < 0 || Math.hypot(nav.nodeX(n) - px, nav.nodeZ(n) - pz) > nav.cell) continue;
      out.push([px, pz]);
    }
  }
  return out;
}
