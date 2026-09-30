// What the civilians at the Kotel wear, and who plays whom. Pure logic (no three.js).
//
// Men: mostly visitors in white shirts with dark trousers or jeans; haredim in black suits,
// white shirts and black hats; men in suits; tourists in t-shirts. Every man covers his head:
// a black hat (haredim) or a kippah (black velvet, white, or a colorful knitted one).
// Women: long skirts and long sleeves; worshipers mostly with a headscarf.
//
// The picks look at the people already standing nearby, so neighbors differ: another model
// if possible, and colors / head wear unlike theirs.

// Linear colors (the tint shader works in linear space; they look lighter on screen).
const WHITE_SHIRTS = [[0.9, 0.9, 0.88], [0.95, 0.95, 0.95], [0.72, 0.8, 0.9], [0.86, 0.84, 0.74]];
const DARK_TROUSERS = [[0.012, 0.012, 0.014], [0.04, 0.04, 0.045], [0.018, 0.022, 0.05], [0.06, 0.05, 0.04]];
const JEANS = [[0.05, 0.09, 0.2], [0.09, 0.14, 0.28], [0.03, 0.05, 0.11], [0.12, 0.13, 0.15]];
const KHAKI = [[0.3, 0.25, 0.15], [0.33, 0.32, 0.27], [0.16, 0.15, 0.1]];
// (No bright yellow: that is the tour guide's shirt.)
const TSHIRTS = [
  [0.8, 0.12, 0.1], [0.12, 0.3, 0.62], [0.45, 0.14, 0.03], [0.2, 0.5, 0.25], [0.52, 0.2, 0.55], [0.1, 0.55, 0.55],
  [0.35, 0.35, 0.38], [0.2, 0.02, 0.04], [0.75, 0.12, 0.3], [0.02, 0.02, 0.025], [0.03, 0.08, 0.2], [0.85, 0.85, 0.82],
];
const SUITS = [[0.01, 0.01, 0.012], [0.015, 0.02, 0.05], [0.04, 0.04, 0.045], [0.07, 0.065, 0.06]];
const TIES = [[0.2, 0.02, 0.04], [0.02, 0.05, 0.2], [0.05, 0.05, 0.06], [0.3, 0.2, 0.05], [0.1, 0.25, 0.3]];
const BLACK = [0.012, 0.012, 0.014];
const GUIDE_SHIRT = [1.0, 0.82, 0.08];
const HAIR = [[0.02, 0.014, 0.01], [0.06, 0.035, 0.018], [0.18, 0.1, 0.04], [0.035, 0.03, 0.028], [0.35, 0.3, 0.26]];

// Women
const W_TOPS = [
  [0.9, 0.9, 0.88], [0.86, 0.82, 0.7], [0.018, 0.024, 0.06], [0.012, 0.012, 0.014], [0.2, 0.2, 0.22], [0.22, 0.02, 0.05],
  [0.03, 0.18, 0.2], [0.25, 0.05, 0.14], [0.1, 0.17, 0.35], [0.4, 0.1, 0.2], [0.55, 0.62, 0.72], [0.06, 0.14, 0.08],
];
const SKIRTS = [
  [0.012, 0.016, 0.04], [0.008, 0.008, 0.009], [0.035, 0.035, 0.04], [0.06, 0.1, 0.2], [0.08, 0.05, 0.03],
  [0.03, 0.07, 0.04], [0.13, 0.025, 0.045], [0.25, 0.22, 0.17], [0.09, 0.09, 0.1], [0.05, 0.03, 0.08],
];
const TIGHTS = [[0.012, 0.01, 0.01], [0.06, 0.04, 0.035], [0.015, 0.015, 0.03]];
export const SCARVES = [0x3d4459, 0x5b3a3a, 0x2f4a44, 0x6d5f4a, 0x4a3d58, 0x777777, 0x1c2a44, 0x8a6b3e, 0x2b2b2b, 0x6e2f45];

// Kippot: knitted ones carry a patterned band near the rim ([base, pattern..., rim]).
export const KNITS = [
  { base: 0x1d2b4f, pattern: [0xf0f0f0], rim: 0xf0f0f0 },
  { base: 0xf2f2f0, pattern: [0x2a57a5], rim: 0x2a57a5 },
  { base: 0x151515, pattern: [0xf0f0f0, 0xc9a13a], rim: 0xf0f0f0 },
  { base: 0xf2f2f0, pattern: [0xe07a1f, 0x2f8a3a, 0x2a57a5], rim: 0x2f8a3a },
  { base: 0xd9c7a0, pattern: [0x6b4a2b], rim: 0x6b4a2b },
  { base: 0x9cc3e6, pattern: [0xf5f5f5], rim: 0x1d2b4f },
  { base: 0x2f5d3a, pattern: [0xf2e6c2], rim: 0xf2e6c2 },
  { base: 0xf2f2f0, pattern: [0xc0392b, 0xf1c40f, 0x27ae60, 0x2980b9], rim: 0xc0392b },
  { base: 0x6b1f2a, pattern: [0xf0f0f0], rim: 0x151515 },
];

// Which models can wear which look (see public/assets/characters: Joe / Josh wear suits,
// Brian a polo and jeans, Bryce / Remy t-shirts and shorts, Lewis his own clothes).
const CAN = {
  civ_joe: ['haredi', 'suit'],
  civ_josh: ['haredi', 'suit'],
  civ_brian: ['whiteShirt', 'casual'],
  civ_bryce: ['whiteShirt', 'casual', 'guide'],
  civ_remy: ['whiteShirt', 'casual'],
  civ_lewis: ['own'],
};
const LOOKS = {
  worshipper: { haredi: 0.5, suit: 0.2, whiteShirt: 0.28, casual: 0.02, own: 0.2 },
  civilian: { haredi: 0.2, suit: 0.15, whiteShirt: 0.45, casual: 0.2, own: 0.3 },
  tourist: { suit: 0.05, whiteShirt: 0.3, casual: 0.65, own: 0.4 },
  guide: { guide: 1 },
};
// Who plays whom (model -> relative share), per NPC kind.
export const CAST = {
  worshipper: { civ_joe: 1, civ_josh: 1, civ_brian: 1, civ_bryce: 0.8, civ_remy: 0.8, civ_lewis: 0.7 },
  worshipperWoman: { civ_martha: 1, civ_kate: 1, civ_elizabeth: 1, civ_megan: 1, civ_sophie: 1 },
  tourist: { civ_remy: 1, civ_bryce: 1, civ_lewis: 0.7, civ_brian: 0.6, civ_sophie: 1, civ_megan: 1, civ_elizabeth: 0.8, civ_kate: 0.8 },
  guide: { civ_bryce: 1 },
  civilian: { civ_lewis: 1, civ_josh: 1, civ_joe: 0.7, civ_brian: 1, civ_remy: 0.7, civ_bryce: 0.6, civ_kate: 1, civ_martha: 1, civ_megan: 1, civ_sophie: 1, civ_elizabeth: 1 },
};

const pick = (list, rand) => list[Math.floor(rand() * list.length) % list.length];
const chance = (p, rand) => rand() < p;
function weighted(weights, rand) {
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  let sum = 0;
  for (const [, w] of entries) sum += w;
  let r = rand() * sum;
  for (const [k, w] of entries) if ((r -= w) <= 0) return k;
  return entries[entries.length - 1]?.[0];
}

/** Head wear for a man by look: a black hat, or a kippah in one of three styles. */
function manHead(look, rand) {
  if (look === 'haredi') return { type: 'blackHat' };
  const odds = {
    suit: { velvet: 0.6, knit: 0.4, white: 0 },
    whiteShirt: { velvet: 0.4, knit: 0.45, white: 0.15 },
    casual: { velvet: 0.25, knit: 0.3, white: 0.45 },
    guide: { velvet: 0.3, knit: 0.7, white: 0 },
    own: { velvet: 0.4, knit: 0.35, white: 0.25 },
  }[look] ?? { velvet: 0.5, knit: 0.5 };
  const style = weighted(odds, rand);
  if (style === 'knit') {
    const knit = Math.floor(rand() * KNITS.length) % KNITS.length;
    return { type: 'kippah', style, knit };
  }
  return { type: 'kippah', style, rim: style === 'white' && chance(0.5, rand) ? pick([0x2a57a5, 0xb8b8c0, 0xc9a13a], rand) : null };
}

function headKey(h) {
  if (!h) return 'none';
  if (h.type === 'kippah') return `kippah:${h.style}:${h.knit ?? h.rim ?? ''}`;
  if (h.type === 'scarf') return `scarf:${h.color}`;
  return h.type;
}

/**
 * One outfit for model `id` (manifest info: sex, parts) as an NPC of `kind`.
 * @returns {{ look: string, tints: Record<number, number[]>, flat: Record<number, number>,
 *   inflate: Record<number, number>, head: object|null, sig: object }} tints: part -> [r, g, b,
 *   amount] (linear); inflate: part -> m (bare skin dressed as sleeves / trousers)
 */
export function makeOutfit(id, info, kind, rand = Math.random) {
  const parts = new Set(info?.parts ?? []);
  const tints = {};
  const flat = {};
  const inflate = {};
  // part, color, amount, flat (0 = keep the texture's shading), inflate (m, dressed skin)
  const set = (part, c, a = 1, f = 0, puff = 0) => {
    if (!parts.has(part)) return;
    tints[part] = [c[0], c[1], c[2], a];
    if (f) flat[part] = f;
    if (puff) inflate[part] = puff;
  };
  let look;
  let head = null;
  if (chance(0.3, rand)) set(4, pick(HAIR, rand), 0.75);
  if (info?.sex === 'f') {
    look = 'modest';
    const top = pick(W_TOPS, rand);
    set(1, top, 0.92);
    set(6, pick(WHITE_SHIRTS, rand), 0.9); // blouse under a jacket
    set(8, top, 1, 0.75, 0.005); // bare arms -> long sleeves in the top's color
    set(7, pick(SKIRTS, rand), 1);
    set(2, pick(DARK_TROUSERS, rand), 0.9); // under the skirt: dark
    set(9, pick(TIGHTS, rand), 1, 0.6, 0.002); // bare legs -> tights
    const scarf = kind === 'worshipperWoman' ? 0.75 : kind === 'civilian' ? 0.35 : 0;
    if (chance(scarf, rand)) head = { type: 'scarf', color: pick(SCARVES, rand) };
  } else {
    const can = CAN[id] ?? ['own'];
    const odds = LOOKS[kind] ?? LOOKS.civilian;
    look = weighted(Object.fromEntries(can.map((l) => [l, odds[l] ?? 0])), rand) ?? can[0];
    if (look === 'haredi') {
      set(1, BLACK, 1);
      set(6, pick(WHITE_SHIRTS.slice(0, 2), rand), 1);
      set(2, BLACK, 1);
      set(5, BLACK, 1);
      set(3, BLACK, 1);
    } else if (look === 'suit') {
      const suit = pick(SUITS, rand);
      set(1, suit, 1);
      set(6, pick(WHITE_SHIRTS, rand), 1);
      set(2, chance(0.7, rand) ? suit : pick(DARK_TROUSERS, rand), 1);
      set(5, pick(TIES, rand), 0.9);
    } else if (look === 'whiteShirt' || look === 'casual' || look === 'guide') {
      const top = look === 'guide' ? GUIDE_SHIRT : look === 'whiteShirt' ? pick(WHITE_SHIRTS, rand) : pick(TSHIRTS, rand);
      set(1, top, look === 'casual' ? 0.9 : 1);
      const trousers = look === 'whiteShirt' ? pick(chance(0.55, rand) ? DARK_TROUSERS : JEANS, rand) : pick(chance(0.6, rand) ? JEANS : KHAKI, rand);
      set(2, trousers, 0.95);
      // Shorts become long trousers: always for white shirts and the guide, mostly for tourists.
      if (look !== 'casual' || chance(0.6, rand)) set(9, trousers, 1, 0.75, 0.012);
    }
    head = manHead(look, rand);
  }
  return { look, tints, flat, inflate, head, sig: { id, look, top: tints[1] ?? null, bottom: tints[7] ?? tints[2] ?? null, head: headKey(head) } };
}

// Colors compared in (roughly) perceptual space.
function colorClose(a, b) {
  if (!a || !b) return a === b ? 0.5 : 0;
  let d = 0;
  for (let k = 0; k < 3; k++) d += (Math.sqrt(a[k]) - Math.sqrt(b[k])) ** 2;
  return Math.max(0, 1 - Math.sqrt(d) / 0.3);
}

/** How alike two people look (0 = nothing in common .. ~6 = identical). */
export function likeness(a, b) {
  let s = a.id === b.id ? 2 : 0;
  if (a.look === b.look) s += 0.5;
  s += colorClose(a.top, b.top) + colorClose(a.bottom, b.bottom);
  if (a.head === b.head) s += 1;
  return s;
}

/**
 * Model and outfit for a new civilian, unlike the neighbors.
 * @param {string} kind NPC kind (worshipper, worshipperWoman, tourist, guide, civilian)
 * @param {{ sig: object, near: number }[]} neighbors people already placed nearby; `near`
 *   is 1 right next to them .. 0 at the edge of the neighborhood
 * @param {(id: string) => object|null} infoOf manifest info of a loaded model (null if not)
 * @returns {{ id: string, outfit: object } | null}
 */
export function dressPerson(kind, neighbors, infoOf, rand = Math.random) {
  const cast = CAST[kind] ?? CAST.civilian;
  let best = null;
  let bestScore = Infinity;
  for (const [id, share] of Object.entries(cast)) {
    if (!infoOf(id)) continue;
    let score = -Math.log(share) * 0.6 + rand() * 0.5;
    for (const n of neighbors) if (n.sig.id === id) score += 2 * n.near;
    if (score < bestScore) {
      bestScore = score;
      best = id;
    }
  }
  if (!best) return null;
  // A few outfits for that model; keep the one least like the neighbors.
  const info = infoOf(best);
  let outfit = null;
  let least = Infinity;
  for (let k = 0; k < 6; k++) {
    const o = makeOutfit(best, info, kind, rand);
    let s = 0;
    for (const n of neighbors) s += likeness(o.sig, n.sig) * n.near;
    if (s < least) {
      least = s;
      outfit = o;
    }
  }
  return { id: best, outfit };
}
