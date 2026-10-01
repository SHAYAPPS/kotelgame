// Rifle tuning. Units: meters, seconds, radians.

export const RIFLE = {
  // Ammo
  magazineSize: 30,
  reserveAmmo: 180,
  reloadTime: 2.0, // seconds from pressing R until the new magazine is ready

  // Fire
  fireRate: 11, // rounds per second (~660 RPM, full auto)
  range: 400,
  hipSpread: 0.018, // radians (cone half-angle), standing still
  adsSpread: 0.0025,
  moveSpread: 0.03, // extra hip spread at full walk speed
  airSpread: 0.05,

  // Recoil: view kick per shot that springs back to the aim point
  recoilPitch: 0.012, // radians up per shot
  recoilYaw: 0.004, // random left/right per shot
  adsRecoilScale: 0.6,
  recoilSpring: 16, // 1/s, how fast the view settles back
  maxRecoilPitch: 0.12,

  // Aim down sights
  adsTime: 0.18, // seconds to fully aim
  adsZoom: 0.8, // world FOV multiplier when fully aimed
  adsLookScale: 0.8, // mouse sensitivity multiplier when fully aimed
  adsMoveScale: 0.6, // movement speed multiplier while aiming
};

// Shoulder-fired rocket launcher (picked up in Mission 1's final push).
export const LAUNCHER = {
  reloadTime: 2.6,
  rocketSpeed: 75, // m/s
  gravity: 1.5, // a slight drop over long range
  maxFlight: 4, // seconds, then it self-destructs
  spread: 0.004,
  adsTime: 0.25,
  adsZoom: 0.7,
  adsLookScale: 0.7,
  adsMoveScale: 0.5,
  blastRadius: 6,
  blastDamage: 260, // at the center, to people (you have 100 health)
  switchTime: 0.55, // lower one weapon, raise the other
};

// The red dot sight on the rifle (built in RedDot.js). Meters / radians.
export const RED_DOT = {
  length: 0.118, // tube, rear lens to front
  radius: 0.0185, // tube body
  lensRadius: 0.0148,
  height: 0.0405, // optical axis above the rail top (a "lower 1/3" riser: the front sight post shows just under the dot)
  rearZ: 0.012, // rear end of the tube on the receiver rail (rifle model z)
  dotSize: 0.0019, // dot radius (rad); a real 2 MOA dot would be under a pixel
  glow: 0.35,
  color: [4.5, 0.12, 0.08], // HDR red: blooms slightly in daylight
  rearTint: [0.1, 0.09, 0.16], // coating sheen (additive), strongest at the rim
  frontTint: [0.07, 0.06, 0.09],
};

// The first-person weapon (Viewmodel.js): poses, timings and hand placement. Positions are
// in view space (meters; camera at the origin looking down -Z) and give where the weapon's
// sight point is: the red dot's rear lens (rifle) or the rear sight (launcher).
export const VIEWMODEL = {
  fov: 54, // viewmodel camera, hip
  adsFov: 44,
  rifle: {
    hip: { x: 0.095, y: -0.1, z: -0.25, rx: 0.03, ry: 0.11, rz: -0.06 },
    ads: { x: 0, y: 0, z: -0.185, rx: 0, ry: 0, rz: 0 },
    sprint: { x: 0.035, y: -0.105, z: -0.22, rx: 0.12, ry: 0.75, rz: 0.75 },
    lowered: { x: 0.06, y: -0.1, z: -0.25, rx: -0.42, ry: 0.28, rz: 0.08 },
    stowed: { x: 0.05, y: -0.42, z: -0.2, rx: -1.1, ry: 0.3, rz: 0.3 },
    // Added while reloading / checking the magazine: the magwell turned toward the eye.
    reload: { x: -0.035, y: 0.15, z: -0.05, rx: 0.27, ry: 0.59, rz: -0.74 },
    check: { x: 0.0, y: 0.15, z: -0.05, rx: 0.72, ry: 0.42, rz: -0.88 },
    // Shoulders (the arms rig's root) relative to rest, hip / ADS (the head drops onto the stock).
    shoulders: { x: 0.035, y: -0.215, z: 0.085 },
    shouldersAds: { x: 0.0, y: -0.2, z: 0.07 },
    poleR: [0.55, -1, 0.55],
    poleL: [-0.75, -1, 0.15],
  },
  launcher: {
    // On the right shoulder: the rear sight a hand's width right of and below the eye.
    hip: { x: 0.11, y: -0.06, z: -0.2, rx: 0.02, ry: 0.06, rz: -0.04 },
    ads: { x: 0, y: -0.004, z: -0.21, rx: 0, ry: 0, rz: 0 },
    sprint: { x: 0.08, y: -0.12, z: -0.22, rx: -0.25, ry: 0.45, rz: 0.3 },
    lowered: { x: 0.08, y: -0.13, z: -0.24, rx: -0.4, ry: 0.3, rz: 0.12 },
    stowed: { x: 0.06, y: -0.45, z: -0.22, rx: -1.0, ry: 0.3, rz: 0.3 },
    // Off the shoulder, muzzle up and in reach of the left hand.
    reload: { x: -0.13, y: -0.12, z: 0.1, rx: 0.95, ry: 0.3, rz: 0.4 },
    check: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 },
    shoulders: { x: 0.03, y: -0.2, z: 0.09 },
    shouldersAds: { x: 0.0, y: -0.19, z: 0.08 },
    poleR: [0.6, -1, 0.4],
    poleL: [-0.7, -1, 0.1],
  },
  // Reload timeline (seconds; RIFLE.reloadTime is 2.0). Sounds play at the same marks.
  reload: {
    magOut: 0.3, // magazine released
    magIn: 1.18, // new magazine seated (click)
    bolt: 1.42, // bolt release slapped (empty reloads only)
  },
  // Launcher reload (LAUNCHER.reloadTime 2.6): the new rocket slides in.
  launcherReload: { rocketIn: 1.55 },
};
