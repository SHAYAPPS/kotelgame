// Every dimension of the greybox Kotel plaza, in meters. Tune the scale here.
// Sources and estimates: docs/kotel-reference.md ([S] = sourced, [E] = estimate).
//
// Coordinates: +X = east (toward the wall), +Y = up, +Z = south, so -Z is north.
// The wall face is the plane x = 0, the plaza is at x < 0, the prayer floor is y = 0.
// Facing the wall (east), north / the men's section is on your left.

export const KOTEL = {
  wall: {
    faceX: 0,
    thickness: 5,
    height: 19, // [S] above the prayer floor
    prayerZ: [-29, 29], // [S] 57-60 m open-air prayer section
    // The wall continues south past the prayer section, behind the Mughrabi Bridge.
    southZ: 64,
    // Stone bands, bottom to top [S course counts, E sizes]
    bands: [
      // Herodian: 7 courses of huge drafted-margin ashlars
      { top: 7.5, course: [1.0, 1.12], length: [1.4, 4.6], gap: 0.035, relief: 0.05, margin: 0.08, color: 0xcbbd9c, colorJitter: 0.1 },
      // Umayyad: 4 courses, medium, plain faces
      { top: 11, course: [0.82, 0.95], length: [0.9, 1.7], gap: 0.03, relief: 0.06, color: 0xd6c39b, colorJitter: 0.12 },
      // Mamluk / Ottoman: ~16 courses of small, rougher squared stones
      { top: 19, course: [0.44, 0.52], length: [0.45, 0.85], gap: 0.025, relief: 0.035, color: 0xdcc79c, colorJitter: 0.1, rough: true },
    ],
    plants: { count: 150, color: 0x5d7a3a, minY: 2.5 },
    // Folded prayer notes in the joints at hand height, along the prayer section.
    notes: { count: 420, z: [-27, 27] },
    seed: 1967,
  },

  prayer: {
    depth: 30, // [E] wall to back fence (x = -30)
    mechitzaZ: 17, // [S] men 48 m north / women 12 m south of it
    mechitzaHeight: 2.0, // [E]
    fenceHeight: 1.1, // [E]
    fenceStoneHeight: 0.55,
    // Openings in the back fence (z ranges) [E]
    openings: [
      [-15, -10.5], // men's entrance
      [21, 25], // women's entrance
    ],
    southScreenHeight: 2.6, // screen closing the women's section off from the dig to the south
  },

  wilsonsArch: {
    z: [-42, -29], // [S] ~13 m span; hall runs north under the arch
    span: 13, // [S] 12.8-13 m, springing at the wall, west pier at x = -13
    crown: 7, // [S] ~6-7.6 m visible above the floor
    pierWidth: 2,
    buildingTop: 21, // Tankiziyya building above [E]
  },

  tunnels: {
    // Building west of the hall with the (closed) Western Wall Tunnels entrance [E]
    x: [-30, -15],
    z: [-45, -29],
    height: 11,
    doorX: -22.5,
    doorWidth: 2.4,
    doorHeight: 3,
  },

  plaza: {
    westX: -105, // [E] west edge (building facades)
    northZ: -45, // [E]
    southZ: 65, // [E]
    // Terraces rising west [E]: each is a step band at x, then a flat level at y.
    terraces: [
      { x: -55, rise: 1.2, steps: 8 },
      { x: -78, rise: 1.8, steps: 12 },
    ],
    stepRun: 0.35,
    flagpole: { x: -42, z: 2, height: 12 },
  },

  buildings: {
    // [x0, x1, z0, z1, height above its ground]
    west: [
      [-140, -105, -45, 22, 24], // Aish HaTorah / houses
      [-140, -105, 34, 65, 20], // Porat Yosef side
    ],
    north: [
      [-105, -62, -60, -45, 14], // Beit Strauss / Heritage Foundation
      [-62, -30, -58, -45, 12], // arcaded buildings, police
    ],
    arcadeZ: -45, // arcade along the north buildings' plaza face
  },

  stairs: {
    // Yehuda HaLevi stairs up to the Jewish Quarter, between the west buildings [E]
    z: [22, 34],
    flights: 3,
    stepsPerFlight: 16,
    rise: 0.18,
    run: 0.32,
    landing: 3,
  },

  mughrabi: {
    width: 3.6, // [E]
    start: { x: -61, z: 63 }, // on the first terrace, right by the southern entrance [E]
    end: { x: -3, z: 38 }, // Mughrabi Gate [E]
    gateY: 13, // [E] gate sill
    wallHeight: 2.2, // lattice side walls
    roofHeight: 2.9,
    postSpacing: 4,
  },

  // Fenced archaeological area south of the prayer area, under the bridge
  dig: { x: [-48, 0], z: [30, 64], fenceHeight: 2.2 },

  south: {
    // Entrance corridor from the checkpoint up into the plaza's south-west
    corridorX: [-77, -58],
    z: [65, 102],
    level: 1.2, // same as the first terrace
    checkpoint: { x: -67.5, z: 86, width: 17, depth: 9, canopyHeight: 3.6 },
  },

  backdrop: {
    templeMountY: 19,
    domeOfTheRock: { x: 175, z: -70, platformY: 23, octagonRadius: 26, octagonHeight: 11, drumRadius: 12, drumHeight: 9, domeRadius: 10.1 },
    chainMinaret: { x: 4, z: -50, height: 31 },
    alAqsaDome: { x: 120, z: 190, radius: 9 },
    fakhriyyaMinaret: { x: 6, z: 110, height: 24 },
  },

  // Enemy AI: the navmesh is baked inside these bounds.
  ai: {
    navBounds: { minX: -140, maxX: -0.3, minZ: -60, maxZ: 103 },
    // The mission spawns enemies (none during the calm shift); K adds test enemies.
    enemySpawns: [],
  },

  // The shift starts at the checkpoint, just inside (north of) the screening lanes.
  spawn: { x: -67.5, z: 78 },

  // The main menu's background: the plaza just after sunrise (the sun behind the wall, the
  // early prayer), slow camera drifts (core/MenuCamera.js): from / to the camera's path, look
  // / lookTo what it looks at, time seconds.
  menu: {
    time: '06:50',
    shots: [
      { from: [-58, 5, 22], to: [-44, 4.2, 12], look: [0, 13, -8], lookTo: [0, 11, -4], time: 18 },
      { from: [-7.5, 1.6, 34], to: [-8, 1.7, 21], look: [-2, 2.2, -18], lookTo: [-1.5, 2.4, -22], time: 16 },
      { from: [-98, 15, 44], to: [-84, 13, 30], look: [-18, 5, -6], lookTo: [-14, 5, -10], time: 18 },
      { from: [-14, 1.5, -2], to: [-11.5, 1.6, -11], look: [-1, 1.7, -12], lookTo: [-0.5, 1.9, -20], time: 15 },
    ],
  },

  environment: {
    // The night of the final Selichot before Yom Kippur (30 September 2025, Israel summer
    // time): the mission starts at 21:00, long after sunset; the moon is the key light. (The
    // main menu shows the plaza just after sunrise: `menu.time`.)
    sun: { lat: 31.7767, lon: 35.2345, date: '2025-09-30', time: '21:00', utcOffset: 3 },
    night: {
      sky: 'assets/hdri/night_sky.jpg', // the visible sky (stars), Poly Haven CC0
      hdri: 'assets/hdri/night_1k.hdr', // the image-based light
      // The moon a day past first quarter, that night at 21:00: south-west, ~27 degrees up.
      moon: { azimuth: 211, elevation: 27 },
      skyYaw: 184, // turns the photographed sky so its moon's halo sits under ours
      moonIntensity: 0.32,
      envIntensity: 0.4,
      hemiIntensity: 0.32,
      fogDensity: 0.0024,
      lights: 1, // the floodlights, lamps and screens (world/kotel/night.js)
    },
    hdri: ['assets/hdri/sky_2k.hdr', 'assets/hdri/sky_512.exr'], // sky_2k: npm run assets:fetch
    sunIntensity: 3.0,
    envIntensity: 0.5,
    bounce: 0.95, // warm fill from the sunlit plaza
    fogDensity: 0.0019,
  },
};

// Plain greybox colors by role (no textures in this step).
export const KOTEL_COLORS = {
  paving: 0xe4dac4,
  pavingUpper: 0xdcd1b9,
  stone: 0xd6c6a0,
  stoneLight: 0xe0d4b6,
  building: 0xcfbd97,
  buildingDark: 0xb9a680,
  fence: 0xc8b58f,
  mechitza: 0x7b5f44,
  mechitzaScreen: 0xa58a69,
  wood: 0x8b6743,
  woodLight: 0xa27d52,
  woodDark: 0x5e4029,
  roof: 0x6f6a63,
  plastic: 0xf1efe9,
  plasticGrey: 0x9ea3a8,
  tableTop: 0xe8e4da,
  books: 0x5b3f33,
  metal: 0x6d7074,
  metalDark: 0x2f3134,
  steel: 0x9aa0a6,
  lampGlass: 0xf2ecd2,
  concrete: 0xb9b5ad,
  basin: 0x8f9aa0,
  bark: 0x5b4636,
  foliage: 0x55703d,
  cypress: 0x3f5a34,
  dig: 0xb49f7a,
  canopy: 0xe8e6e0,
  gold: 0xd4a53a,
  tiles: 0x3f6f9a,
  leadDome: 0x7c8388,
  flagWhite: 0xf4f4f2,
  flagBlue: 0x1f4aa8,
  doorway: 0x1a1714,
};
