import { MathUtils } from 'three';

// Legs on stairs: a stair clip (walking up / down, from Mixamo) over the lower body while a
// character walks across a flight (the level's stair zones: it starts and stops exactly at
// the flight), at the real ground speed so the feet don't slide. Runners keep their run
// cycle; foot IK (CharacterModel._feet) puts the feet on the steps near the camera.

const RUN = 2.2; // m/s: above this, no stair clip
const FADE = 0.15; // in and out at the bottom / top of a flight
const RATE = [0.6, 1.9]; // the clips' own pace, sped up or slowed down at most this much

/**
 * @param {import('./CharacterModel.js').CharacterModel} model
 * @param {{ clip: string|null }} state the animator's stair state (kept between calls)
 * @param {number} on 1 inside a flight, walking across it (world/stairs.js stairsAt), else 0
 * @param {number} dir +1 up / -1 down
 * @param {number} speed horizontal m/s
 */
export function stairLegs(model, state, on, dir, speed) {
  const walk = 1 - MathUtils.smoothstep(speed, RUN - 0.4, RUN);
  const moving = MathUtils.smoothstep(speed, 0.12, 0.35);
  const w = on * walk * moving;
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
  // At the real ground speed (story NPCs slow down to a stair pace, see Npc.js), within a
  // natural range of the clip's own pace.
  const rate = MathUtils.clamp(speed / (meta.speed * model.type.hipsRatio), RATE[0], RATE[1]);
  model.fade(clip, w, FADE, { mode: 'lower', key: 'stairs', timeScale: rate });
  state.clip = clip;
  return w;
}
