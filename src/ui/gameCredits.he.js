// The game's own credits: the top of the credits screen, before the asset credits (which are
// built from public/assets/CREDITS.md). Fill in the names here.

export const GAME_CREDITS = {
  // Who made the game.
  createdBy: {
    label: 'יצירה, עיצוב ופיתוח',
    names: ['שמך כאן'],
  },
  // The voice actors, by role (the speakers in src/story/text.he.js).
  voices: {
    label: 'קולות',
    roles: [
      { role: 'סמ״ר אלון, מפקד הצוות', name: 'שם השחקן' },
      { role: 'יונתן', name: 'שם השחקן' },
      { role: 'נועם', name: 'שם השחקן' },
      { role: 'קשר ומוקד', name: 'שם השחקן' },
      { role: 'מדריכת הטיולים', name: 'שם השחקנית' },
      { role: 'אזרחים', name: 'שמות השחקנים' },
    ],
  },
  // Libraries that ship inside the game (their licenses ask to be credited).
  software: [
    { title: 'three.js', by: 'three.js authors', license: 'MIT' },
    { title: 'meshoptimizer', by: 'Arseny Kapoulkine', license: 'MIT' },
  ],
  thanks: 'תודה ששיחקתם',
};
