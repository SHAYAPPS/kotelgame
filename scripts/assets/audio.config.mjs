// Sounds and music for scripts/assets/audio.mjs (npm run assets:audio). Every source is CC0,
// public domain or CC-BY (credited in public/assets/CREDITS.md); raw files live in
// assets-src/sfx/<pack>/ (git-ignored) and are fetched again from these URLs when missing.

const OGA = 'https://opengameart.org/sites/default/files/';
const COMMONS = 'https://commons.wikimedia.org/wiki/Special:FilePath/';

// Where the raw files come from. `files`: local name -> URL (archives are extracted next to them).
export const PACKS = {
  firearms: {
    title: 'The Free Firearm Sound Library',
    author: 'Ben Jaszczak, Brian Nelson, Kevin Heras and Matthew Nanney',
    license: 'CC0',
    page: 'https://opengameart.org/content/the-free-firearm-sound-library',
    files: { 'firearm-library.7z': `${OGA}Prepared%20SFX%20Library.7z` },
  },
  reloads: {
    title: 'Gun Reload Sounds',
    author: 'SpringySpringo',
    license: 'CC0',
    page: 'https://opengameart.org/content/gun-reload-sounds',
    files: { 'assaultriflereload1_0.wav': `${OGA}assaultriflereload1_0.wav`, 'gunreload1.wav': `${OGA}gunreload1.wav` },
  },
  clipload: {
    title: 'Gun Reload Sound Effects',
    author: 'BMacZero',
    license: 'CC0',
    page: 'https://opengameart.org/content/gun-reload-sound-effects',
    files: { 'clipload1.wav': `${OGA}clipload1.wav`, 'clipload2.wav': `${OGA}clipload2.wav`, 'singlebullet1.wav': `${OGA}singlebullet1.wav` },
  },
  weaponClicks: {
    title: '2 Metal Weapon Clicks',
    author: 'Michel Baradari (apollo-music.de)',
    license: 'CC-BY 3.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/3.0/',
    page: 'https://opengameart.org/content/2-metal-weapon-clicks',
    files: { 'clicks.7z': `${OGA}clicks.7z` },
  },
  gear: {
    title: 'Equipment Clicks II',
    author: 'LFA',
    license: 'CC0',
    page: 'https://opengameart.org/content/equipment-clicks-ii',
    files: { 'equipmentclicks.wav': `${OGA}equipmentclicks.wav` },
  },
  explosionsHQ: {
    title: '2 High Quality Explosions',
    author: 'Michel Baradari (apollo-music.de)',
    license: 'CC-BY 3.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/3.0/',
    page: 'https://opengameart.org/content/2-high-quality-explosions',
    files: { 'explosions.7z': `${OGA}explosions.7z` },
  },
  explosions: {
    title: 'Explosions',
    author: 'EZduzziteh',
    license: 'CC0',
    page: 'https://opengameart.org/content/explosions-4',
    files: { 'explosion1_0.ogg': `${OGA}explosion1_0.ogg`, 'explosion2.ogg': `${OGA}explosion2.ogg`, 'explosion3.ogg': `${OGA}explosion3.ogg`, 'explosions4.ogg': `${OGA}explosions4.ogg` },
  },
  launches: {
    title: '4 Projectile Launches',
    author: 'Michel Baradari (apollo-music.de)',
    license: 'CC-BY 3.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/3.0/',
    page: 'https://opengameart.org/content/4-projectile-launches',
    files: { 'launches.7z': `${OGA}launches.7z` },
  },
  whoosh: {
    title: 'Air Whoosh',
    author: 'pyranostudios',
    license: 'CC0',
    page: 'https://opengameart.org/content/air-whoosh',
    files: { 'whoosh2_0.wav': `${OGA}whoosh2_0.wav` },
  },
  crowdShouting: {
    title: 'Crowd shouting/speaking ambience',
    author: 'StarNinjas',
    license: 'CC0',
    page: 'https://opengameart.org/content/crowd-shoutingspeaking-ambience',
    files: { 'crowd_shouting_0.ogg': `${OGA}crowd_shouting_0.ogg` },
  },
  traffic: {
    title: 'High traffic road sounds',
    author: 'IgnasD',
    license: 'CC0',
    page: 'https://opengameart.org/content/high-traffic-road-sounds',
    files: { 'gatve Varniu_2.ogg': `${OGA}gatve%20Varniu_2.ogg` },
  },
  birds: {
    title: 'Ambient Bird Sounds',
    author: 'isaiah658',
    license: 'CC0',
    page: 'https://opengameart.org/content/ambient-bird-sounds',
    files: { 'birds-isaiah658_0.ogg': `${OGA}birds-isaiah658_0.ogg` },
  },
  wind: {
    title: 'Park ambiences',
    author: 'Thimras',
    license: 'CC0',
    page: 'https://opengameart.org/content/park-ambiences',
    files: { 'park_ambience_wind.wav': `${OGA}park_ambience_wind.wav` },
  },
  static: {
    title: 'Static',
    author: 'xhunterko',
    license: 'CC0',
    page: 'https://opengameart.org/content/static',
    files: { 'ScatterNoise1.mp3': `${OGA}ScatterNoise1.mp3` },
  },
  staticBursts: {
    title: 'Frequency Static Sound Effects',
    author: 'bretbernhoft',
    license: 'CC0',
    page: 'https://opengameart.org/content/frequency-static-sound-effects',
    files: { 'static1.wav': `${OGA}static1.wav` },
  },
  screamsF: {
    title: 'Female Screams (the CC0 ones: tcrocker68, pushkin, Archeos via Freesound)',
    author: 'congusbongus (compilation)',
    license: 'CC0',
    page: 'https://opengameart.org/content/female-screams',
    files: { 'female_screams.zip': `${OGA}female_screams.zip` },
  },
  screamsM: {
    title: 'Aargh (male screams; the CC0 ones: JohnsonBrandEditing via Freesound)',
    author: 'congusbongus (compilation)',
    license: 'CC0',
    page: 'https://opengameart.org/content/aargh-male-screams',
    files: { 'aargh.zip': `${OGA}aargh.zip` },
  },
  engine: {
    title: 'Car Engine Loop (96kHz 4s)',
    author: 'qubodup',
    license: 'CC-BY 3.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/3.0/',
    page: 'https://opengameart.org/content/car-engine-loop-96khz-4s',
    files: { 'engine-loop.7z': `${OGA}engine-loop.7z` },
  },
  kenneyImpact: {
    title: 'Impact Sounds',
    author: 'Kenney (www.kenney.nl)',
    license: 'CC0',
    page: 'https://kenney.nl/assets/impact-sounds',
    files: { 'kenney_impact-sounds.zip': 'https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip' },
  },
  kenneyUI: {
    title: 'Interface Sounds',
    author: 'Kenney (www.kenney.nl)',
    license: 'CC0',
    page: 'https://kenney.nl/assets/interface-sounds',
    files: { 'kenney_interface-sounds.zip': 'https://kenney.nl/media/pages/assets/interface-sounds/fa43c1dd4d-1677589452/kenney_interface-sounds.zip' },
  },
  siren: {
    title: 'Civil defense siren and missile explosions sounds in Israel during Iran war 2026',
    author: 'Yoram Shurek (יורם שורק)',
    license: 'CC0',
    page: 'https://commons.wikimedia.org/wiki/File:Civil_defense_siren_and_missile_explosions_sounds_in_Israel_during_Iran_war_2026.ogg',
    files: { 'siren_2026.ogg': `${COMMONS}Civil_defense_siren_and_missile_explosions_sounds_in_Israel_during_Iran_war_2026.ogg` },
  },
  street: {
    title: 'Karlova 0001 (street ambience, Prague)',
    author: 'Juan de Vojníkov',
    license: 'Public domain',
    page: 'https://commons.wikimedia.org/wiki/File:Karlova_0001.ogg',
    files: { 'karlova.ogg': `${COMMONS}Karlova_0001.ogg` },
  },
  crowdMurmur: {
    title: 'Festival concert people crowd',
    author: 'stephan',
    license: 'Public domain',
    page: 'https://commons.wikimedia.org/wiki/File:Festival_concert_people_crowd.ogg',
    files: { 'festival_crowd.ogg': `${COMMONS}Festival_concert_people_crowd.ogg` },
  },
  hebrew: {
    title: 'Lingua Libre Hebrew word recordings',
    author: 'YaronSh (Lingua Libre)',
    license: 'CC0',
    page: 'https://commons.wikimedia.org/wiki/Category:Lingua_Libre_pronunciation-heb',
    // Single words (Hebrew, read by native speakers) cut into radio chatter in the game.
    files: {
      'YaronSh_00.wav': `${COMMONS}${encodeURIComponent('LL-Q9288 (heb)-YaronSh-אֶחָד.wav')}`, // אחד
      'YaronSh_01.wav': `${COMMONS}${encodeURIComponent('LL-Q9288 (heb)-YaronSh-אַרְבַּע.wav')}`, // ארבע
      'YaronSh_02.wav': `${COMMONS}${encodeURIComponent('LL-Q9288 (heb)-YaronSh-חמישה.wav')}`, // חמישה
      'YaronSh_03.wav': `${COMMONS}${encodeURIComponent('LL-Q9288 (heb)-YaronSh-כוח.wav')}`, // כוח
      'YaronSh_04.wav': `${COMMONS}${encodeURIComponent('LL-Q9288 (heb)-YaronSh-סוף.wav')}`, // סוף
      'YaronSh_05.wav': `${COMMONS}${encodeURIComponent('LL-Q9288 (heb)-YaronSh-כאן.wav')}`, // כאן
      'YaronSh_13.wav': `${COMMONS}${encodeURIComponent('LL-Q9288 (heb)-YaronSh-פתח.wav')}`, // פתח
      'YaronSh_14.wav': `${COMMONS}${encodeURIComponent('LL-Q9288 (heb)-YaronSh-אזור.wav')}`, // אזור
      'YaronSh_15.wav': `${COMMONS}${encodeURIComponent('LL-Q9288 (heb)-YaronSh-אחרי.wav')}`, // אחרי
      'YaronSh_16.wav': `${COMMONS}${encodeURIComponent('LL-Q9288 (heb)-YaronSh-בטוח.wav')}`, // בטוח
      'YaronSh_17.wav': `${COMMONS}${encodeURIComponent('LL-Q9288 (heb)-YaronSh-בקרוב.wav')}`, // בקרוב
    },
  },
  music: {
    title: 'Music by Kevin MacLeod (incompetech.com)',
    author: 'Kevin MacLeod',
    license: 'CC-BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    page: 'https://incompetech.com/music/royalty-free/',
    files: Object.fromEntries(
      ['Desert City', 'Drums of the Deep', 'Urban Gauntlet', 'The Escalation', 'Heart of Nowhere'].map((t) => [`${t}.mp3`, `https://incompetech.com/music/royalty-free/mp3-royaltyfree/${encodeURIComponent(t)}.mp3`]),
    ),
  },
};

const FF = 'Prepared SFX Library/';
const KI = 'Audio/'; // inside the Kenney zips
const range = (n, f) => Array.from({ length: n }, (_, i) => f(i));

/**
 * Sounds. Each: pack, then `variants`: [{ file, from?, to?, pitch?, ... }] (or `file` + `slices`).
 * Options (sound-wide or per variant): stereo (default mono), lowpass / highpass (Hz), gain (dB,
 * baked), fadeIn / fadeOut (s), pitch (playback-rate factor, 1 = as recorded), sweep ([from, to]
 * pitch over the clip: a Doppler pass), loop (crossfade seconds: a seamless loop), level (dB
 * target for the loudest 50 ms, default -10; beds use their average level: bed: true),
 * kbps (Opus bitrate), concat ([{ file, from, to }, { gap }]: pieces joined).
 * `mix` is the game's playback gain in dB (written to the manifest).
 */
export const SOUNDS = {
  // --- The player's rifle: close blast, the plaza's slap-back from the mid-distance mic, action.
  rifle_close: { pack: 'firearms', stereo: true, file: `${FF}AR-15/D_32P.wav`, slices: [[0.692, 1.32], [5.637, 6.27]], fadeOut: 0.32, level: -3, kbps: 96 },
  rifle_tail: { pack: 'firearms', stereo: true, file: `${FF}AR-15/D_24P.wav`, slices: [[0.66, 2.0], [4.015, 5.35]], fadeIn: 0.04, fadeOut: 0.7, highpass: 150, level: -8, kbps: 80 },
  rifle_mech: {
    pack: 'weaponClicks',
    variants: [
      { file: 'clicks/weapload.wav', pitch: 1.45, to: 0.15 },
      { file: 'clicks/weapload.wav', pitch: 1.6, to: 0.14 },
    ],
    fadeOut: 0.04,
    highpass: 400,
    level: -10,
  },
  // --- Other people's guns (positional, mono): near / mid / far by distance.
  ar_near: { pack: 'firearms', file: `${FF}AR-15/D_32P.wav`, slices: [[0.692, 1.25], [5.637, 6.2]], fadeOut: 0.3 },
  ar_mid: { pack: 'firearms', file: `${FF}AR-15/D_24P.wav`, slices: [[0.575, 1.9], [3.93, 5.25]], fadeIn: 0.002, fadeOut: 0.6 },
  ar_far: { pack: 'firearms', file: `${FF}AR-15/D_24P.wav`, slices: [[0.575, 2.0], [3.93, 5.35]], lowpass: 1600, fadeIn: 0.004, fadeOut: 0.8 },
  ak_near: { pack: 'firearms', file: `${FF}AK-47/C_28P.wav`, slices: [[0.602, 1.2], [3.247, 3.85], [6.012, 6.6], [9.147, 9.75]], fadeOut: 0.3 },
  ak_mid: { pack: 'firearms', file: `${FF}AK-47/C_31P.wav`, slices: [[0.35, 1.6], [4.41, 5.6]], fadeIn: 0.002, fadeOut: 0.6 },
  ak_far: { pack: 'firearms', file: `${FF}AK-47/C_31P.wav`, slices: [[0.35, 1.7], [4.41, 5.7]], lowpass: 1400, fadeIn: 0.004, fadeOut: 0.8 },
  // Near misses: the supersonic cracks the downrange mic caught ahead of the muzzle report,
  // and a whoosh swept down in pitch (a bullet's pass).
  crack: {
    pack: 'firearms',
    variants: [
      { file: `${FF}AR-15/D_24P.wav`, from: 0.541, to: 0.572 },
      { file: `${FF}AR-15/D_24P.wav`, from: 3.906, to: 3.936 },
      { file: `${FF}AK-47/C_31P.wav`, from: 0.331, to: 0.354 },
      { file: `${FF}AK-47/C_31P.wav`, from: 4.396, to: 4.414 },
    ],
    highpass: 900,
    fadeIn: 0.0005,
    fadeOut: 0.012,
    level: -4,
  },
  whiz: {
    pack: 'whoosh',
    // A fast "fwip": swells in, cut short as it passes.
    variants: range(4, (i) => ({ file: 'whoosh2_0.wav', from: 0.6 + i * 1.1, to: 1.05 + i * 1.1, sweep: [2.8 + i * 0.2, 1.6] })),
    highpass: 900,
    fadeIn: 0.13,
    fadeOut: 0.035,
    level: -8,
  },
  // --- Explosions: near (grenades, rockets, the truck), small pops, far (the real interception
  // booms from the siren recording).
  explosion: {
    pack: 'explosionsHQ',
    variants: [{ file: 'explosions/explode.wav' }, { pack: 'explosions', file: 'explosion1_0.ogg' }, { pack: 'explosions', file: 'explosion3.ogg' }],
    fadeOut: 0.4,
    level: -2,
  },
  explosion_small: {
    pack: 'explosionsHQ',
    variants: [{ file: 'explosions/explodemini.wav' }, { pack: 'explosions', file: 'explosion2.ogg' }, { pack: 'explosions', file: 'explosions4.ogg' }],
    fadeOut: 0.2,
    level: -3,
  },
  boom_far: {
    pack: 'siren',
    variants: [
      { from: 70.1, to: 75.9 },
      { from: 86.95, to: 89.4 },
      { from: 90.8, to: 95.4 },
      { from: 99.3, to: 103.9 },
    ],
    highpass: 25,
    fadeIn: 0.01,
    fadeOut: 1.2,
    level: -6,
    file: 'siren_2026.ogg',
  },
  rocket_launch: { pack: 'launches', stereo: true, file: 'launches/rlaunch.wav', fadeOut: 0.6, level: -3, kbps: 96 },
  // --- Grenades.
  grenade_pin: { pack: 'weaponClicks', file: 'clicks/outofammo.wav', pitch: 1.35, highpass: 600, level: -10 },
  grenade_throw: { pack: 'whoosh', variants: [{ file: 'whoosh2_0.wav', from: 2.9, to: 3.5, sweep: [1.35, 1.0] }], fadeIn: 0.08, fadeOut: 0.15, level: -12 },
  grenade_bounce: { pack: 'kenneyImpact', variants: range(3, (i) => ({ file: `${KI}impactMetal_heavy_00${i}.ogg`, pitch: 0.9 })), level: -8 },
  // --- Casings on stone (small brass: Kenney's light metal hits, pitched up).
  casing: { pack: 'kenneyImpact', variants: range(5, (i) => ({ file: `${KI}impactMetal_light_00${i}.ogg`, pitch: 1.55 + (i % 3) * 0.12 })), highpass: 1200, level: -12 },
  // --- Reload / handling (the animation's marks: VIEWMODEL.reload in src/weapons/config.js).
  mag_out: { pack: 'reloads', file: 'assaultriflereload1_0.wav', from: 0.2, to: 0.62, fadeOut: 0.1, level: -10 },
  mag_in: { pack: 'reloads', file: 'assaultriflereload1_0.wav', from: 0.985, to: 1.56, fadeOut: 0.15, level: -6 },
  bolt: { pack: 'reloads', file: 'gunreload1.wav', from: 1.245, to: 1.58, fadeOut: 0.1, level: -5 },
  charge: {
    pack: 'reloads',
    concat: [{ file: 'gunreload1.wav', from: 0.1, to: 0.3 }, { gap: 0.13 }, { file: 'gunreload1.wav', from: 1.245, to: 1.58 }],
    fadeOut: 0.1,
    level: -6,
  },
  dry_fire: { pack: 'weaponClicks', file: 'clicks/outofammo.wav', level: -9 },
  mag_check: { pack: 'clipload', variants: [{ file: 'clipload1.wav' }, { file: 'clipload2.wav' }], level: -12 },
  launcher_load: {
    pack: 'reloads',
    concat: [{ file: 'assaultriflereload1_0.wav', from: 0.985, to: 1.18, pitch: 0.65 }, { gap: 0.05 }, { pack: 'kenneyImpact', file: `${KI}impactMetal_heavy_003.ogg`, pitch: 0.7 }],
    fadeOut: 0.15,
    level: -6,
  },
  gear: { pack: 'gear', variants: [[0.0, 0.62], [0.95, 1.6], [1.95, 2.55], [2.9, 3.6], [3.85, 4.5], [4.75, 5.4]].map(([from, to]) => ({ file: 'equipmentclicks.wav', from, to })), fadeOut: 0.12, level: -14 },
  // --- Footsteps by surface.
  step_stone: { pack: 'kenneyImpact', variants: range(5, (i) => ({ file: `${KI}footstep_concrete_00${i}.ogg` })), level: -10 },
  step_wood: { pack: 'kenneyImpact', variants: range(5, (i) => ({ file: `${KI}footstep_wood_00${i}.ogg` })), level: -10 },
  // --- Hits and UI.
  hit: { pack: 'kenneyUI', variants: [{ file: 'Audio/tick_002.ogg' }, { file: 'Audio/tick_004.ogg' }], level: -10, stereo: true },
  hit_head: { pack: 'kenneyUI', variants: [{ file: 'Audio/glass_002.ogg', pitch: 1.2 }], level: -9, stereo: true },
  chime: { pack: 'kenneyUI', file: 'Audio/confirmation_002.ogg', level: -12, stereo: true },
  resupply: { pack: 'clipload', concat: [{ file: 'clipload2.wav' }, { gap: 0.08 }, { file: 'clipload1.wav' }, { gap: 0.1 }, { pack: 'gear', file: 'equipmentclicks.wav', from: 0.95, to: 1.6 }], fadeOut: 0.12, level: -10 },
  // --- Radio: squelches and the static under a transmission; Hebrew words for the chatter.
  radio_squelch: { pack: 'staticBursts', variants: range(3, (i) => ({ file: 'static1.wav', from: 3 + i * 7, to: 3.11 + i * 7 })), highpass: 900, lowpass: 5000, fadeIn: 0.003, fadeOut: 0.03, level: -12 },
  radio_static: { pack: 'static', file: 'ScatterNoise1.mp3', from: 2, to: 10, loop: 1, bed: true, highpass: 500, lowpass: 4500, level: -24 },
  radio_words: { pack: 'hebrew', hebrew: true, highpass: 120, fadeIn: 0.005, fadeOut: 0.03, level: -10 },
  // --- People.
  scream: {
    pack: 'screamsF',
    variants: [
      ...range(4, (i) => ({ file: `${i + 1}.ogg` })),
      ...range(5, (i) => ({ pack: 'screamsM', file: `aargh${i + 3}.ogg` })),
    ],
    fadeOut: 0.15,
    level: -6,
  },
  // --- Ambience beds (seamless loops).
  amb_city: { pack: 'traffic', file: 'gatve Varniu_2.ogg', from: 4, to: 36, loop: 3, bed: true, lowpass: 650, highpass: 40, level: -24 },
  amb_street: { pack: 'street', file: 'karlova.ogg', from: 20, to: 52, loop: 3, bed: true, highpass: 120, lowpass: 9000, level: -24, stereo: true, kbps: 80 },
  amb_crowd: { pack: 'crowdMurmur', file: 'festival_crowd.ogg', from: 8, to: 40, loop: 3, bed: true, highpass: 150, lowpass: 7000, level: -24, stereo: true, kbps: 80 },
  amb_birds: { pack: 'birds', file: 'birds-isaiah658_0.ogg', from: 0, to: 30, loop: 2, bed: true, highpass: 1500, level: -26, stereo: true, kbps: 80 },
  amb_wind: { pack: 'wind', file: 'park_ambience_wind.wav', from: 30, to: 62, loop: 3, bed: true, highpass: 60, lowpass: 2500, level: -28 },
  amb_panic: { pack: 'crowdShouting', file: 'crowd_shouting_0.ogg', from: 0.5, to: 26.5, loop: 2, bed: true, highpass: 120, level: -18, stereo: true, kbps: 80 },
  // The real siren: whole rise-and-fall cycles (6.43 s each), crossfaded at the same phase.
  siren: { pack: 'siren', file: 'siren_2026.ogg', from: 16.5, to: 55.08, loop: 0.8, bed: true, level: -14, stereo: true, kbps: 80 },
  truck_engine: { pack: 'engine', file: 'engine-loop/engine-loop-1-normalized.wav', from: 0, to: 3.8, loop: 0.2, bed: true, level: -14 },
};

// Music: streamed (an <audio> element each), whole tracks. state -> track.
export const MUSIC = {
  calm: { file: 'Desert City.mp3', title: 'Desert City' },
  tense: { file: 'Drums of the Deep.mp3', title: 'Drums of the Deep' },
  combat: { file: 'Urban Gauntlet.mp3', title: 'Urban Gauntlet' },
  push: { file: 'The Escalation.mp3', title: 'The Escalation' },
  end: { file: 'Heart of Nowhere.mp3', title: 'Heart of Nowhere' },
};
