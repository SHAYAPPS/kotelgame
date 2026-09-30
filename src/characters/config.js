// Character rendering and animation tuning. Units: meters, seconds.

export const CHARACTER = {
  // Distance multiplier from the graphics setting (Graphics.js characterLod).
  lodScale: 1,
  // Level of detail by camera distance (with hysteresis): LOD0 < near < LOD1 < far < LOD2.
  lodNear: 12,
  lodFar: 32,
  lodHysteresis: 2,
  // Animation update rate by distance: every frame up close, then every 2nd / 4th frame;
  // off-screen characters every 8th (their bones still drive the hit zones).
  updateFull: 16,
  updateHalf: 36,
  offscreenEvery: 8,
  // Characters farther than this are drawn on FAR_LAYER only: the main view sees them, the
  // ambient-occlusion prepass and the shadow cameras skip them (tiny on screen anyway).
  aoDistance: 20,
  // Only near characters cast shadows and get hand IK.
  shadowDistance: 30,
  ikDistance: 18,

  // Blending
  fade: 0.22, // default crossfade
  locoFade: 0.18, // idle <-> locomotion and between speeds
  dirSmoothing: 10, // 1/s, local move direction smoothing (strafe blend)
  speedSmoothing: 12,
  moveThreshold: 0.12, // m/s: below this the character stands

  // Upper-body overlays (reload, throw, hit) never fully replace the legs.
  upperBones: /^(Spine|Spine1|Spine2|Neck|Head|.*Shoulder|.*Arm|.*ForeArm|.*Hand.*)$/,

  // Aim: spine pitch toward the target, spread over the spine bones.
  aimPitchLimit: 0.9,
  aimShare: [0.3, 0.3, 0.4], // Spine, Spine1, Spine2
};

export const FAR_LAYER = 1;

// Default tint (per part slot, see the converter's PART): [r, g, b, amount]
export const NO_TINT = [1, 1, 1, 0];
