// Player movement tuning. Units: meters, seconds.

export const PLAYER = {
  // Body (collision capsule)
  radius: 0.3,
  standHeight: 1.8,
  crouchHeight: 1.15,
  standEyeHeight: 1.66,
  crouchEyeHeight: 1.02,

  // Ground handling
  stepHeight: 0.35, // obstacles up to this height are walked onto (stairs, curbs)
  snapDownDistance: 0.35, // drops up to this are followed while walking instead of falling
  footRadius: 0.24, // radius of the ground-probe ring (the "feet" support area)
  maxSlopeDeg: 46, // steeper surfaces are not walkable
  airStepHeight: 0.25, // ledge-catch allowance when landing from a jump

  // Speeds (m/s)
  walkSpeed: 4.3,
  sprintSpeed: 6.7,
  crouchSpeed: 2.1,

  // Acceleration (m/s^2)
  groundAccel: 42,
  groundDecel: 30,
  airAccel: 7,

  // Jumping and falling
  gravity: 20,
  jumpHeight: 1.0,
  maxFallSpeed: 45,
  coyoteTime: 0.1, // a jump still works this long after walking off an edge
  jumpBufferTime: 0.12, // a jump pressed this long before landing still fires

  killY: -30, // fell out of the world below this height: respawn
};

// First-person camera feel.
export const VIEW = {
  fov: 70, // vertical, degrees
  sprintFovBoost: 6,
  near: 0.05,
  far: 800,
  lookRadiansPerPixel: 0.002, // multiplied by the user's sensitivity setting
  eyeSmoothing: 14, // 1/s: crouch transitions and step-up/down smoothing
  fovSmoothing: 8,
  bob: {
    walk: { vertical: 0.022, lateral: 0.016 },
    sprint: { vertical: 0.045, lateral: 0.028 },
    crouch: { vertical: 0.012, lateral: 0.01 },
  },
  landingDipPerSpeed: 0.36, // spring impulse per m/s of landing speed
  landingSpring: 14, // rad/s, critically damped
  maxLandingDip: 0.2,
  strafeRollDeg: 0.8,
};
