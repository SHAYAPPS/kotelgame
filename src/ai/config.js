// Enemy AI tuning. Units: meters, seconds, radians.

export const ENEMY = {
  // Body / hit zones (relative to the feet)
  radius: 0.3,
  height: 1.8,
  crouchHeight: 1.15,
  headRadius: 0.13,
  headHeight: 1.62, // head center when standing
  crouchHeadHeight: 0.98,
  eyeHeight: 1.62,
  crouchEyeHeight: 1.0,

  // Health
  health: 100,
  bodyDamage: 34, // player rifle: 3 body shots
  headDamage: 150, // one-shot headshot

  // Perception
  visionRange: 70,
  visionFov: (120 * Math.PI) / 180, // full cone angle
  peripheralFov: (170 * Math.PI) / 180, // slow detection out here
  awarenessRate: 2.2, // per second at 10 m, straight ahead, player standing
  awarenessDecay: 0.25,
  hearingRange: 70, // player gunshots
  alertedSearchTime: 12, // give up searching after this

  // Combat
  reactionTime: 0.75, // after (re)acquiring the player, before the first shot
  fireInterval: 0.1, // 600 RPM inside a burst
  burst: [3, 6],
  burstPause: [0.45, 1.1],
  maxSpread: (7 * Math.PI) / 180, // cone half-angle when he just got line of sight
  minSpread: (1.1 * Math.PI) / 180, // after tracking you for spreadTightenTime
  spreadTightenTime: 3.5,
  damage: 14,
  range: 120,

  // Cover
  hideTime: [1.2, 2.6],
  peekTime: [1.6, 3.0],
  coverSearchRadius: 36,
  preferredRange: [10, 35],
  closeRange: 6, // too close: relocate
  relocateCooldown: 2.5,

  // Movement
  walkSpeed: 2.2, // idle / searching
  runSpeed: 4.4, // moving to cover (the controller's walk speed is the cap)
  turnRate: 5, // rad/s
  arriveDistance: 0.45,
  repathInterval: 1.0,
};

export const NAV = {
  cell: 0.5,
  topY: 26, // probe floors from here down
  minY: -0.5, // ...to here
  maxLayers: 3,
  stepHeight: 0.45, // max height change between neighbor cells
  clearance: 1.75, // headroom needed to stand
  kneeHeight: 0.5, // edge rays: obstacles at these heights block a connection
  chestHeight: 1.35,
  minWalkNormalY: 0.69, // ~46 degrees, same as the player
};
