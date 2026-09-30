import { blackHat, headband, headscarf, kippah, sunHat, vest } from './attachments.js';

// Who wears what. Squad: olive, helmets (in the models), vests, M4-style rifles. Enemies:
// dark clothes, faces covered, green headbands, AK-style rifles (a different silhouette
// at any distance: no helmets or plate carriers, wrapped heads). Civilians: their own
// clothes, recolored per person, plus kippot / hats / headscarves by kind.

const GREEN_BAND = 0x1f7a2e;

// Part slots (converter PART): 1 top, 2 bottom, 3 shoes, 4 hair. Linear colors (they show
// lighter on screen); no beige or pale pink tops, which read as bare skin at a distance.
const TOPS = [
  [0.8, 0.12, 0.1], [0.12, 0.3, 0.62], [0.9, 0.62, 0.12], [0.2, 0.5, 0.25], [0.52, 0.2, 0.55],
  [0.1, 0.55, 0.55], [0.85, 0.85, 0.82], [0.35, 0.35, 0.38], [0.2, 0.02, 0.04], [0.75, 0.12, 0.3],
];
const BOTTOMS = [[0.12, 0.14, 0.2], [0.3, 0.26, 0.2], [0.05, 0.05, 0.06], [0.42, 0.4, 0.36], [0.16, 0.22, 0.32], [0.5, 0.45, 0.35]];
const HAIR = [[0.05, 0.035, 0.025], [0.2, 0.12, 0.06], [0.45, 0.3, 0.15], [0.1, 0.08, 0.07], [0.6, 0.55, 0.5]];
const SCARVES = [0x3d4459, 0x5b3a3a, 0x2f4a44, 0x6d5f4a, 0x4a3d58, 0x777777];

const pick = (list, r) => list[Math.floor(r() * list.length) % list.length];

/**
 * @param {import('./CharacterModel.js').CharacterModel} model
 * @param {{ kind?: string, variant?: number, rand?: () => number, band?: number }} opts kind: the
 *   NPC kind (worshipper, worshipperWoman, tourist, guide, civilian, soldier, commander);
 *   band: an enemy's headband color
 */
export function dressCharacter(model, { kind = null, variant = 0, rand = Math.random, band = GREEN_BAND } = {}) {
  const info = model.info;
  const id = model.type.id;
  const head = info.head;
  if (info.role === 'squad') {
    model.addRifle('m4');
    if (info.vest && info.chest) model.attach('Spine2', vest(info.chest), { shadow: true });
    return;
  }
  if (info.role === 'enemy') {
    model.addRifle('ak');
    if (!head) return;
    // Faces are covered in the textures (balaclava / face wrap / the ninja's mask). The
    // headband's color shows the attacker's role (see story/difficulty.js).
    model.attach('Head', headband(head, band), { hideBeyond: 45 });
    return;
  }
  // Civilians: per-person colors.
  const t = model.tints;
  const parts = new Set(info.parts);
  if (kind === 'worshipper') {
    // White shirt, dark trousers; a kippah, or a black hat with the suits.
    if (parts.has(2)) t[2].set(0.03, 0.03, 0.035, 1);
    if (/joe|josh/.test(id) && rand() < 0.7) model.attach('Head', blackHat(head), { hideBeyond: 70 });
    else if (head) model.attach('Head', kippah(head, rand() < 0.75 ? 0x101014 : 0xe8e8e8), { hideBeyond: 25 });
    return;
  }
  if (kind === 'worshipperWoman') {
    if (head) model.attach('Head', headscarf(head, pick(SCARVES, rand)), { hideBeyond: 60 });
    if (parts.has(2)) t[2].set(...pick([[0.1, 0.1, 0.13], [0.2, 0.16, 0.12], [0.16, 0.18, 0.26]], rand), 1);
    if (parts.has(1) && rand() < 0.6) t[1].set(...pick(TOPS, rand), 0.85);
    return;
  }
  if (kind === 'guide') {
    // Bright yellow shirt: easy to follow in a crowd.
    if (parts.has(1)) t[1].set(1.0, 0.82, 0.08, 1);
    if (head && rand() < 0.5) model.attach('Head', sunHat(head, 0xd9c79a), { hideBeyond: 60 });
    return;
  }
  // Tourists / passers-by: random shirt, trousers, sometimes hair color and a sun hat.
  if (parts.has(1) && rand() < 0.8) t[1].set(...pick(TOPS, rand), 0.9);
  if (parts.has(2) && rand() < 0.6) t[2].set(...pick(BOTTOMS, rand), 0.9);
  if (parts.has(4) && rand() < 0.4) t[4].set(...pick(HAIR, rand), 0.8);
  if (kind === 'tourist' && head && rand() < 0.45) model.attach('Head', sunHat(head, pick([0xe6d8ae, 0xf2f2ee, 0x2d3b55], rand)), { hideBeyond: 60 });
}
