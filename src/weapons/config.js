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
