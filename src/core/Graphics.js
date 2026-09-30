// Graphics quality presets (the settings panel picks one; it's saved in localStorage).
// Medium is the target for an average laptop at 60 FPS.

const KEY = 'kotelgame.graphics';

export const QUALITY = {
  low: {
    pixelRatio: 1,
    msaa: 0,
    cascades: 1,
    shadowMapSize: 1024,
    shadowFar: 90,
    ao: 'off',
    bloom: false,
    flashLights: 1,
    anisotropy: 2,
    characterLod: 0.7, // scales the character LOD / animation-rate distances
    characterShadows: 14, // only characters this close cast shadows
  },
  medium: {
    pixelRatio: 1,
    msaa: 2,
    cascades: 2,
    shadowMapSize: 2048,
    shadowFar: 140,
    ao: 'half',
    bloom: true,
    flashLights: 3,
    anisotropy: 4,
    characterLod: 1,
    characterShadows: 24,
  },
  high: {
    pixelRatio: 2, // capped by the display's own ratio
    msaa: 4,
    cascades: 3,
    shadowMapSize: 2048,
    shadowFar: 200,
    ao: 'full',
    bloom: true,
    flashLights: 5,
    anisotropy: 8,
    characterLod: 1.4,
    characterShadows: 60,
  },
};

export const QUALITY_LEVELS = ['low', 'medium', 'high'];

export function loadQuality() {
  try {
    const q = localStorage.getItem(KEY);
    if (q && QUALITY[q]) return q;
  } catch {
    // storage unavailable
  }
  return 'medium';
}

export function saveQuality(q) {
  try {
    localStorage.setItem(KEY, q);
  } catch {
    // ignore
  }
}
