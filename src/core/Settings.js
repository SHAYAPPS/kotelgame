// The player's settings (the Settings screen, shared by the main and pause menus), saved in
// localStorage as one JSON object. Pure: the storage is passed in (tests use a Map-like).

export const SETTINGS_KEY = 'kotelgame.settings';

export const DEFAULT_SETTINGS = {
  // Controls
  sensitivity: 1, // mouse look
  aimSensitivity: 1, // times the above while aiming down the sights
  invertY: false,
  bindings: {}, // action -> key code, only the ones changed from the defaults (Bindings.js)
  // Graphics
  quality: 'medium', // src/core/Graphics.js QUALITY
  fov: 70, // vertical field of view, degrees
  showFps: false,
  // Audio, 0..1
  volumes: { master: 0.85, music: 0.55, sfx: 0.9, voice: 1 },
  // Gameplay
  difficulty: 'normal', // src/story/difficulty.js LEVELS
  subtitles: true,
};

export const LIMITS = { sensitivity: [0.2, 3], aimSensitivity: [0.3, 2], fov: [55, 90] };
export const QUALITIES = ['low', 'medium', 'high'];
export const DIFFICULTIES = ['easy', 'normal', 'hard'];

// What the game saved before there was one settings object (taken over once).
const OLD_KEYS = { sensitivity: 'kotelgame.sensitivity', quality: 'kotelgame.graphics', volumes: 'kotelgame.volume' };

/** localStorage, or null where there is none (Node, private mode with storage blocked). */
export function browserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function read(storage, key) {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

/** Settings from storage (or the defaults), every value checked. */
export function loadSettings(storage = browserStorage()) {
  const s = structuredClone(DEFAULT_SETTINGS);
  if (!storage) return s;
  let saved = null;
  try {
    saved = JSON.parse(read(storage, SETTINGS_KEY) ?? 'null');
  } catch {
    saved = null;
  }
  if (!saved || typeof saved !== 'object') {
    saved = {};
    const sens = parseFloat(read(storage, OLD_KEYS.sensitivity));
    if (Number.isFinite(sens)) saved.sensitivity = sens;
    const q = read(storage, OLD_KEYS.quality);
    if (q) saved.quality = q;
    try {
      const v = JSON.parse(read(storage, OLD_KEYS.volumes) ?? 'null');
      if (v && typeof v === 'object') saved.volumes = v;
    } catch {
      // ignore
    }
  }
  return sanitize({ ...s, ...saved, volumes: { ...s.volumes, ...(saved.volumes ?? {}) } });
}

/** Clamp numbers into range, unknown names to the defaults (a hand-edited or old save). */
export function sanitize(s) {
  const d = DEFAULT_SETTINGS;
  const num = (v, [lo, hi], def) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def);
  const out = {
    sensitivity: num(s.sensitivity, LIMITS.sensitivity, d.sensitivity),
    aimSensitivity: num(s.aimSensitivity, LIMITS.aimSensitivity, d.aimSensitivity),
    invertY: s.invertY === true,
    bindings: {},
    quality: QUALITIES.includes(s.quality) ? s.quality : d.quality,
    fov: Math.round(num(s.fov, LIMITS.fov, d.fov)),
    showFps: s.showFps === true,
    volumes: {},
    difficulty: DIFFICULTIES.includes(s.difficulty) ? s.difficulty : d.difficulty,
    subtitles: s.subtitles !== false,
  };
  for (const k of Object.keys(d.volumes)) out.volumes[k] = num(s.volumes?.[k], [0, 1], d.volumes[k]);
  if (s.bindings && typeof s.bindings === 'object') {
    for (const [action, code] of Object.entries(s.bindings)) if (typeof code === 'string' && code.length < 32) out.bindings[action] = code;
  }
  return out;
}

export function saveSettings(s, storage = browserStorage()) {
  try {
    storage?.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // storage full or blocked: the settings still apply this session
  }
}
