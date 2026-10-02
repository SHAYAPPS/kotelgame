// Graphics quality presets (the settings panel picks one; saved with the settings). Each
// preset sets the renderer's budget (resolution, shadows, characters) and which effects run;
// every effect can also be switched on its own (Settings > Graphics), on top of the preset.
// Targets: 60 FPS on high on a mid-range gaming PC, on medium on an average laptop.

const KEY = 'kotelgame.graphics';

/**
 * The effects (all subtle): temporal anti-aliasing, motion blur (off / low / high), ambient
 * occlusion, contact shadows, screen-space GI (bounced light), reflections on polished stone,
 * depth of field, eye adaptation, bloom, lens flares, film grain, vignette, volumetric haze,
 * heat distortion, parallax on the wall stones, close-up detail and wear on stone, dynamic
 * resolution.
 */
export const EFFECTS = ['aa', 'motionBlur', 'ao', 'contactShadows', 'ssgi', 'ssr', 'dof', 'eyeAdaptation', 'bloom', 'lensFlare', 'grain', 'vignette', 'haze', 'heat', 'parallax', 'detail', 'dynamicRes'];
export const MOTION_BLUR = ['off', 'low', 'high'];

export const QUALITY = {
  low: {
    pixelRatio: 1,
    cascades: 1,
    shadowMapSize: 1024,
    shadowFar: 90,
    flashLights: 2,
    anisotropy: 2,
    characterLod: 0.7, // scales the character LOD / animation-rate distances
    characterShadows: 10, // only characters this close cast shadows (m)
    characterShadowCount: 4, // and only the nearest so many
    crowdDensity: 0.4, // share of the far crowd drawn (the near crowd always is)
    npcFarStep: 4, // far-off people's physics steps less often (story/Npc.js NPC.farStep)
    aoScale: 0.5,
    aoSamples: 8,
    hazeSteps: 10,
    hazeScale: 0.25,
    minScale: 0.6, // dynamic resolution's floor
    effects: { aa: true, motionBlur: 'off', ao: false, contactShadows: false, ssgi: false, ssr: false, dof: false, eyeAdaptation: true, bloom: true, lensFlare: false, grain: false, vignette: true, haze: false, heat: false, parallax: false, detail: false, dynamicRes: true },
  },
  medium: {
    pixelRatio: 1,
    cascades: 2,
    shadowMapSize: 2048,
    shadowFar: 140,
    flashLights: 3,
    anisotropy: 4,
    characterLod: 1,
    characterShadows: 16,
    characterShadowCount: 10,
    aoScale: 0.5,
    aoSamples: 10,
    hazeSteps: 12,
    hazeScale: 0.33,
    ssrScale: 0.5,
    ssrQuality: 0.35,
    minScale: 0.65,
    effects: { aa: true, motionBlur: 'low', ao: true, contactShadows: false, ssgi: false, ssr: false, dof: false, eyeAdaptation: true, bloom: true, lensFlare: true, grain: true, vignette: true, haze: true, heat: true, parallax: true, detail: true, dynamicRes: true },
  },
  high: {
    pixelRatio: 1.5, // capped by the display's own ratio
    cascades: 3,
    shadowMapSize: 2048,
    shadowFar: 200,
    flashLights: 5,
    anisotropy: 8,
    characterLod: 1.4,
    characterShadows: 28,
    characterShadowCount: 20,
    aoScale: 0.5,
    aoSamples: 12,
    ssgi: { slices: 1, steps: 12 },
    hazeSteps: 16,
    hazeScale: 0.5,
    ssrScale: 0.5,
    ssrQuality: 0.5,
    minScale: 0.7,
    effects: { aa: true, motionBlur: 'low', ao: true, contactShadows: true, ssgi: true, ssr: true, dof: true, eyeAdaptation: true, bloom: true, lensFlare: true, grain: true, vignette: true, haze: true, heat: true, parallax: true, detail: true, dynamicRes: true },
  },
  ultra: {
    pixelRatio: 2,
    cascades: 4,
    shadowMapSize: 4096,
    shadowFar: 260,
    flashLights: 6,
    anisotropy: 16,
    characterLod: 1.8,
    characterShadows: 40,
    characterShadowCount: 36,
    aoScale: 1,
    aoSamples: 16,
    ssgi: { slices: 2, steps: 16 },
    hazeSteps: 24,
    hazeScale: 0.5,
    ssrScale: 1,
    ssrQuality: 0.7,
    minScale: 0.75,
    effects: { aa: true, motionBlur: 'high', ao: true, contactShadows: true, ssgi: true, ssr: true, dof: true, eyeAdaptation: true, bloom: true, lensFlare: true, grain: true, vignette: true, haze: true, heat: true, parallax: true, detail: true, dynamicRes: false },
  },
};

export const QUALITY_LEVELS = ['low', 'medium', 'high', 'ultra'];

/** The effects that run: the preset's, with the player's own switches on top. */
export function effectsFor(preset, overrides = {}) {
  const base = QUALITY[preset]?.effects ?? QUALITY.medium.effects;
  const out = { ...base };
  for (const k of EFFECTS) if (overrides && overrides[k] !== undefined) out[k] = overrides[k];
  return out;
}

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
