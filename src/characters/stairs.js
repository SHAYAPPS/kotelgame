import { MathUtils } from 'three';

// Legs on stairs: a stair clip (walking up / down, from Mixamo) over the lower body while a
// character walks a flight, at the real ground speed so the feet don't slide. Runners keep
// their run cycle (a stair clip that fast would be a blur); foot IK (CharacterModel._feet)
// puts the feet on the steps near the camera.

const RUN = 2.2; // m/s: above this, no stair clip
const FADE = 0.2;

/**
 * @param {import('./CharacterModel.js').CharacterModel} model
 * @param {{ clip: string|null }} state the animator's stair state (kept between calls)
 * @param {number} amount 0..1 on stairs (StairTracker)
 * @param {number} dir +1 up / -1 down
 * @param {number} speed horizontal m/s
 */
export function stairLegs(model, state, amount, dir, speed) {
  const walk = 1 - MathUtils.smoothstep(speed, RUN - 0.4, RUN);
  const moving = MathUtils.smoothstep(speed, 0.15, 0.5);
  const w = amount * walk * moving;
  const clip = dir > 0 ? 'stairs_walk_up' : 'stairs_walk_down';
  if (w < 0.02) {
    if (state.clip) {
      model.fade(state.clip, 0, FADE, { mode: 'lower', key: 'stairs' });
      state.clip = null;
    }
    return 0;
  }
  const meta = model.type.meta[clip];
  if (!meta) return 0;
  const rate = MathUtils.clamp(speed / (meta.speed * model.type.hipsRatio), 0.4, 3.8);
  model.fade(clip, w, FADE, { mode: 'lower', key: 'stairs', timeScale: rate });
  state.clip = clip;
  return w;
}
