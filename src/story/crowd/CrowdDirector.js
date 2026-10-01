import { ACT, CrowdField, zoneSpots } from './CrowdField.js';

// The mission's crowd: who stands where (the script's `crowd` zones), who they are (character
// types by sex, outfits by kind: worshipers in front of the wall, families and visitors in the
// plaza), when they arrive (some there at 21:00, the rest through the evening), sitting on the
// prayer area's chairs, and the run for the shelters and exits when the sirens start. The
// field is pure; the renderer (characters/CrowdRenderer.js) comes with the character library.

const E = -Math.PI / 2;

function pickWeighted(weights, r) {
  let total = 0;
  for (const w of Object.values(weights)) total += w;
  let x = r * total;
  for (const [k, w] of Object.entries(weights)) {
    x -= w;
    if (x <= 0) return k;
  }
  return Object.keys(weights)[0];
}

export class CrowdDirector {
  /**
   * @param {{ nav, config: object, seats?: { x, z, yaw }[], avoid?: number[][], rand?: () => number }} o
   *   config: the script's `crowd`; avoid: [x, z, radius] spots kept clear (the story's people)
   */
  constructor({ nav, config, seats = [], avoid = [], rand = Math.random }) {
    this.nav = nav;
    this.config = config;
    this.seats = seats;
    this.avoid = avoid;
    this.rand = rand;
    this.field = new CrowdField(nav, { rand });
    this.renderer = null;
    this.visible = true;
    this.time = 0; // the crowd's clock (s since 21:00)
  }

  /** Sets up the people once the characters are loaded (a heavy step: the loading screen). */
  async build(renderer, onProgress = null) {
    const C = this.config;
    const rand = this.rand;
    this.renderer = renderer;
    // Character types for the crowd, by sex.
    const lib = renderer.library;
    const men = lib.ids('civilian', 'm');
    const women = lib.ids('civilian', 'f');
    const typeIndex = new Map();
    const all = [...men, ...women];
    for (let i = 0; i < all.length; i++) {
      const id = all[i];
      const female = women.includes(id);
      const kinds = female ? ['worshipperWoman', 'worshipperWoman', 'civilian', 'tourist'] : ['worshipper', 'worshipper', 'civilian', 'tourist'];
      const t = renderer.addType(id, kinds, rand);
      if (t >= 0) typeIndex.set(id, t);
      onProgress?.(i + 1, all.length + 1);
      await new Promise((r) => setTimeout(r, 0));
    }
    const menT = men.map((id) => typeIndex.get(id)).filter((t) => t !== undefined);
    const womenT = women.map((id) => typeIndex.get(id)).filter((t) => t !== undefined);
    if (!menT.length || !womenT.length) return;

    // Entry fields: the way in to each zone (walkers arriving in view follow them).
    const F = this.field;
    for (const z of C.zones) F.field(`in:${z.name}`, z.entry);
    // Evacuation fields too (no hitch when the sirens start).
    for (const t of C.evacuation) F.field(t.name, t.points);

    const clear = (x, z) => this.avoid.every(([ax, az, r]) => Math.hypot(x - ax, z - az) > r);
    const fill = C.present ?? 0.45;
    const span = C.fill ?? 720;
    let n = 0;
    for (const z of C.zones) {
      const spots = zoneSpots(this.nav, z.rect, z.spacing, rand, z.avoid ?? []).filter(([x, zz]) => clear(x, zz));
      const keep = Math.min(spots.length, Math.round(spots.length * (z.share ?? 1)));
      // A random subset (the zone's share), in a random order.
      for (let i = spots.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [spots[i], spots[j]] = [spots[j], spots[i]];
      }
      for (const [x, zz] of spots.slice(0, keep)) {
        const female = z.section === 'women' ? true : z.section === 'men' ? false : rand() < (z.women ?? 0.4);
        const types = female ? womenT : menT;
        const type = types[Math.floor(rand() * types.length) % types.length];
        const kind = pickWeighted(female ? z.kindsWomen ?? z.kinds ?? { civilian: 1 } : z.kindsMen ?? z.kinds ?? { civilian: 1 }, rand);
        const outfit = renderer.outfitFor(type, kind, rand);
        const act = ACT[pickWeighted(z.acts ?? { stand: 1 }, rand)] ?? ACT.stand;
        const yaw = z.face === 'wall' ? E + (rand() - 0.5) * 0.5 : z.face === 'screens' ? this._toScreens(x, zz) : rand() * Math.PI * 2;
        const early = rand() < fill;
        F.add({
          type,
          outfit,
          sex: female ? 'f' : 'm',
          x,
          z: zz,
          yaw,
          act,
          arriveAt: early ? 0 : 20 + rand() * span,
          entry: `in:${z.name}`,
          from: C.entrances[z.from ?? 'south'],
        });
        n++;
      }
    }
    // Some sit on the prayer area's chairs with a prayer book.
    const seatShare = C.seats ?? 0.5;
    for (const s of this.seats) {
      if (rand() > seatShare || !clear(s.x, s.z)) continue;
      const female = s.z > (C.mechitzaZ ?? 17);
      const types = female ? womenT : menT;
      const type = types[Math.floor(rand() * types.length) % types.length];
      const outfit = renderer.outfitFor(type, female ? 'worshipperWoman' : 'worshipper', rand);
      // Sitting: the hips over the seat, the feet in front of it.
      const fx = -Math.sin(s.yaw) * 0.22;
      const fz = -Math.cos(s.yaw) * 0.22;
      F.add({ type, outfit, sex: female ? 'f' : 'm', x: s.x + fx, z: s.z + fz, yaw: s.yaw, act: ACT.sit, arriveAt: rand() < fill ? 0 : 20 + rand() * span, entry: null });
      n++;
    }
    renderer.build(F);
    onProgress?.(1, 1);
    this.count = n;
    this.ready = true;
  }

  _toScreens(x, z) {
    const S = this.config.screens ?? [];
    let best = null;
    let bestD = Infinity;
    for (const [sx, sz] of S) {
      const d = Math.hypot(sx - x, sz - z);
      if (d < bestD) {
        bestD = d;
        best = [sx, sz];
      }
    }
    if (!best) return E;
    return Math.atan2(-(best[0] - x), -(best[1] - z));
  }

  /** The crowd's clock (arrivals): `t` s since 21:00. */
  setTime(t) {
    this.field.reset(t);
  }

  /** The sirens: everyone runs (fast: already gone). */
  evacuate(fast = false) {
    this.field.evacuate(this.config.evacuation, { fast });
  }

  setVisible(v) {
    this.visible = v;
    if (this.renderer) this.renderer.root.visible = v;
  }

  /** Per frame. `player`, `camera`: { x, z } (the camera's own position for the drawing). */
  update(dt, player, camera3) {
    if (!this.ready || !this.visible) return;
    this.field.update(dt, player, camera3 ? camera3.position : player);
    this.renderer.update(this.field, camera3, dt);
  }
}
