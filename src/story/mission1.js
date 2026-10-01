// Mission 1: the calm shift (part 1), sirens, shelter and first contact (part 2),
// holding the plaza (part 3), the final push, counterattack and ending (part 4). Pure data: steps, triggers and actions. Wave contents,
// spawn timing and enemy tuning live in difficulty.js.
// Text lives in text.he.js (ids only here). Coordinates are Kotel plaza meters
// (see src/world/kotel/config.js: +X east toward the wall, +Z south).

import { DIFFICULTY } from './difficulty.js';

const E = -Math.PI / 2; // facing east (toward the wall)
const S = Math.PI;
const W = Math.PI / 2; // facing west (toward the plaza)

// Squad patrol legs. Teammates walk the same route with a small offset.
const SQUAD_START = { cmd: [-63.5, 1.2, 71.5, S], yonatan: [-61.4, 1.2, 70.4, S + 0.4], noam: [-65.6, 1.2, 70.2, S - 0.4] };
const TO_WALL = [[-62, 50], [-36, -12.8], [-10, -13]];
const TO_TERRACES = [[-36, -12.8], [-60, -10], [-90, -8]];
const offsetRoute = (route, dz) => route.map(([x, z], i) => [x - (i === route.length - 1 ? 1.5 : 1), z + dz]);
const SQUAD = ['cmd', 'yonatan', 'noam'];

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

  shelter: { spots: SHELTER_SPOTS, center: [-6, 0, -35], emerge: EMERGE_SPOTS },

  // Start-screen chapter select (jump straight to a part while testing).
  chapters: [
    { label: 'חלק 1: המשמרת השקטה', step: 'intro' },
    { label: 'חלק 1: הסיור בכותל', step: 'patrol_wall' },
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

  // Ambient population, placed by `populate` actions.
  groups: {
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
    // Bystanders: stand around during the shift, freeze when the sirens start.
    bystanders: [
      { kind: 'tourist', at: [-44, 5], yaw: 2.4, freezes: true },
      { kind: 'civilian', at: [-33, 27], yaw: -1.2, freezes: true },
      { kind: 'worshipperWoman', at: [-68, -22], yaw: 0.6, freezes: true },
      { kind: 'tourist', at: [-95, 17], yaw: -2.2, freezes: true },
    ],
    tour: {
      guide: { kind: 'guide', id: 'guide', route: [[-48, -24], [-48, 16], [-72, 22], [-72, -24]], loop: true, speed: 0.9, pause: 7 },
      members: 8,
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
      { kind: 'tourist', at: [-37, -2], yaw: E },
      { kind: 'tourist', at: [-39, 12], yaw: E + 0.3 },
      { kind: 'tourist', at: [-59, -20], yaw: E - 0.2 },
      { kind: 'civilian', at: [-62.5, 60], yaw: -0.4 },
    ],
  },

  steps: [
    {
      id: 'intro',
      label: 'פתיחה: כרטיס כותרת',
      do: [
        { type: 'fade', to: 0, time: 2.5 },
        { type: 'title', card: 'intro' },
        { type: 'weapon', mode: 'lowered' },
        { type: 'ambience', crowd: 0.55, birds: 0.5 },
        { type: 'populate', group: 'worshippers' },
        { type: 'populate', group: 'worshippers2' },
        { type: 'populate', group: 'visitors' },
        { type: 'populate', group: 'crossers' },
        { type: 'populate', group: 'crossers2' },
        { type: 'populate', group: 'chats' },
        { type: 'populate', group: 'standers' },
        { type: 'populate', group: 'tour' },
        { type: 'populate', group: 'bystanders' },
        { type: 'npc', id: 'cmd', spawn: { kind: 'commander', speaker: 'cmd', at: SQUAD_START.cmd } },
        { type: 'npc', id: 'yonatan', spawn: { kind: 'soldier', speaker: 'yonatan', at: SQUAD_START.yonatan } },
        { type: 'npc', id: 'noam', spawn: { kind: 'soldier', speaker: 'noam', at: SQUAD_START.noam } },
        { type: 'checkpoint', at: [-67.5, 1.2, 78], yaw: -0.71 },
      ],
      until: { timer: 4.5 },
    },
    {
      id: 'report',
      label: 'דיווח למפקד',
      do: [
        { type: 'objective', text: 'report', target: { npc: 'cmd' } },
        { type: 'hint', hint: 'move' },
        { type: 'npc', id: 'cmd', talkable: true },
        { type: 'dialogue', lines: ['cmd_call'] },
      ],
      until: { talk: 'cmd' },
    },
    {
      id: 'briefing',
      label: 'תדריך',
      do: [
        { type: 'hint', hint: null },
        { type: 'npc', id: 'cmd', talkable: false },
        { type: 'npc', id: 'cmd', face: 'player' },
        { type: 'npc', id: 'yonatan', face: 'player' },
        { type: 'npc', id: 'noam', face: 'player' },
        { type: 'objective', text: 'follow_cmd', target: null },
        { type: 'dialogue', lines: ['brief_1', 'brief_2', 'brief_3', 'brief_4', 'brief_5'], interrupt: true },
      ],
      until: { dialogueDone: true },
    },
    {
      id: 'tut_sprint',
      label: 'הדרכה: ריצה',
      do: [
        { type: 'dialogue', lines: ['hint_sprint_line'] },
        { type: 'hint', hint: 'sprint' },
      ],
      until: { action: 'sprint' },
    },
    {
      id: 'tut_crouch',
      label: 'הדרכה: התכופפות',
      do: [
        { type: 'dialogue', lines: ['hint_crouch_line'], interrupt: true },
        { type: 'hint', hint: 'crouch' },
      ],
      until: { action: 'crouch' },
    },
    {
      id: 'tut_mag',
      label: 'הדרכה: בדיקת מחסנית',
      do: [
        { type: 'dialogue', lines: ['hint_mag_line'], interrupt: true },
        { type: 'hint', hint: 'mag' },
      ],
      until: { action: 'magCheck' },
    },
    {
      id: 'patrol_wall',
      label: 'סיור: אל הכותל',
      do: [
        { type: 'hint', hint: null },
        { type: 'checkpoint', at: [-65, 1.2, 68], yaw: S },
        { type: 'dialogue', lines: ['mag_done'], interrupt: true },
        { type: 'objective', text: 'patrol_wall', target: [-10, 0, -13] },
        { type: 'npc', id: 'cmd', route: { points: TO_WALL, speed: 1.5, leash: 10, face: E } },
        { type: 'npc', id: 'yonatan', route: { points: offsetRoute(TO_WALL, 1.6), speed: 1.5, leash: 11, face: E } },
        { type: 'npc', id: 'noam', route: { points: offsetRoute(TO_WALL, -1.6), speed: 1.5, leash: 11, face: E } },
      ],
      until: { timer: 9 },
    },
    {
      id: 'patrol_wall_chat',
      label: 'סיור: שיחה בדרך לכותל',
      do: [{ type: 'dialogue', lines: ['patrol1_a', 'patrol1_b', 'patrol1_c'] }],
      until: { all: [{ arrived: 'cmd' }, { reach: [-10, -13], radius: 8 }] },
    },
    {
      id: 'at_wall',
      label: 'בכותל',
      do: [
        { type: 'checkpoint', at: [-14, 0, -12.8], yaw: E },
        { type: 'objective', text: 'follow_cmd', target: null },
        { type: 'npc', id: 'cmd', face: 'player' },
        { type: 'dialogue', lines: ['wall_1', 'wall_2', 'wall_3'], interrupt: true },
      ],
      until: { dialogueDone: true },
    },
    {
      id: 'patrol_terraces',
      label: 'סיור: אל הטרסות העליונות',
      do: [
        { type: 'objective', text: 'patrol_terraces', target: [-90, 3, -8] },
        { type: 'npc', id: 'cmd', route: { points: TO_TERRACES, speed: 1.5, leash: 10, face: E } },
        { type: 'npc', id: 'yonatan', route: { points: offsetRoute(TO_TERRACES, 1.6), speed: 1.5, leash: 11, face: E } },
        { type: 'npc', id: 'noam', route: { points: offsetRoute(TO_TERRACES, -1.6), speed: 1.5, leash: 11, face: E } },
        { type: 'dialogue', lines: ['patrol2_a', 'patrol2_b'] },
      ],
      until: { timer: 14 },
    },
    {
      id: 'patrol_terraces_guide',
      label: 'סיור: קבוצת התיירים',
      do: [{ type: 'dialogue', lines: ['guide_1'] }],
      until: { all: [{ arrived: 'cmd' }, { reach: [-90, -8], radius: 9 }] },
    },
    {
      id: 'radio',
      label: 'קשר: דיווחים חריגים',
      do: [
        { type: 'checkpoint', at: [-88, 3, -8], yaw: E },
        { type: 'objective', text: 'wait_orders', target: null },
        { type: 'ambience', crowd: 0.35, birds: 0.2 },
        { type: 'dialogue', lines: ['radio_1', 'radio_2', 'radio_3', 'radio_4', 'radio_5', 'radio_6'], interrupt: true },
        { type: 'npc', id: 'cmd', face: 'player' },
      ],
      until: { dialogueDone: true },
    },

    // ---- Part 2: sirens, shelter, first contact ----
    {
      id: 'sirens',
      label: 'צפירות: אזעקה ברחבה',
      do: [
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
        { type: 'checkpoint', at: [-88, 3, -8], yaw: E },
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
