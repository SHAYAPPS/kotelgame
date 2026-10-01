import { blackHat, hatFit, headband, headbandFit, headscarf, kippah, kippahFit, KIPPAH, scarfFit, vest, vestFit } from './attachments.js';
import { PART } from './config.js';
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
    if (info.vest) model.attach('Spine2', vest(model.type.fitted('vest', (pts, t) => vestFit(t.torsoSurface()))), { shadow: true });
    return;
  }
  if (info.role === 'enemy') {
    model.addRifle('ak');
    if (!head) return;
    // Faces are covered in the textures (balaclava / face wrap / the ninja's mask). The
    // headband's color shows the attacker's role (see story/difficulty.js).
    const fit = model.type.fitted('headband', (pts) => headbandFit(head, pts));
    model.attach('Head', headband(head, band, fit), { hideBeyond: 45 });
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
  // Head wear sits on the hair: fitted to each model's real head surface (headFit.js).
  const type = model.type;
  if (o.head.type === 'blackHat') model.attach('Head', blackHat(head, { fit: type.fitted('hat', (pts) => hatFit(head, pts)) }), { hideBeyond: 70 });
  else if (o.head.type === 'scarf') {
    // A tichel covers all the hair: hide it, lay the cloth over the head (and the flattened hair).
    model.hide[4] = 1;
    const fit = type.fitted('scarf', (pts, t) => scarfFit(head, t.headSurface(PART.fixed), t.headSurface(PART.hair)));
    model.attach('Head', headscarf(head, o.head.color, fit), { hideBeyond: 60 });
  }
  else if (o.head.type === 'kippah') {
    const knit = o.head.knit !== undefined ? KNITS[o.head.knit] : null;
    const style = o.head.style ?? 'velvet';
    const fit = type.fitted(`kippah:${style}`, (pts) => kippahFit(head, pts, (KIPPAH[style] ?? KIPPAH.velvet).arc));
    model.attach('Head', kippah(head, { style, knit, rim: o.head.rim, fit }), { hideBeyond: 32 });
  }
}

/**
 * Every fitted shape this character type can need (head wear by its role and sex, the vest),
 * computed now: they're cached per type, so the crowd later dresses without a hitch (the
 * loading screen calls this).
 */
export function prepareFits(type) {
  const info = type.info;
  const head = info.head;
  if (info.role === 'squad') {
    if (info.vest) type.fitted('vest', (pts, t) => vestFit(t.torsoSurface()));
    return;
  }
  if (!head) return;
  if (info.role === 'enemy') {
    type.fitted('headband', (pts) => headbandFit(head, pts));
    return;
  }
  if (info.sex === 'f') {
    type.fitted('scarf', (pts, t) => scarfFit(head, t.headSurface(PART.fixed), t.headSurface(PART.hair)));
    return;
  }
  type.fitted('hat', (pts) => hatFit(head, pts));
  for (const [style, k] of Object.entries(KIPPAH)) type.fitted(`kippah:${style}`, (pts) => kippahFit(head, pts, k.arc));
}
