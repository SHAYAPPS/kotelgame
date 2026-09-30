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

// Squad members fighting on the player's side (story NPCs driven by the same AI).
// They can't die (plot armor) and are a little less deadly than the player, so the
// player does most of the work.
export const FRIENDLY = {
  ...ENEMY,
  invulnerable: true,
  regen: 20, // health per second
  awarenessRate: 6,
  reactionTime: 0.9,
  burst: [2, 4],
  burstPause: [0.9, 1.8],
  maxSpread: (8 * Math.PI) / 180,
  minSpread: (2 * Math.PI) / 180,
  spreadTightenTime: 5,
  coverSearchRadius: 16, // around the player (their anchor): the squad fights at your side
  preferredRange: [8, 30],
  seekTime: 4, // no enemy in sight this long: move to a spot that has one
  holdCombat: true, // never wander off searching
};

// Scripted attackers (story waves): they came to take the plaza, so they never give up;
// with nobody in sight they push toward the defenders from cover to cover.
export const ATTACKER = {
  ...ENEMY,
  holdCombat: true,
  seekTime: 6,
  assault: true,
  travelCost: 0.12, // cover score per meter away: low, so they advance
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
