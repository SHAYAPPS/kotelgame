// What the character converter builds (scripts/assets/characters.mjs): which Mixamo files,
// how each character is recolored and simplified, and how each clip is processed.
// Sources: assets-src/mixamo/ (see DOWNLOADS.md). Colors are 0-255 sRGB.

// Tint / part slots (vertex attribute `_part`): the game can recolor slots 1-5 per person.
export const PART = { fixed: 0, top: 1, bottom: 2, shoes: 3, hair: 4, extra: 5 };

const partsFuse = [
  [/Hair/i, PART.hair],
  [/Shirt|Hoody|Cloth|Tops?$|Suit/i, PART.top],
  [/Pants|Shorts|Bottoms|Skirt/i, PART.bottom],
  [/Sneakers|Shoes|Heels|Socks|Boots/i, PART.shoes],
  [/Belt|Tie/i, PART.extra],
];
const DROP = /Eyelash|Eyelasshes/i; // tiny alpha cards; invisible at game distances
const COVER = /Shirt|Hoody|Cloth|Tops?$|Suit|Pants|Shorts|Bottoms|Sneakers|Shoes|Heels|Socks|Belt|Tie/i;

const OLIVE = [96, 101, 66]; // IDF-style olive drab (a little grey)
const OLIVE_DARK = [66, 70, 46];
const CHARCOAL = [34, 34, 36];

const civilian = { role: 'civilian', size: 1024, hair: 512, normalScale: 0.5, lods: [10000, 3200, 1100], parts: partsFuse, drop: DROP, body: /_?Body1?$|^Body$/i, cover: COVER };

export const CHARACTERS = {
  // The squad: olive uniforms, vests and helmets.
  squad_swat: {
    src: 'Swat', role: 'squad', sex: 'm', size: 1024, normalScale: 0.5, lods: [14000, 4500, 1500],
    credit: 'recolored olive, "SWAT" lettering removed',
    // Blue-grey camo, black vest and helmet -> olive shades (texture detail kept).
    despeckle: { material: /body/i }, // no "SWAT" lettering on the vest
    recolor: [{ material: /body/i, to: OLIVE, contrast: 0.7, skipSkin: true }],
  },
  squad_swatguy: {
    src: 'SwatGuy', mixamo: 'Swat Guy', role: 'squad', sex: 'm', size: 1024, normalScale: 0.5, lods: [14000, 4500, 1500],
    credit: 'recolored olive',
    recolor: [{ material: /./, to: OLIVE, contrast: 0.65, skipSkin: true }],
  },
  squad_steve: {
    src: 'Steve', role: 'squad', sex: 'm', size: 1024, normalScale: 0.5, lods: [14000, 4500, 1500], drop: DROP,
    credit: 'toned to olive; a vest is added in game',
    recolor: [{ material: /./, to: OLIVE, contrast: 0.9, skipSkin: true, amount: 0.55 }],
    addVest: true,
  },
  // Enemies: dark clothes; faces covered (masks / wraps are added in the game).
  enemy_ninja: {
    src: 'Ninja', role: 'enemy', sex: 'm', size: 1024, normalScale: 0.5, lods: [12000, 4000, 1300],
    credit: 'darkened',
    recolor: [{ material: /./, to: CHARCOAL, contrast: 0.8, skipSkin: true, gain: 0.75 }],
  },
  enemy_david: {
    ...civilian, src: 'David', role: 'enemy', sex: 'm', lods: [12000, 4000, 1300], drop: /Eyelash|Hair/i,
    credit: 'darkened; hair removed, balaclava painted on',
    recolor: [{ parts: [PART.top, PART.bottom, PART.shoes], to: CHARCOAL, contrast: 0.8, gain: 0.8 }],
    faceCover: { type: 'balaclava', color: [26, 26, 28], slit: 0.016, eyeHalfWidth: 0.062 },
  },
  enemy_alex: {
    src: 'Alex', role: 'enemy', sex: 'm', size: 1024, normalScale: 0.5, lods: [12000, 4000, 1300],
    recolor: [{ material: /./, to: CHARCOAL, contrast: 0.85, skipSkin: true, gain: 0.9, amount: 0.6 }],
    faceCover: { type: 'lower', color: [38, 36, 34] },
    credit: 'darkened; face wrap painted on',
  },
  // Civilians: their own everyday clothes; the game varies shirt/trouser colors per person.
  civ_brian: { ...civilian, src: 'Brian', sex: 'm' },
  civ_joe: { ...civilian, src: 'Joe', sex: 'm' },
  civ_josh: { ...civilian, src: 'Josh', sex: 'm' },
  civ_lewis: { ...civilian, src: 'Lewis', sex: 'm', parts: [], hairMaterial: /hair/i },
  civ_remy: { ...civilian, src: 'Remy', sex: 'm', drop: /Eyelash|^Eyes$/i, size: 1024, sizes: { Bodymat: 1024 }, smallSize: 512 },
  civ_bryce: { ...civilian, src: 'Bryce', sex: 'm' },
  civ_martha: { ...civilian, src: 'Martha', sex: 'f' },
  civ_kate: { ...civilian, src: 'Kate', sex: 'f' },
  civ_elizabeth: { ...civilian, src: 'Elizabeth', sex: 'f' },
  civ_sophie: { ...civilian, src: 'Sophie', sex: 'f' },
  civ_megan: { ...civilian, src: 'Megan', sex: 'f' },
};

// Clips shipped in anims.bin (a few downloads are not used: see DOWNLOADS.md).
// loop: cycles; move: locomotion (speed measured, played in place, left foot down at
// phase 0); root: keep the root motion (deaths); ik: bake the hand targets (rifle clips).
const L = { loop: true };
const IDLE = { loop: true, fps: 15, maxLoop: 8 }; // slow idles: 15 fps, long ones cut to 8 s loops
const MOVE = { loop: true, move: true };
const RIFLE = { ik: true };
const dirs = ['f', 'fl', 'fr', 'l', 'r', 'b', 'bl', 'br'];

export const CLIPS = {
  rifle_idle: { ...L, ...RIFLE },
  rifle_idle_aiming: { ...L, ...RIFLE },
  rifle_crouch_idle: { ...L, ...RIFLE },
  rifle_crouch_idle_aiming: { ...L, ...RIFLE },
  rifle_idle_relaxed: { ...IDLE, ...RIFLE },
  rifle_idle_lookaround: { ...IDLE, ...RIFLE },
  ...Object.fromEntries(dirs.flatMap((d) => [
    [`rifle_walk_${d}`, { ...MOVE, ...RIFLE }],
    [`rifle_run_${d}`, { ...MOVE, ...RIFLE }],
    [`rifle_crouchwalk_${d}`, { ...MOVE, ...RIFLE }],
  ])),
  rifle_walk_relaxed: { ...MOVE, ...RIFLE },
  rifle_run_relaxed: { ...MOVE, ...RIFLE },
  rifle_fire_stand: { ...RIFLE },
  rifle_reload_stand: { ...RIFLE },
  rifle_reload_crouch: { ...RIFLE },
  grenade_toss_stand: { ...RIFLE, release: 'RightHand' },
  grenade_throw_crouch: { ...RIFLE, release: 'RightHand' },
  hit_rifle_stand: { ...RIFLE },
  hit_rifle_front_left: { ...RIFLE },
  hit_rifle_crouch: { ...RIFLE },
  cover_wall_idle: { ...L, ...RIFLE },
  death_front: { ...RIFLE, root: true },
  death_back: { ...RIFLE, root: true },
  death_left: { ...RIFLE, root: true },
  death_right: { ...RIFLE, root: true },
  death_headshot_front: { ...RIFLE, root: true },
  death_headshot_back: { ...RIFLE, root: true },
  death_crouch_headshot: { ...RIFLE, root: true },
  // Civilians
  idle_standing: IDLE,
  idle_breathing: IDLE,
  idle_weightshift: IDLE,
  idle_lookaround: IDLE,
  idle_nervous: IDLE,
  talk_general: IDLE,
  talk_phone_female: IDLE,
  talk_phone_male: IDLE,
  texting: IDLE,
  praying_swaying: L,
  terrified: IDLE,
  walk_male: MOVE,
  walk_female: MOVE,
  run_scared_lookback: MOVE,
  run_standard: MOVE,
  cower_hiding: {},
};

// Where each clip came from on Mixamo (for CREDITS.md; see DOWNLOADS.md).
const PACK = 'Pro Rifle Pack: ';
const DIR_NAMES = { f: 'forward', fl: 'forward left', fr: 'forward right', l: 'left', r: 'right', b: 'backward', bl: 'backward left', br: 'backward right' };
export const CLIP_SOURCES = {
  rifle_idle: `${PACK}idle`,
  rifle_idle_aiming: `${PACK}idle aiming`,
  rifle_crouch_idle: `${PACK}idle crouching`,
  rifle_crouch_idle_aiming: `${PACK}idle crouching aiming`,
  ...Object.fromEntries(Object.entries(DIR_NAMES).flatMap(([k, d]) => [
    [`rifle_walk_${k}`, `${PACK}walk ${d}`],
    [`rifle_run_${k}`, `${PACK}run ${d}`],
    [`rifle_crouchwalk_${k}`, `${PACK}walk crouching ${d}`],
  ])),
  rifle_sprint_f: `${PACK}sprint forward`,
  death_front: `${PACK}death from the front`,
  death_back: `${PACK}death from the back`,
  death_right: `${PACK}death from right`,
  death_left: `${PACK}death from right (mirrored)`,
  death_headshot_front: `${PACK}death from front headshot`,
  death_headshot_back: `${PACK}death from back headshot`,
  death_crouch_headshot: `${PACK}death crouching headshot front`,
  rifle_walk_relaxed: 'Rifle Walk (Walking With Rifle Down)',
  rifle_run_relaxed: 'Rifle Run (Running With Rifle Down)',
  rifle_idle_relaxed: 'Rifle Idle (Two Hand Lowered Gun Rifle Idle)',
  rifle_idle_lookaround: 'Rifle Idle (Rifle Idle Looking Around)',
  rifle_fire_stand: 'Firing Rifle (Firing A Rifle While Standing)',
  rifle_reload_stand: 'Reloading (Reloading Rifle While Standing)',
  rifle_reload_crouch: 'Reload (Reload Rifle While In Crouch Position)',
  grenade_toss_stand: 'Toss Grenade (Throwing Something Holding Rifle Aimed)',
  grenade_throw_crouch: 'Throw Grenade (Throwing Grenade While Crouched)',
  hit_rifle_stand: 'Hit Reaction (Hit Reaction While Holding A Rifle)',
  hit_rifle_front_left: 'Hit Reaction (Left Reaction To Front Hit Holding A Rifle)',
  hit_rifle_crouch: 'Hit Reaction (Hit Reaction From Rifle Crouched)',
  cover_wall_idle: 'Taking Cover Idle (Cover Idle Against A Wall With Rifle)',
  cover_wall_enter: 'Taking Cover (Taking Cover Against A Wall With Rifle)',
  idle_standing: 'Idle (Standing Idle)',
  idle_breathing: 'Breathing Idle',
  idle_weightshift: 'Idle (Weight Shift Idle)',
  idle_lookaround: 'Looking Around (Idle Stand Looking Around)',
  idle_nervous: 'Nervously Look Around (Nervously Looking Around Left To Right - Loop)',
  talk_general: 'Talking (General Conversation)',
  talk_question: 'Talking (Asking A Question With One Hand)',
  talk_phone_female: 'Talking On Phone (Female Standing Talking On Phone)',
  talk_phone_male: 'Talking On A Cell Phone (Male Standing While Talking On A Cell Phone)',
  texting: 'Texting (Standing Texting On Phone)',
  praying_swaying: 'Praying (Standing Praying While Swaying)',
  praying_buckled: 'Praying (Buckled Stand And Praying)',
  terrified: 'Terrified (Being Terrified While Standing)',
  walk_male: 'Walking (Male Standard Walk)',
  walk_female: 'Female Walk (Female Normal Walk)',
  run_scared_lookback: 'Run Look Back (Running Looking Back)',
  run_fast: 'Fast Run (Running Fast)',
  run_medium: 'Medium Run (Medium Speed Running)',
  run_standard: 'Standard Run (Standard Running)',
  jogging: 'Jogging',
  cower_hiding: 'Hiding (Crouched Hiding To Ducking)',
  cower_ducking: 'Ducking (Ducking For Cover From Standing Idle)',
};
