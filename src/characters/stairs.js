import { MathUtils } from 'three';

// Legs on stairs: the stair-up clip (from Mixamo) over the lower body while a character walks
// up a flight (the level's stair zones: it starts and stops exactly at the flight), at the
// real ground speed so the feet don't slide. Going down, the walk itself with the feet put on
// the steps reads better than the stair-down clip (made for steeper stairs: deep knees, a
// squat, the hips pitched back). Runners keep their run cycle; foot IK (CharacterModel._feet)
// puts the feet on the steps near the camera.

const RUN = 2.2; // m/s: above this, no stair clip
const FADE = 0.15; // in and out at the bottom / top of a flight
const RATE = [0.6, 1.9]; // the clip's own pace, sped up or slowed down at most this much
const CLIP = 'stairs_walk_up';

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
  const w = dir > 0 ? on * walk * moving : 0;
  if (w < 0.02) {
    if (state.clip) {
      model.fade(state.clip, 0, FADE, { mode: 'lower', key: 'stairs' });
      state.clip = null;
    }
    return 0;
  }
  const meta = model.type.meta[CLIP];
  if (!meta) return 0;
  // At the real ground speed (story NPCs slow down to a stair pace, see Npc.js), within a
  // natural range of the clip's own pace.
  const rate = MathUtils.clamp(speed / (meta.speed * model.type.hipsRatio), RATE[0], RATE[1]);
  model.fade(CLIP, w, FADE, { mode: 'lower', key: 'stairs', timeScale: rate });
  state.clip = CLIP;
  return w;
}
