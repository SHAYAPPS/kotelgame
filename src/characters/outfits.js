import { HEAD_TOP, KIPPAH_AXIS, blackHat, headband, headscarf, kippah, vest } from './attachments.js';
import { KNITS, makeOutfit } from './wardrobe.js';

// Who wears what. Squad: olive, helmets (in the models), vests, M4-style rifles. Enemies:
// dark clothes, faces covered, headbands in their role's color, AK-style rifles (a different
// silhouette at any distance: no helmets or plate carriers, wrapped heads). Civilians: an
// outfit from the wardrobe (wardrobe.js: Kotel visitors, haredim, tourists, women in long
// skirts), tinted per clothing part, plus a kippah, black hat or headscarf.

const GREEN_BAND = 0x1f7a2e;

/**
 * @param {import('./CharacterModel.js').CharacterModel} model
 * @param {{ kind?: string, variant?: number, rand?: () => number, band?: number, outfit?: object }} opts kind: the
 *   NPC kind (worshipper, worshipperWoman, tourist, guide, civilian, soldier, commander);
 *   band: an enemy's headband color; outfit: a civilian's wardrobe outfit (else one is made)
 */
export function dressCharacter(model, { kind = null, variant = 0, rand = Math.random, band = GREEN_BAND, outfit = null } = {}) {
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
  // Civilians: an outfit from the wardrobe (story NPCs get one unlike their neighbors').
  const o = outfit ?? makeOutfit(id, info, kind ?? 'civilian', rand);
  applyOutfit(model, o);
}

/** Part tints and head wear of a wardrobe outfit (wardrobe.js makeOutfit). */
export function applyOutfit(model, o) {
  for (const [part, c] of Object.entries(o.tints)) model.tints[+part].set(c[0], c[1], c[2], c[3] ?? 1);
  for (const [part, f] of Object.entries(o.flat)) model.flat[+part] = f;
  for (const [part, m] of Object.entries(o.inflate ?? {})) model.setInflate(+part, m);
  const head = model.info.head;
  if (!head || !o.head) return;
  // Head wear sits on the hair: how far it stands off the skull, measured per model.
  const type = model.type;
  if (o.head.type === 'blackHat') model.attach('Head', blackHat(head, { hair: type.hairScale(HEAD_TOP, 0.9, 0.92) }), { hideBeyond: 70 });
  else if (o.head.type === 'scarf') {
    // A tichel covers all the hair: hide it, lay the cloth over the scalp.
    model.hide[4] = 1;
    model.attach('Head', headscarf(head, o.head.color, { shell: (d) => type.hairScale(d, 0.28, 0.65, 0.3, false) }), { hideBeyond: 60 });
  }
  else if (o.head.type === 'kippah') {
    const knit = o.head.knit !== undefined ? KNITS[o.head.knit] : null;
    model.attach('Head', kippah(head, { style: o.head.style, knit, rim: o.head.rim, hair: type.hairScale(KIPPAH_AXIS, 0.45, 0.6) }), { hideBeyond: 32 });
  }
}
