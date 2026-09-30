// Mission 1, part 1: the calm shift. Pure data: steps, triggers and actions.
// Text lives in text.he.js (ids only here). Coordinates are Kotel plaza meters
// (see src/world/kotel/config.js: +X east toward the wall, +Z south).

const E = -Math.PI / 2; // facing east (toward the wall)
const S = Math.PI;

// Squad patrol legs. Teammates walk the same route with a small offset.
const SQUAD_START = { cmd: [-63.5, 1.2, 71.5, S], yonatan: [-61.4, 1.2, 70.4, S + 0.4], noam: [-65.6, 1.2, 70.2, S - 0.4] };
const TO_WALL = [[-62, 50], [-36, -12.8], [-10, -13]];
const TO_TERRACES = [[-36, -12.8], [-60, -10], [-90, -8]];
const offsetRoute = (route, dz) => route.map(([x, z], i) => [x - (i === route.length - 1 ? 1.5 : 1), z + dz]);

export const MISSION1 = {
  id: 'mission1-part1',

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
    tour: {
      guide: { kind: 'guide', id: 'guide', route: [[-48, -24], [-48, 16], [-72, 22], [-72, -24]], loop: true, speed: 0.9, pause: 7 },
      members: 8,
    },
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
        { type: 'populate', group: 'crossers' },
        { type: 'populate', group: 'tour' },
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
        { type: 'dialogue', lines: ['radio_1', 'radio_2', 'radio_3', 'radio_4', 'radio_5', 'radio_6', 'radio_7', 'radio_8'], interrupt: true },
        { type: 'npc', id: 'cmd', face: 'player' },
      ],
      until: { dialogueDone: true },
    },
    {
      id: 'part1_end',
      label: 'סוף חלק 1 (לפני הצפירות)',
      do: [
        { type: 'objective', text: null, target: null },
        { type: 'fade', to: 1, time: 1.2 },
        { type: 'endCard', card: 'part1End' },
      ],
      until: { timer: 1e9 },
    },
  ],
};

