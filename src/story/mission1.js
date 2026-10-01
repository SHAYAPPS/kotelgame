// Mission 1, the night of the final Selichot before Yom Kippur: the security checkpoint, a
// patrol among the crowd at the wall and the radio call (part 1), sirens, shelter and first
// contact (part 2), holding the plaza (part 3), the final push, counterattack and ending
// (part 4). Pure data: steps, triggers and actions. Wave contents, spawn timing and enemy
// tuning live in difficulty.js. Text lives in text.he.js (ids only here). Coordinates are
// Kotel plaza meters (see src/world/kotel/config.js: +X east toward the wall, +Z south).

import { DIFFICULTY } from './difficulty.js';
import { LANE } from './Checkpoint.js';

const E = -Math.PI / 2; // facing east (toward the wall)
const S = Math.PI;
const W = Math.PI / 2; // facing west (toward the plaza)
const N = 0;

const SQUAD = ['cmd', 'yonatan', 'noam'];


// Part 1. The player's post at the checkpoint (east lane), the squad gathering point in the
// middle of the plaza by the giant screen, and the patrol near the wall: about PATROL.time
// seconds from its start (talking to people on the way), its points in order.
const POST = LANE.post;
const POST_YAW = 2.2; // looking at the lane: the person, the table and its screen
const GATHER = [-47, 0, 8];
export const PATROL = { time: 180, points: [[-26, -12.8], [-6, -16], [-12, -27.5], [-21, 15.5]] };
const P = PATROL.points;

// The people screened at the checkpoint (story/Checkpoint.js), in order.
const SCREEN_PEOPLE = [
  {
    id: 'cp_haredi', kind: 'worshipper', bag: 'backpack', items: ['siddur', 'tallit', 'bottle'],
    lines: { arrive: ['cp_haredi_1'], letIn: ['cp_haredi_in'] },
    then: { to: [-24, -9], pray: true, face: E },
  },
  {
    id: 'cp_teen', kind: 'teen', bag: 'shoulder', items: ['phone', 'charger', 'snacks'], metal: 'keys',
    lines: { arrive: ['cp_teen_1'], wand: ['cp_teen_wand'], letIn: ['cp_teen_in'] },
    then: { to: [-48, 30], speed: 2.4 },
  },
  {
    id: 'cp_grandma', kind: 'grandma', sex: 'f', bag: 'big', items: ['pot', 'box', 'pitas', 'thermos', 'cake'], odd: true,
    lines: { arrive: ['cp_grandma_1'], open: ['cp_grandma_open', 'cp_grandma_me', 'cp_grandma_2'], unopened: ['cp_unopened'] },
    then: { to: [-29, 23.5], speed: 0.6, face: E },
  },
  {
    id: 'cp_tourist', kind: 'tourist', sex: 'm', bag: 'backpack', items: ['camera', 'bottle', 'map'], metal: 'buckle',
    lines: { arrive: ['cp_tourist_1', 'cp_tourist_me'], wand: ['cp_tourist_wand'], letIn: ['cp_tourist_in'] },
    then: { to: [-40, -4], face: E },
  },
  {
    id: 'cp_knife', kind: 'civilian', sex: 'm', bag: 'shoulder', items: ['wallet', 'knife', 'charger'], blade: true,
    lines: { arrive: ['cp_knife_1'], open: ['cp_knife_open'], confiscate: ['cp_knife_me', 'cp_knife_2'] },
    then: { to: [-44, 18] },
  },
  {
    id: 'cp_dad', kind: 'family', sex: 'm', bag: 'backpack', items: ['snacks', 'bottle', 'toy', 'wallet'], with: { id: 'cp_kid', kind: 'kid' },
    lines: { arrive: ['cp_family_1', { id: 'cp_family_kid', act: 'salute' }], letIn: ['cp_family_in'] },
    then: { to: [-52, 12] },
  },
];
// The evening's people (mission1 `groups`), placed at the start.
const POPULATE = ['worshippers', 'worshippers2', 'atWall', 'visitors', 'crossers', 'crossers2', 'chats', 'standers', 'tour', 'bystanders', 'families', 'elders', 'staff', 'specials'];
const SCREEN_LABELS = { cp_haredi: 'מתפלל עם סידור', cp_teen: 'נער ממהר', cp_grandma: 'סבתא עם תיק אוכל', cp_tourist: 'תייר', cp_knife: 'סכין בתיק', cp_dad: 'אבא וילד' };

// The covered prayer hall under Wilson's Arch (x -13..0, z -42..-29): a grid of spots, close
// together (a crowd sheltering).
const SHELTER_SPOTS = [];
for (let i = 0; i < 12; i++) for (let j = 0; j < 11; j++) SHELTER_SPOTS.push([-11.8 + j * 1.0, -40.8 + i * 1.0]);

// Where the first wave comes in: the southern entrance (behind the checkpoint) and the
// top of the western (Yehuda HaLevi) stairs.
const SOUTH_ENTRY = [-67.5, 1.2, 72];
const WEST_STAIRS = [-106, 3, 28];

// Part 3 positions. The line: the low stone wall (the prayer area's back fence, x = -30)
// between the plaza and the prayer area. The second position: near the wall, in front
// of the hall under Wilson's Arch where the civilians are.
const LINE1 = [-28.3, 0, -3.5];
const LINE2 = [-10, 0, -22];

// Part 4: counterattack objectives and the gathering at the wall.
const CHECKPOINT = [-67.5, 1.2, 76];
const STAIRS = [-118, 11.6, 28];
const WALL = [-3, 0, -8];
const EMERGE_SPOTS = [];
for (let i = 0; i < 12; i++) for (let j = 0; j < 7; j++) EMERGE_SPOTS.push([-12 + j * 1.4, -27 + i * 2.3]);

export const MISSION1 = {
  id: 'mission1',

  // Where people go when the sirens start: the hall under Wilson's Arch (spots), or out through
  // the nearest exit (the tunnels' entrance, the south gate, the stairs up to the Jewish Quarter).
  shelter: { spots: SHELTER_SPOTS, center: [-6, 0, -35], emerge: EMERGE_SPOTS, exits: [[-22.5, -28.6], [-67.5, 77.5], [-104, 28]] },

  // The Selichot crowd around the story's own people (story/crowd/): about two thousand
  // more, some there at 21:00, the rest arriving through the evening. Zones: rectangles
  // [x0, x1, z0, z1] filled `spacing` m apart (`share` of the spots taken), facing the wall or
  // the giant screens, what they do (acts) and who they are (wardrobe kinds); `entry`: where
  // walkers arriving in view come into the zone from, `from`: which entrance.
  crowd: {
    present: 0.45,
    fill: 660,
    seats: 0.6,
    mechitzaZ: 17,
    screens: [[-36, -21], [-36, 36]],
    entrances: { south: [-67.5, 66], west: [-101, 28], north: [-80, -42] },
    zones: [
      // The men's section: rows of worshipers (the first rows at the wall are the story's own),
      // an aisle kept clear down the middle (the patrol).
      { name: 'men', rect: [-29.2, -4.6, -28.5, 16.3], section: 'men', spacing: 1.15, share: 0.85, face: 'wall', from: 'north', entry: [[-31.5, -12.75]], acts: { pray: 0.72, stand: 0.2, talk: 0.08 }, kindsMen: { worshipper: 1 }, avoid: [[-17.4, -14.8, -28.5, 16.3]] },
      { name: 'women', rect: [-29.2, -4.6, 17.8, 28.5], section: 'women', spacing: 1.1, share: 0.85, face: 'wall', from: 'south', entry: [[-31.5, 23]], acts: { pray: 0.75, stand: 0.2, talk: 0.05 }, kindsWomen: { worshipperWoman: 1 } },
      // The plaza in front of the prayer area: facing the screens, waiting for the midnight service.
      {
        name: 'plaza',
        rect: [-54, -33.5, -42, 58],
        spacing: 1.5,
        share: 0.8,
        face: 'screens',
        from: 'south',
        entry: [[-45, 20]],
        acts: { stand: 0.45, pray: 0.35, talk: 0.2 },
        women: 0.45,
        kindsMen: { worshipper: 2, civilian: 1, tourist: 1 },
        kindsWomen: { worshipperWoman: 1, civilian: 1, tourist: 1 },
        avoid: [[-50.5, -39.5, 13, 27], [-46, -38, -2.5, 6.5], [-48.5, -31.5, -14.8, -10.7], [-48.5, -31.5, 20.4, 25.6]],
      },
      { name: 'terrace1', rect: [-77, -56.5, -42, 54], spacing: 2.0, share: 0.75, face: 'wall', from: 'west', entry: [[-66, 20]], acts: { stand: 0.55, talk: 0.3, pray: 0.15 }, women: 0.45, kindsMen: { worshipper: 1, civilian: 1, tourist: 1 }, kindsWomen: { worshipperWoman: 1, civilian: 1, tourist: 1 } },
      { name: 'terrace2', rect: [-100, -80, -42, 20], spacing: 2.6, share: 0.7, face: 'wall', from: 'west', entry: [[-90, 0]], acts: { stand: 0.6, talk: 0.4 }, women: 0.45, kindsMen: { civilian: 1, tourist: 1, worshipper: 1 }, kindsWomen: { civilian: 1, tourist: 1, worshipperWoman: 1 } },
    ],
    // When the sirens start: the hall under Wilson's Arch, the tunnels' entrance, the south
    // gate (through the checkpoint) and the stairs up to the Jewish Quarter.
    evacuation: [
      { name: 'out:arch', points: [[-6, -35], [-3, -38], [-10, -33]] },
      { name: 'out:tunnels', points: [[-22.5, -28.6]] },
      { name: 'out:south', points: [[-67.5, 76]] },
      { name: 'out:west', points: [[-103, 28]] },
    ],
  },

  // Start-screen chapter select (jump straight to a part while testing).
  chapters: [
    { label: 'חלק 1: הבידוק בכניסה', step: 'intro' },
    { label: 'חלק 1: הסיור ליד הכותל', step: 'patrol' },
    { label: 'חלק 1: הקריאה בקשר', step: 'radio_call' },
    { label: 'חלק 2: הצפירות', step: 'sirens' },
    { label: 'חלק 2: מגע ראשון', step: 'contact' },
    { label: 'חלק 3: הגנה על הרחבה', step: 'defense_orders' },
    { label: 'חלק 3: גל 1', step: 'wave1' },
    { label: 'חלק 3: גל 2', step: 'wave2' },
    { label: 'חלק 3: העמדה השנייה וגל 3', step: 'position2' },
    { label: 'חלק 4: המתקפה האחרונה', step: 'final_prep' },
    { label: 'חלק 4: מתקפת נגד', step: 'counterattack' },
    { label: 'חלק 4: המדרגות המערביות', step: 'checkpoint_taken' },
    { label: 'חלק 4: הסיום', step: 'reinforcements' },
  ],

  // The security checkpoint (task 1): who comes through, then who waits behind them (the
  // guard lets those in after the handover).
  screening: { people: SCREEN_PEOPLE, extras: ['worshipperWoman', 'civilian', 'worshipper', 'tourist'] },

  // Ambient population, placed by `populate` actions.
  groups: {
    // At the wall: a note into a crack, a hand on the stones and a kiss, walking away
    // backwards; photos.
    atWall: [
      { kind: 'worshipper', at: [-5.5, -14.5], yaw: E, behavior: 'notes' },
      { kind: 'worshipper', at: [-5.8, -10.2], yaw: E, behavior: 'kiss' },
      { kind: 'yeshiva', at: [-6.2, 7.6], yaw: E, behavior: 'notes' },
      { kind: 'elder', sex: 'm', at: [-6, -1.6], yaw: E, behavior: 'kiss' },
      { kind: 'worshipperWoman', at: [-5.6, 20.6], yaw: E, behavior: 'notes' },
      { kind: 'worshipperWoman', at: [-5.8, 26.2], yaw: E, behavior: 'kiss' },
      { kind: 'tourist', sex: 'm', at: [-8.5, -4.2], yaw: E, behavior: 'photo', prop: 'phone' },
    ],
    // Families in the plaza, children running around their parents.
    families: [
      { id: 'fam1_dad', kind: 'family', sex: 'm', at: [-41, -3.2], yaw: E },
      { id: 'fam1_mom', kind: 'family', sex: 'f', at: [-41.7, -2.2], yaw: E },
      { kind: 'kid', sex: 'm', at: [-40, -1.6], parent: 'fam1_dad', behavior: 'kidRun' },
      { kind: 'kid', sex: 'f', at: [-42.5, -3.6], parent: 'fam1_mom' },
      { id: 'fam2_dad', kind: 'family', sex: 'm', at: [-52, 26], yaw: E },
      { kind: 'kid', sex: 'm', at: [-51, 27], parent: 'fam2_dad', behavior: 'kidRun' },
      { id: 'fam3_mom', kind: 'family', sex: 'f', at: [-52, 36], yaw: E },
      { kind: 'kid', sex: 'f', at: [-51.4, 37], parent: 'fam3_mom', behavior: 'kidRun' },
    ],
    // The elderly, slow, with canes.
    elders: [
      { kind: 'elder', sex: 'm', at: [-36, 10], yaw: E, behavior: 'elder' },
      { kind: 'grandma', at: [-51, 44], yaw: E, behavior: 'elder' },
      { kind: 'elder', sex: 'f', at: [-60, -12], yaw: E },
    ],
    // Ushers with boxes of paper kippot at the entrances, Border Police, charity collectors.
    staff: [
      { kind: 'usher', at: [-32.6, -15.4], yaw: W, behavior: 'usher' },
      { kind: 'usher', at: [-60.8, 66.5], yaw: N, behavior: 'usher' },
      { kind: 'police', at: [-58.4, 61.5], yaw: N },
      { kind: 'police', at: [-33.2, -19], yaw: W },
      { kind: 'collector', at: [-45, -6], behavior: 'collector' },
      { kind: 'collector', at: [-50, 49], behavior: 'collector' },
    ],
    // The special people (people.js SPECIALS: a longer exchange) along the patrol.
    specials: [
      { id: 'sp_elder', kind: 'elder', sex: 'm', at: [-9, -19.2], yaw: E, special: 'blessing' },
      { id: 'sp_dad', kind: 'family', sex: 'm', at: [-31, -9.4], yaw: S },
      { id: 'sp_kid', kind: 'kid', sex: 'm', at: [-30.2, -8.6], parent: 'sp_dad', special: 'salute' },
      { id: 'sp_snack', kind: 'civilian', sex: 'm', at: [-15.8, -25.2], yaw: W, special: 'snack', prop: 'snack' },
      { id: 'sp_tourist', kind: 'tourist', sex: 'm', at: [-3.4, -13.4], yaw: E, special: 'notes' },
      { id: 'sp_photo', kind: 'secular', sex: 'f', at: [-34.5, 14], yaw: W, special: 'photo', prop: 'phone' },
    ],
    worshippers: [
      ...[-26, -23, -20, -17, -8.5, -6, -3, 0, 3, 6, 9, 12, 14.5].map((z, i) => ({ kind: 'worshipper', at: [-1.2 - (i % 3) * 0.5, 0, z], yaw: E, pray: true })),
      ...[-21, -2, 7].map((z) => ({ kind: 'worshipper', at: [-7, 0, z], yaw: E, pray: true })),
      ...[18.8, 21, 23.5, 26].map((z, i) => ({ kind: 'worshipperWoman', at: [-1.3 - (i % 2) * 0.5, 0, z], yaw: E, pray: true })),
    ],
    crossers: [
      { kind: 'civilian', route: [[-60, 50], [-36, 23]], loop: true, speed: 1.3 },
      { kind: 'civilian', route: [[-50, -35], [-75, 30]], loop: true, speed: 1.2 },
      { kind: 'worshipper', route: [[-36, -17], [-92, 10]], loop: true, speed: 1.4 },
      { kind: 'civilian', route: [[-100, -30], [-45, 2]], loop: true, speed: 1.1 },
      { kind: 'worshipperWoman', route: [[-66, 60], [-37, 27]], loop: true, speed: 1.2 },
      { kind: 'civilian', route: [[-44, -38], [-80, -20]], loop: true, speed: 1.3 },
    ],
    // Bystanders: stand around during the evening, freeze when the sirens start (near the
    // squad's gathering point in the middle of the plaza).
    bystanders: [
      { kind: 'tourist', at: [-43, 3.6], yaw: 2.4, freezes: true },
      { kind: 'civilian', at: [-50.5, 13.5], yaw: -1.2, freezes: true },
      { kind: 'worshipperWoman', at: [-52, 1.5], yaw: 0.6, freezes: true },
      { kind: 'family', sex: 'f', at: [-43.5, 15.5], yaw: -2.2, freezes: true },
    ],
    tour: {
      guide: { kind: 'guide', id: 'guide', route: [[-48, -24], [-48, 16], [-72, 22], [-72, -24]], loop: true, speed: 0.9, pause: 7 },
      members: 8,
      memberKind: 'secular', // a night Selichot tour
    },
    // A busier plaza: a second row of men at the wall and a few farther back, more women in
    // their section, visitors walking up to the wall and back.
    worshippers2: [
      ...[-24.5, -21.5, -18.5, -12, -4.5, 1.5, 4.5, 10.5].map((z, i) => ({ kind: 'worshipper', at: [-3.5 - (i % 2) * 0.6, 0, z], yaw: E, pray: true })),
      ...[-15, 3.5, 11.5].map((z, i) => ({ kind: 'worshipper', at: [-10 - (i % 2) * 1.5, 0, z], yaw: E + (i % 2 ? 0.25 : -0.2), pray: true })),
      ...[19.8, 22.2, 24.8, 27.4].map((z, i) => ({ kind: 'worshipperWoman', at: [-3.3 - (i % 2) * 0.5, 0, z], yaw: E, pray: true })),
      { kind: 'worshipperWoman', at: [-7, 0, 23], yaw: E, pray: true },
    ],
    visitors: [
      { kind: 'civilian', route: [[-24, -14.5], [-2.7, -14.5]], loop: true, speed: 1.1, pause: 22 },
      { kind: 'tourist', route: [[-27, 7.5], [-2.7, 7.5]], loop: true, speed: 1.0, pause: 18 },
      { kind: 'worshipper', route: [[-22, -28], [-2.7, -28]], loop: true, speed: 1.2, pause: 30 },
    ],
    // Small talk around the plaza (people facing each other, taking turns).
    chats: {
      chats: [
        { at: [-40, -8], kinds: ['civilian', 'civilian', 'tourist'] },
        { at: [-48, 31.5], kinds: ['worshipper', 'civilian'] },
        { at: [-64, 6], kinds: ['tourist', 'tourist', 'tourist', 'tourist'], radius: 1.0 },
        { at: [-90, -16], kinds: ['civilian', 'worshipperWoman'] },
        { at: [-58, 52], kinds: ['civilian', 'tourist', 'civilian'] },
        { at: [-17, -3], kinds: ['worshipper', 'worshipper'] },
        { at: [-15, 23.5], kinds: ['worshipperWoman', 'worshipperWoman'] },
        { at: [-34, 18], kinds: ['tourist', 'civilian'] },
        { at: [-38, -28], kinds: ['yeshiva', 'yeshiva', 'yeshiva'] },
        { at: [-50, -20], kinds: ['soldierVisitor', 'soldierVisitor', 'soldierVisitor'] },
      ],
    },
    // More people crossing: over both terraces' steps, along the plaza, up and down the
    // western (Yehuda HaLevi) stairs.
    crossers2: [
      { kind: 'civilian', route: [[-49, 44], [-96, 38]], loop: true, speed: 1.3 },
      { kind: 'tourist', route: [[-92, -34], [-40, -30]], loop: true, speed: 1.1 },
      { kind: 'worshipper', route: [[-50, 58], [-50, -36]], loop: true, speed: 1.4 },
      { kind: 'civilian', route: [[-48, -4], [-92, -2]], loop: true, speed: 1.25 },
      { kind: 'worshipperWoman', route: [[-46, 14], [-90, 18]], loop: true, speed: 1.1 },
      { kind: 'tourist', route: [[-100, 28], [-127.5, 28]], loop: true, speed: 1.1, pause: 6 },
      { kind: 'civilian', route: [[-127.5, 31], [-100, 31]], loop: true, speed: 1.2, pause: 4 },
      { kind: 'civilian', route: [[-36, -22], [-36, 30]], loop: true, speed: 1.3 },
    ],
    // Standing around: looking at the wall, taking pictures, waiting at the entrance.
    standers: [
      { kind: 'tourist', at: [-37, -2], yaw: E, behavior: 'photo', prop: 'phone' },
      { kind: 'tourist', at: [-39, 12], yaw: E + 0.3, behavior: 'photo', prop: 'phone' },
      { kind: 'tourist', at: [-59, -20], yaw: E - 0.2 },
      { kind: 'civilian', at: [-62.5, 60], yaw: -0.4 },
    ],
  },

  steps: [
    // ---- Part 1: 21:00, the night of the final Selichot ----
    {
      id: 'intro',
      label: 'פתיחה: כרטיס כותרת, הבידוק בכניסה',
      do: [
        { type: 'music', state: 'calm' },
        { type: 'fade', to: 0, time: 2.5 },
        { type: 'title', card: 'intro' },
        { type: 'weapon', mode: 'slung' }, // hands free for the checkpoint
        { type: 'ambience', crowd: 0.5, birds: 0, city: 0.8 },
        { type: 'crowd', time: 0 },
        ...POPULATE.map((group) => ({ type: 'populate', group })),
        { type: 'npc', id: 'cmd', spawn: { kind: 'commander', speaker: 'cmd', at: [GATHER[0] + 1, GATHER[1], GATHER[2] - 1, E] } },
        { type: 'npc', id: 'yonatan', spawn: { kind: 'soldier', speaker: 'yonatan', at: [-62.5, 1.2, 88.3, W] } },
        { type: 'npc', id: 'noam', spawn: { kind: 'soldier', speaker: 'noam', at: [-56, 1.2, 57, E] } },
        { type: 'screening', begin: true },
        { type: 'checkpoint', at: POST, yaw: POST_YAW },
      ],
      until: { timer: 5 },
    },
    {
      id: 'checkpoint_brief',
      label: 'משימה 1: תדריך בבידוק',
      do: [
        { type: 'objective', text: 'screening', target: null, counter: 'screened' },
        { type: 'npc', id: 'yonatan', face: 'player' },
        { type: 'dialogue', lines: ['cp_brief_1', 'cp_brief_2', 'cp_brief_3'] },
      ],
      until: { dialogueDone: true },
    },
    // One step per person at the checkpoint (each a jump target in the F2 menu).
    ...SCREEN_PEOPLE.map((p, i) => ({
      id: `screen_${p.id.slice(3)}`,
      label: `בידוק ${i + 1}: ${SCREEN_LABELS[p.id]}`,
      do: [
        ...(i === 0 ? [{ type: 'hint', hint: 'screen' }] : [{ type: 'dialogue', lines: ['cp_next'] }]),
        { type: 'screening', person: p.id },
      ],
      until: { action: 'screened' },
    })),
    {
      id: 'guard_arrives',
      label: 'שמעון המאבטח מגיע להחליף (נקודת שמירה)',
      do: [
        { type: 'hint', hint: null },
        { type: 'checkpoint', at: POST, yaw: POST_YAW },
        { type: 'objective', text: 'screen_wait', target: null },
        { type: 'npc', id: 'guard', spawn: { kind: 'guard', speaker: 'guard', at: [-63.2, 1.2, 73, S] } },
        { type: 'npc', id: 'guard', route: { points: [[-63, 81.6]], speed: 1.35, face: S } },
      ],
      until: { any: [{ arrived: 'guard' }, { timer: 14 }] },
    },
    {
      id: 'guard_banter',
      label: 'החלפה: שמעון לוקח את העמדה',
      do: [
        { type: 'screening', handover: true },
        { type: 'npc', id: 'guard', face: 'player' },
        { type: 'npc', id: 'yonatan', face: 'player' },
        { type: 'dialogue', lines: ['cp_guard_1', 'cp_guard_2', 'cp_guard_3', 'cp_guard_4', 'cp_guard_5', 'cp_guard_6'] },
      ],
      until: { dialogueDone: true },
    },
    {
      id: 'patrol',
      label: 'משימה 2: סיור ליד הכותל (נקודת שמירה)',
      do: [
        { type: 'crowd', time: 240 }, // (fast-forwarded here: the plaza filling up)
        { type: 'weapon', mode: 'lowered' }, // the rifle back in front, safe carry
        { type: 'checkpoint', at: [-63.5, 1.2, 79], yaw: N },
        { type: 'npc', id: 'guard', route: { points: [[POST[0], POST[2]]], speed: 1.1, face: POST_YAW } },
        { type: 'npc', id: 'yonatan', route: { points: [[-63.5, 76], [-66, 34], [-68, 14]], speed: 1.4, face: E } },
        { type: 'dialogue', lines: ['cp_guard_7', 'patrol_1'] },
        { type: 'objective', text: 'patrol', target: [P[0][0], 0, P[0][1]] },
        { type: 'hint', hint: 'people' },
      ],
      until: { reach: P[0], radius: 4 },
    },
    {
      id: 'patrol_2',
      label: 'סיור: אל הכותל',
      do: [
        { type: 'hint', hint: null },
        { type: 'objective', text: 'patrol', target: [P[1][0], 0, P[1][1]] },
        { type: 'dialogue', lines: ['patrol_2a', 'patrol_2b', 'patrol_2c'] },
      ],
      until: { reach: P[1], radius: 4 },
    },
    {
      id: 'patrol_3',
      label: 'סיור: אל קשת וילסון',
      do: [
        { type: 'objective', text: 'patrol', target: [P[2][0], 0, P[2][1]] },
        { type: 'dialogue', lines: ['patrol_3a'] },
      ],
      until: { reach: P[2], radius: 4 },
    },
    {
      id: 'patrol_4',
      label: 'סיור: לאורך המחיצה',
      do: [
        { type: 'objective', text: 'patrol', target: [P[3][0], 0, P[3][1]] },
        { type: 'dialogue', lines: ['patrol_4a', 'patrol_4b', 'patrol_4c'] },
      ],
      until: { reach: P[3], radius: 4 },
    },
    {
      id: 'patrol_more',
      label: 'סיור: עוד קצת בין האנשים',
      do: [{ type: 'objective', text: 'patrol_more', target: null }],
      until: { since: ['patrol', PATROL.time] },
    },
    {
      id: 'radio_call',
      label: 'משימה 3: קריאה בקשר, מתכנסים במרכז הרחבה',
      do: [
        { type: 'crowd', time: 480 },
        { type: 'checkpoint', at: [P[3][0] - 3, 0, P[3][1]], yaw: W },
        { type: 'ambience', crowd: 0.65 },
        { type: 'music', state: 'tense' },
        { type: 'dialogue', lines: ['radio_1', 'radio_2', 'radio_3'], interrupt: true },
        { type: 'objective', text: 'gather', target: GATHER },
        { type: 'npc', id: 'cmd', face: 'player' },
        { type: 'npc', id: 'yonatan', route: { points: [[GATHER[0] - 1.5, GATHER[2] + 2.2]], speed: 2.4, face: E } },
        { type: 'npc', id: 'noam', route: { points: [[GATHER[0] - 1.8, GATHER[2] - 1.6]], speed: 2.4, face: E } },
      ],
      until: { all: [{ reach: [GATHER[0], GATHER[2]], radius: 6 }, { dialogueDone: true }] },
    },
    {
      id: 'gather',
      label: 'הכיתה מתכנסת (נקודת שמירה)',
      do: [
        { type: 'checkpoint', at: [GATHER[0] - 3, GATHER[1], GATHER[2]], yaw: E },
        { type: 'objective', text: 'follow_cmd', target: null },
        ...SQUAD.map((id) => ({ type: 'npc', id, face: 'player' })),
        { type: 'dialogue', lines: ['gather_1', 'gather_2', 'gather_3', 'gather_4', 'radio_5', 'radio_6'], interrupt: true },
      ],
      until: { dialogueDone: true },
    },

    // ---- Part 2: sirens, shelter, first contact ----
    {
      id: 'sirens',
      label: 'צפירות: אזעקה ברחבה',
      do: [
        { type: 'crowd', evacuate: true }, // everyone runs for the shelters and the exits
        { type: 'music', state: 'tense' },
        { type: 'dialogue', lines: ['radio_7', 'siren_1', 'siren_2', 'siren_3', 'radio_8'], interrupt: true },
        { type: 'sound', id: 'radioCut' },
        { type: 'ambience', crowd: 1, birds: 0, siren: 1, panic: true },
        { type: 'sky', barrage: 1 },
        { type: 'civilians', do: 'panic' },
        { type: 'objective', text: 'take_cover', target: { npc: 'cmd' } },
        ...SQUAD.map((id) => ({ type: 'npc', id, face: 'player' })),
      ],
      until: { dialogueDone: true },
    },
    {
      id: 'weapons_ready',
      label: 'נשק דרוך (נקודת שמירה)',
      do: [
        { type: 'checkpoint', at: [GATHER[0] - 3, GATHER[1], GATHER[2]], yaw: E },
        { type: 'weapon', mode: 'ready' },
        { type: 'hint', hint: 'fire' },
        { type: 'dialogue', lines: ['ready_1', 'ready_2', 'ready_3'], interrupt: true },
      ],
      until: { dialogueDone: true },
    },
    {
      id: 'shelter',
      label: 'מחסה: פינוי אזרחים לקשת וילסון',
      do: [
        { type: 'hint', hint: 'shelter' },
        { type: 'objective', text: 'shelter', target: { frozen: true, fallback: [-6, 0, -35] }, counter: 'civilians' },
        { type: 'dialogue', lines: ['shelter_1', 'shelter_2', 'shelter_3', 'shelter_4', 'shelter_5'], interrupt: true },
        // The squad sticks with the player (and is at hand when the shooting starts).
        { type: 'npc', id: 'cmd', escort: 6 },
        { type: 'npc', id: 'yonatan', escort: 7.5 },
        { type: 'npc', id: 'noam', escort: 9 },
      ],
      until: { any: [{ civiliansSheltered: true }, { timer: 90 }] },
    },
    {
      id: 'contact',
      label: 'מגע ראשון: גל מחבלים',
      do: [
        { type: 'music', state: 'combat' },
        { type: 'hint', hint: null },
        { type: 'civilians', do: 'runAll' },
        { type: 'ambience', siren: 0.45, crowd: 0.6, panic: true },
        { type: 'sound', id: 'gunfire', at: [-66, 2, 96] },
        { type: 'dialogue', lines: ['contact_1', 'contact_2'], interrupt: true },
        { type: 'combat', squad: SQUAD, on: true, threat: SOUTH_ENTRY },
        {
          type: 'wave',
          wave: 'contact',
          callouts: {
            south: { lines: ['contact_south'], delay: 3 },
            stairs: { lines: ['contact_west', 'contact_watch'], delay: 2.5 },
          },
        },
        { type: 'objective', text: 'eliminate', target: null, counter: 'enemies' },
      ],
      until: { enemiesDead: true },
    },
    {
      id: 'after_wave',
      label: 'אחרי הגל: התארגנות',
      do: [
        { type: 'music', state: 'tense' },
        { type: 'combat', squad: SQUAD, on: false },
        { type: 'ambience', siren: 0, crowd: 0.25, panic: false },
        { type: 'sky', barrage: 0.25 },
        { type: 'objective', text: 'regroup', target: { npc: 'cmd' } },
        { type: 'npc', id: 'cmd', route: { points: [[-47, 5]], speed: 2.5, face: E } },
        { type: 'npc', id: 'yonatan', route: { points: [[-48, 7.5]], speed: 2.5, face: E - 0.6 } },
        { type: 'npc', id: 'noam', route: { points: [[-48, 2.5]], speed: 2.5, face: E + 0.6 } },
      ],
      until: { all: [{ arrived: 'cmd' }, { reach: [-47, 5], radius: 7 }] },
    },
    {
      id: 'after_talk',
      label: 'תדריך: להחזיק את הרחבה (נקודת שמירה)',
      do: [
        { type: 'checkpoint', at: [-51, 0, 5], yaw: E },
        { type: 'objective', text: 'follow_cmd', target: null },
        ...SQUAD.map((id) => ({ type: 'npc', id, face: 'player' })),
        { type: 'dialogue', lines: ['after_1', 'after_2', 'after_3', 'after_4', 'after_5', 'after_6'], interrupt: true },
      ],
      until: { dialogueDone: true },
    },

    // ---- Part 3: holding the plaza ----
    {
      id: 'defense_orders',
      label: 'הגנה: תופסים את הקו בחומה הנמוכה',
      do: [
        { type: 'objective', text: 'take_position', target: LINE1 },
        { type: 'crate', id: 'crate1', at: [-26.8, -0.6], yaw: W },
        { type: 'dialogue', lines: ['def_1', 'def_2', 'def_3', 'def_4'], interrupt: true },
        { type: 'npc', id: 'cmd', route: { points: [[-40, 0], [-28.5, 1.8]], speed: 2.6, face: W } },
        { type: 'npc', id: 'yonatan', route: { points: [[-40, -4], [-28.5, -9.2]], speed: 2.6, face: W } },
        { type: 'npc', id: 'noam', route: { points: [[-40, 6], [-28.5, 5.6]], speed: 2.6, face: W } },
      ],
      until: { all: [{ reach: [LINE1[0], LINE1[2]], radius: 4 }, { dialogueDone: true }] },
    },
    {
      id: 'defense_prep',
      label: 'הכנה לגל הראשון',
      do: [
        { type: 'hint', hint: 'grenade' },
        { type: 'dialogue', lines: ['prep_1', 'prep_2', 'prep_3'], interrupt: true },
      ],
      until: { timer: DIFFICULTY.prep.beforeWave1 },
    },
    {
      id: 'wave1',
      label: 'גל 1: רובאים מהמדרגות המערביות (נקודת שמירה)',
      do: [
        { type: 'music', state: 'combat' },
        { type: 'checkpoint', at: LINE1, yaw: W },
        { type: 'hint', hint: null },
        { type: 'objective', text: 'hold_line', target: null },
        { type: 'combat', squad: SQUAD, on: true, threat: WEST_STAIRS },
        { type: 'dialogue', lines: ['wave1_a', 'wave1_b'], interrupt: true },
        { type: 'wave', wave: 'wave1', callouts: { stairs: { lines: ['w1_contact'], delay: 4 } } },
      ],
      until: { enemiesDead: true },
    },
    {
      id: 'between1',
      label: 'הפוגה לפני גל 2 (נקודת שמירה)',
      do: [
        { type: 'checkpoint', at: LINE1, yaw: W },
        { type: 'dialogue', lines: ['b1_1', 'b1_2', 'b1_3'], interrupt: true },
      ],
      until: { timer: DIFFICULTY.prep.beforeWave2 },
    },
    {
      id: 'wave2',
      label: 'גל 2: מדרגות ודרום יחד, אש חיפוי ואיגוף',
      do: [
        { type: 'dialogue', lines: ['wave2_a', 'wave2_b'], interrupt: true },
        {
          type: 'wave',
          wave: 'wave2',
          callouts: {
            stairs: { lines: ['w2_stairs', 'w2_flank'], delay: 3 },
            south: { lines: ['w2_south'], delay: 5 },
          },
        },
      ],
      until: { enemiesDead: true },
    },
    {
      id: 'overrun',
      label: 'הקו נפרץ: נסיגה לעמדה השנייה',
      do: [
        { type: 'dialogue', lines: ['over_1', 'over_2'], interrupt: true },
        { type: 'wave', wave: 'breach' },
        { type: 'crate', id: 'crate2', at: [-7.5, -25.5], yaw: 0 },
        { type: 'objective', text: 'fall_back', target: LINE2 },
      ],
      until: { all: [{ reach: [LINE2[0], LINE2[2]], radius: 4 }, { enemiesDead: true }] },
    },
    {
      id: 'position2',
      label: 'עמדה שנייה ליד הכותל (נקודת שמירה)',
      do: [
        { type: 'checkpoint', at: LINE2, yaw: W },
        { type: 'objective', text: 'hold_line2', target: null },
        { type: 'dialogue', lines: ['p2_1', 'p2_2', 'p2_3'], interrupt: true },
      ],
      until: { timer: DIFFICULTY.prep.beforeWave3 },
    },
    {
      id: 'wave3',
      label: 'גל 3: המתקפה הגדולה, מסתערים וצלף',
      do: [
        { type: 'dialogue', lines: ['wave3_a', 'wave3_b'], interrupt: true },
        {
          type: 'wave',
          wave: 'wave3',
          callouts: {
            terrace: { lines: ['w3_sniper'], delay: 4 },
            stairs: { lines: ['w3_stairs'], delay: 3 },
            south: { lines: ['w3_rush'], delay: 6 },
          },
        },
      ],
      until: { enemiesDead: true },
    },
    {
      id: 'lull',
      label: 'הפוגה: הם מתארגנים למתקפה גדולה',
      do: [
        { type: 'music', state: 'tense' },
        { type: 'ambience', siren: 0, crowd: 0.2, panic: false },
        { type: 'dialogue', lines: ['lull_1', 'lull_2', 'lull_3', 'lull_4', 'lull_5', 'lull_6'], interrupt: true },
      ],
      until: { dialogueDone: true },
    },

    // ---- Part 4: the final push, the counterattack, the ending ----
    {
      id: 'final_prep',
      label: 'חלק 4: לפני המתקפה האחרונה (נקודת שמירה)',
      do: [
        { type: 'checkpoint', at: LINE2, yaw: W },
        { type: 'objective', text: 'hold_line2', target: null },
      ],
      until: { timer: DIFFICULTY.prep.beforeFinal },
    },
    {
      id: 'final_push',
      label: 'המתקפה האחרונה: מכל הכיוונים',
      do: [
        { type: 'music', state: 'push' },
        { type: 'ambience', siren: 0.5, crowd: 0.3, panic: true },
        { type: 'sky', barrage: 0.6 },
        { type: 'objective', text: 'final_hold', target: null },
        { type: 'dialogue', lines: ['final_1', 'final_2'], interrupt: true },
        {
          type: 'wave',
          wave: 'finalPush',
          callouts: {
            terrace: { lines: ['w3_sniper'], delay: 5 },
            north: { lines: ['over_1'], delay: 2 },
          },
        },
        { type: 'truck', delay: DIFFICULTY.truck.delay },
      ],
      until: { any: [{ timer: DIFFICULTY.truck.delay + 3 }, { truckDestroyed: true }] },
    },
    {
      id: 'launcher_order',
      label: 'טנדר עם מקלע: לקחת את המטול',
      do: [
        { type: 'truck', ensure: true }, // (already there, unless you jumped here)
        { type: 'crate', id: 'crate2', at: [-7.5, -25.5], yaw: 0, launcher: true },
        { type: 'objective', text: 'get_launcher', target: [-7.5, 0, -25.5] },
        { type: 'dialogue', lines: ['truck_1', 'truck_2', 'truck_3'], interrupt: true },
      ],
      until: { any: [{ hasLauncher: true }, { truckDestroyed: true }] },
    },
    {
      id: 'destroy_truck',
      label: 'להשמיד את הטנדר',
      do: [
        { type: 'truck', ensure: true },
        { type: 'arm', launcher: true },
        { type: 'hint', hint: 'switch' },
        { type: 'objective', text: 'destroy_truck', target: { truck: true } },
        { type: 'dialogue', lines: ['truck_4'], interrupt: true },
      ],
      until: { truckDestroyed: true },
    },
    {
      id: 'truck_down',
      label: 'הטנדר מושמד (נקודת שמירה)',
      do: [
        { type: 'slowmo', scale: 0.25, time: 1.8 },
        { type: 'hint', hint: null },
        { type: 'checkpoint', at: LINE2, yaw: W },
        { type: 'ambience', siren: 0.25, panic: false },
        { type: 'sky', barrage: 0.2 },
        { type: 'retreat', to: ['checkpointPosts', 'stairsPosts'] },
        { type: 'objective', text: null, target: null },
        { type: 'dialogue', lines: ['truck_down_1', 'truck_down_2'], interrupt: true },
      ],
      until: { dialogueDone: true },
    },
    {
      id: 'counterattack',
      label: 'מתקפת נגד: אל הבידוק הדרומי',
      do: [
        { type: 'objective', text: 'secure_checkpoint', target: CHECKPOINT },
        { type: 'dialogue', lines: ['counter_1', 'counter_2'], interrupt: true },
        { type: 'wave', wave: 'plazaHoldouts' },
        { type: 'wave', wave: 'checkpointDefense' },
        { type: 'bounding', squad: SQUAD, to: CHECKPOINT },
      ],
      until: { all: [{ reach: [CHECKPOINT[0], CHECKPOINT[2]], radius: 7 }, { clear: [CHECKPOINT[0], CHECKPOINT[2]], radius: 24 }] },
    },
    {
      id: 'checkpoint_taken',
      label: 'הבידוק בידינו (נקודת שמירה)',
      do: [
        { type: 'checkpoint', at: [-67.5, 1.2, 74], yaw: 0 },
        { type: 'bounding', squad: SQUAD, off: true },
        { type: 'objective', text: 'secure_stairs', target: STAIRS },
        { type: 'dialogue', lines: ['cp_1', 'cp_2', 'cp_3'], interrupt: true },
      ],
      until: { dialogueDone: true },
    },
    {
      id: 'secure_stairs',
      label: 'מתקפת נגד: אל המדרגות המערביות',
      do: [
        { type: 'wave', wave: 'stairsDefense' },
        { type: 'bounding', squad: SQUAD, to: STAIRS },
      ],
      until: { all: [{ reach: [STAIRS[0], STAIRS[2]], radius: 7 }, { clear: [STAIRS[0], STAIRS[2]], radius: 26 }] },
    },
    {
      id: 'reinforcements',
      label: 'סיום: התגבורת מגיעה',
      do: [
        { type: 'music', state: 'end' },
        { type: 'bounding', squad: SQUAD, off: true },
        { type: 'combat', squad: SQUAD, on: false },
        { type: 'ambience', siren: 0, crowd: 0, birds: 0.15, panic: false },
        { type: 'sky', barrage: 0 },
        { type: 'dialogue', lines: ['stairs_done', 'end_1', 'end_2', 'end_3'], interrupt: true },
        { type: 'objective', text: 'regroup_wall', target: WALL },
        { type: 'npc', id: 'cmd', route: { points: [[-2.5, -8]], speed: 2.2, face: W } },
        { type: 'npc', id: 'yonatan', route: { points: [[-2.5, -5.5]], speed: 2.2, face: W } },
        { type: 'npc', id: 'noam', route: { points: [[-2.5, -10.5]], speed: 2.2, face: W } },
      ],
      until: { all: [{ reach: [WALL[0], WALL[2]], radius: 6 }, { dialogueDone: true }] },
    },
    {
      id: 'civilians_emerge',
      label: 'האזרחים יוצאים מהקשת',
      do: [
        { type: 'civilians', do: 'emerge' },
        { type: 'ambience', crowd: 0.3, birds: 0.35 },
        { type: 'objective', text: null, target: null },
        ...SQUAD.map((id) => ({ type: 'npc', id, face: 'player' })),
        { type: 'dialogue', lines: ['end_4', 'end_5', 'end_6'], interrupt: true },
      ],
      until: { dialogueDone: true },
    },
    {
      id: 'final_words',
      label: 'המילים האחרונות של המפקד',
      do: [{ type: 'dialogue', lines: ['end_7'], interrupt: true }],
      until: { dialogueDone: true },
    },
    {
      id: 'mission_complete',
      label: 'המשימה הושלמה: סטטיסטיקה',
      do: [
        { type: 'fade', to: 1, time: 2 },
        { type: 'stats' },
      ],
      until: { timer: 10 },
    },
    {
      id: 'mission2_soon',
      label: 'משימה 2 בקרוב',
      do: [
        { type: 'fade', to: 1, time: 0.3 }, // (already black, unless you jumped here)
        { type: 'stats', hide: true },
        { type: 'endCard', card: 'mission2Soon' },
      ],
      until: { timer: 1e9 },
    },
  ],
};
