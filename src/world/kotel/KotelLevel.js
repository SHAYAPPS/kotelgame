import { ExtrudeGeometry, Group, Matrix4, Mesh, MeshStandardMaterial, PlaneGeometry, Shape, Vector3 } from 'three';
import { StaticBatch } from './batch.js';
import { KOTEL, KOTEL_COLORS } from './config.js';
import { placement } from './instancing.js';
import { bookshelf, lectern, plasticChair, table, torahArk, washStation } from './props.js';
import { mulberry32, randRange } from './random.js';
import { buildStoneWall } from './wallStones.js';
import { buildSurroundings } from './kotelSurroundings.js';
import { buildFacades } from './facades.js';
import { buildNight } from './night.js';
import { stoneMaterial } from '../stoneMaterial.js';

const HALF_PI = Math.PI / 2;
// Prop yaws: a seated/standing prop faces local -Z, its back is +Z.
export const FACE_EAST = -HALF_PI; // toward the wall
export const FACE_WEST = HALF_PI;
export const FACE_NORTH = 0;
export const FACE_SOUTH = Math.PI;

/**
 * Stone surfaces by color role: which texture set, how it tiles (scale per meter-UV), the
 * tint it's multiplied by (the textures carry the stone's own color) and relief strength.
 * Roles not listed stay plain colors (metal, wood, plastic, small props).
 */
export const SURFACES = {
  paving: { set: 'paving', tint: 0xffffff, normalScale: 0.8 },
  pavingUpper: { set: 'paving', tint: 0xf4ede0, offset: [0.37, 0.61], normalScale: 0.8 },
  stone: { set: 'limestone', tint: 0xf6efe0 },
  stoneLight: { set: 'limestone', tint: 0xfffbf2 },
  fence: { set: 'limestone', tint: 0xefe4cc, scale: 1.5 },
  building: { set: 'ashlar', tint: 0xf3e9d6 },
  buildingDark: { set: 'ashlar', tint: 0xd9c9a8, offset: [0.5, 0.25] },
  dig: { set: 'limestone_rough', tint: 0xc8b28c, scale: 0.6, normalScale: 1.4 },
  concrete: { set: 'limestone_rough', tint: 0xcbc7bf, scale: 2, normalScale: 0.5 },
};

const METALS = new Set(['gold', 'steel', 'metal', 'metalDark']);
// How each stone surface wears (world/stoneMaterial.js): paving polished underfoot, walls
// grimy at the foot.
const WEAR = { paving: 'floor', pavingUpper: 'floor', stone: 'floor', stoneLight: 'floor', fence: 'none', building: 'none', buildingDark: 'none', dig: 'none', concrete: 'floor' };

/** Greybox materials by color role (textured stone for SURFACES roles), cached. */
function createMaterials() {
  const cache = new Map();
  const get = (key) => {
    if (!cache.has(key)) {
      const color = KOTEL_COLORS[key];
      if (color === undefined) throw new Error(`Unknown Kotel color "${key}"`);
      const shiny = METALS.has(key);
      if (SURFACES[key]) {
        // Stone: a node material (parallax, detail, wear) once its textures arrive.
        const m = stoneMaterial({ color, roughness: 0.9 });
        m.userData.stone = { mode: 'uv', wear: WEAR[key] ?? 'none', depth: key.startsWith('paving') ? 0.012 : 0.02 };
        cache.set(key, m);
      } else cache.set(key, new MeshStandardMaterial({ color, roughness: shiny ? 0.45 : 0.9, metalness: shiny ? 0.6 : 0 }));
    }
    return cache.get(key);
  };
  get.cache = cache;
  return get;
}

/**
 * Floor height of the walkable plaza at (x, z): prayer floor and lower plaza at 0,
 * then the terraces stepping up to the west, and the southern entrance corridor.
 */
export function groundY(x, z) {
  const { terraces, stepRun } = KOTEL.plaza;
  const south = KOTEL.south;
  if (z > KOTEL.plaza.southZ && x >= south.corridorX[0] && x <= south.corridorX[1]) return south.level;
  let y = 0;
  for (const t of terraces) {
    const runLen = t.steps * stepRun;
    if (x > t.x) return y;
    if (x > t.x - runLen) {
      const k = Math.ceil((t.x - x) / stepRun);
      return y + (t.rise * Math.min(k, t.steps)) / t.steps;
    }
    y += t.rise;
  }
  return y;
}

/** The stair flights (src/world/stairs.js): the terrace step bands and the Yehuda HaLevi stairs. */
export function stairZones() {
  const { plaza } = KOTEL;
  const zones = plaza.terraces.map((t) => ({
    x0: t.x - t.steps * plaza.stepRun,
    x1: t.x,
    z0: plaza.northZ,
    z1: plaza.southZ,
    up: [-1, 0], // rising west
    rise: t.rise / t.steps,
    run: plaza.stepRun,
  }));
  const s = KOTEL.stairs;
  let x = plaza.westX;
  for (let f = 0; f < s.flights; f++) {
    zones.push({ x0: x - s.stepsPerFlight * s.run, x1: x, z0: s.z[0], z1: s.z[1], up: [-1, 0], rise: s.rise, run: s.run });
    x -= s.stepsPerFlight * s.run + (f === s.flights - 1 ? 6 : s.landing);
  }
  return zones;
}

function buildFloors(b) {
  const { plaza, wilsonsArch } = KOTEL;
  const [pz0, pz1] = KOTEL.wall.prayerZ;
  const depth = KOTEL.prayer.depth;
  const under = -0.6;
  // Prayer area, the floor under Wilson's Arch and the lower plaza.
  b.box(-depth, 0.2, under, 0, pz0, pz1, 'paving');
  b.box(-wilsonsArch.span - 2, 0.2, under, 0, wilsonsArch.z[0], wilsonsArch.z[1], 'paving');
  const digZ = KOTEL.dig.z[0];
  b.box(plaza.terraces[0].x, -depth, under, 0, plaza.northZ, digZ, 'paving');
  b.box(plaza.terraces[0].x, KOTEL.dig.x[0], under, 0, digZ, plaza.southZ, 'paving');
  // Dig area floor south of the prayer area (fenced off).
  b.box(KOTEL.dig.x[0], 0.2, under - 0.4, -0.4, KOTEL.dig.z[0], KOTEL.dig.z[1], 'dig');

  // Terraces: step bands then flat levels, rising west.
  let y = 0;
  plaza.terraces.forEach((t, i) => {
    for (let k = 1; k <= t.steps; k++) {
      const x1 = t.x - (k - 1) * plaza.stepRun;
      const x0 = t.x - k * plaza.stepRun;
      b.box(x0, x1, under, y + (t.rise * k) / t.steps, plaza.northZ, plaza.southZ, 'pavingUpper');
    }
    y += t.rise;
    const levelStart = t.x - t.steps * plaza.stepRun;
    const next = plaza.terraces[i + 1];
    const levelEnd = next ? next.x : plaza.westX;
    b.box(levelEnd, levelStart, under, y, plaza.northZ, plaza.southZ, 'pavingUpper');
  });
}

function buildWall(root, b) {
  const w = KOTEL.wall;
  const [pz0] = w.prayerZ;
  // One simple collision body for the whole wall (the stones are visual only). Its face
  // sits just in front of the raised bosses, so bullet marks are never hidden.
  const wz0 = KOTEL.wilsonsArch.z[0] - 18;
  const wz1 = w.southZ + 2;
  b.blocker(w.faceX - 0.025, w.faceX + w.thickness, -1, w.height, wz0, wz1);
  // The visible body sits behind the stones (seen only past the ends and from above).
  b.box(w.faceX + 0.3, w.faceX + w.thickness, -1, w.height, wz0, wz1, 'stone', { collide: false });

  const main = buildStoneWall({
    faceX: w.faceX,
    zStart: pz0,
    zEnd: w.southZ,
    baseY: 0,
    height: w.height,
    bands: w.bands,
    plants: w.plants,
    notes: w.notes,
    seed: w.seed,
  });
  // Inside the hall under Wilson's Arch the wall is visible up to the vault.
  const hall = buildStoneWall({
    faceX: w.faceX,
    zStart: KOTEL.wilsonsArch.z[0],
    zEnd: pz0,
    baseY: 0,
    height: KOTEL.wilsonsArch.crown,
    bands: [w.bands[0]],
    seed: w.seed + 1,
  });
  for (const mesh of [...main.meshes, ...hall.meshes]) root.add(mesh);
  return { stones: main.stones + hall.stones, wallMaterials: [...main.materials, ...hall.materials] };
}

function buildPrayerArea(b, props, rand) {
  const p = KOTEL.prayer;
  const [pz0, pz1] = KOTEL.wall.prayerZ;
  const fx = -p.depth;

  // Back fence: low stone wall with a railing on top, broken by the openings.
  const cuts = [...p.openings].sort((a, c) => a[0] - c[0]);
  let z = pz0;
  const segments = [];
  for (const [o0, o1] of cuts) {
    segments.push([z, o0]);
    z = o1;
  }
  segments.push([z, pz1]);
  for (const [z0, z1] of segments) {
    b.box(fx - 0.2, fx + 0.2, 0, p.fenceStoneHeight, z0, z1, 'fence');
    b.box(fx - 0.03, fx + 0.03, p.fenceStoneHeight, p.fenceHeight, z0, z1, 'metal');
    b.box(fx - 0.06, fx + 0.06, p.fenceHeight - 0.05, p.fenceHeight, z0, z1, 'metal');
    for (let pz = z0; pz <= z1 + 1e-6; pz += Math.max(1, (z1 - z0) / Math.ceil((z1 - z0) / 3))) {
      b.box(fx - 0.25, fx + 0.25, 0, p.fenceHeight + 0.1, pz - 0.25, pz + 0.25, 'fence');
    }
  }

  // Mechitza: solid wooden lower panels, screened upper part, posts every 2 m.
  const mz = p.mechitzaZ;
  b.box(fx, 0, 0, 1.1, mz - 0.06, mz + 0.06, 'mechitza');
  b.box(fx, 0, 1.1, p.mechitzaHeight, mz - 0.03, mz + 0.03, 'mechitzaScreen');
  for (let x = fx; x <= 0.01; x += 2) b.box(x - 0.07, x + 0.07, 0, p.mechitzaHeight + 0.08, mz - 0.08, mz + 0.08, 'mechitza');

  // Screen closing the women's section off from the dig to the south.
  b.box(fx, 0, 0, p.southScreenHeight, pz1, pz1 + 0.4, 'mechitzaScreen');

  // Hand-washing stations on the plaza side, beside each opening, running along Z.
  for (const [o0, o1] of p.openings) {
    props.wash.add(placement(fx - 3.2, 0, o0 - 2.5, HALF_PI));
    props.wash.add(placement(fx - 3.2, 0, o1 + 2.5, HALF_PI));
  }

  // Furniture. Keep ~1.5 m clear at the wall (people stand there) and an aisle from
  // each opening straight to the wall.
  const aisles = p.openings.map(([o0, o1]) => [o0 - 0.6, o1 + 0.6]);
  const inAisle = (zz) => aisles.some(([a0, a1]) => zz > a0 && zz < a1);
  const scatter = (z0, z1, clusters, lecterns) => {
    for (let i = 0; i < clusters; i++) {
      const cx = randRange(rand, -p.depth + 2.5, -2.2);
      const cz = randRange(rand, z0 + 1.2, z1 - 1.2);
      const n = 2 + Math.floor(rand() * 4);
      for (let k = 0; k < n; k++) {
        const x = cx + randRange(rand, -1.2, 1.2);
        const zz = Math.min(z1 - 0.5, Math.max(z0 + 0.5, cz + randRange(rand, -1.4, 1.4)));
        if (!inAisle(zz)) props.chair.add(placement(x, 0, zz, FACE_EAST + randRange(rand, -0.7, 0.7)));
      }
    }
    for (let i = 0; i < lecterns; i++) {
      const zz = randRange(rand, z0 + 1, z1 - 1);
      if (!inAisle(zz)) props.lectern.add(placement(randRange(rand, -p.depth + 2, -1.8), 0, zz, FACE_EAST + randRange(rand, -0.4, 0.4)));
    }
  };
  scatter(pz0, mz - 0.3, 26, 16); // men's section
  scatter(mz + 0.3, pz1 - 0.5, 7, 5); // women's section

  // Tables near the back fence; bookcases with their backs to the fence and the mechitza.
  for (const zz of [-24, -18, -4, 3, 10]) props.table.add(placement(fx + 3.5, 0, zz, FACE_EAST + randRange(rand, -0.2, 0.2)));
  props.table.add(placement(fx + 4, 0, 22.5, FACE_EAST));
  for (const zz of [-26.5, -21, -7.5, 0.5, 7, 13]) props.shelf.add(placement(fx + 0.6, 0, zz, FACE_EAST));
  for (const x of [-8, -14, -20]) props.shelf.add(placement(x, 0, mz - 0.45, FACE_NORTH));
  for (const zz of [19.5, 27]) props.shelf.add(placement(fx + 0.6, 0, zz, FACE_EAST));
}

function buildWilsonsArch(b, props) {
  const a = KOTEL.wilsonsArch;
  const [z0, z1] = a.z;
  const depth = z1 - z0;
  const spring = a.crown - a.span / 2;
  const top = 12;

  // Barrel vault: solid above the arch curve, extruded north along the hall.
  const shape = new Shape();
  shape.moveTo(0, spring);
  shape.lineTo(0, top);
  shape.lineTo(a.span, top);
  shape.lineTo(a.span, spring);
  const r = a.span / 2;
  for (let i = 1; i < 24; i++) {
    const t = (i / 24) * Math.PI;
    shape.lineTo(r + r * Math.cos(t), spring + r * Math.sin(t));
  }
  shape.closePath();
  const vault = new ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 });
  // Shape u (meters west of the wall) -> world -x: rotate 180 degrees about Y.
  const m = new Matrix4().makeRotationY(Math.PI).setPosition(0, 0, z1);
  b.add(vault, 'stone', { matrix: m });

  // West pier with springing, north wall of the hall, building mass above.
  b.box(-a.span - a.pierWidth, -a.span, 0, top, z0, z1, 'stone');
  b.box(-a.span, 0, 0, top, z0 - 2, z0, 'stone');
  b.box(-a.span - a.pierWidth, 0, top, a.buildingTop, z0 - 2, z1, 'building');
  b.box(-30, -a.span - a.pierWidth, 0, a.buildingTop - 3, z0 - 16, z0 - 2, 'building');
  b.box(-a.span, 0, 0, a.buildingTop, z0 - 16, z0 - 2, 'building');

  // Hall furniture: bookcases along the pier, an ark at the north end, rows of seats.
  for (let z = z0 + 1; z < z1 - 1; z += 1.35) props.shelf.add(placement(-a.span + 0.3, 0, z, FACE_EAST));
  props.ark.add(placement(-a.span / 2, 0, z0 + 0.35, FACE_SOUTH));
  for (let row = 0; row < 3; row++) {
    const x = -3 - row * 3;
    props.table.add(placement(x, 0, z0 + 5, FACE_EAST));
    props.table.add(placement(x, 0, z0 + 9, FACE_EAST));
    for (const dz of [-0.9, 0, 0.9]) {
      props.chair.add(placement(x - 0.8, 0, z0 + 5 + dz, FACE_EAST));
      props.chair.add(placement(x - 0.8, 0, z0 + 9 + dz, FACE_EAST));
    }
  }
}

/**
 * The greybox Western Wall plaza (Mission 1). See ./config.js for every dimension.
 * @returns {{ root: Group, collisionRoots: Group[], spawn: { position: Vector3, yaw: number },
 *   environment: object, stats: object }}
 */
export function createKotelLevel() {
  const m = createMaterials();
  const root = new Group();
  root.name = 'KotelPlaza';
  const collisionOnly = new Group();
  const b = new StaticBatch(m);
  const rand = mulberry32(KOTEL.wall.seed + 5);

  const props = {
    chair: plasticChair(m),
    lectern: lectern(m),
    table: table(m),
    shelf: bookshelf(m),
    wash: washStation(m),
    ark: torahArk(m),
  };

  buildFloors(b);
  const { stones, wallMaterials } = buildWall(root, b);
  buildPrayerArea(b, props, rand);
  buildWilsonsArch(b, props);
  const extraProps = buildSurroundings({ root, b, m, props, rand, groundY });
  const facades = buildFacades(root, m, groundY, mulberry32(KOTEL.wall.seed + 9));
  // The night: floodlights, lamps, screens (lights for world/NightLights.js, glowing fixtures).
  const night = buildNight(root, m, groundY);
  extraProps.push(...night.props);

  // A wide collision floor under everything (the batches are the visible floors).
  collisionOnly.add(new Mesh(new PlaneGeometry(400, 400).rotateX(-HALF_PI).translate(-60, -0.6, 20)));

  b.build(root);
  for (const p of [...Object.values(props), ...extraProps]) p.build(root, collisionOnly);

  // Where people can sit (the plastic chairs): position and the way the seat faces.
  const seats = props.chair.placements.map((mx) => {
    const e = mx.elements;
    return { x: e[12], y: e[13], z: e[14], yaw: Math.atan2(e[8], e[10]) };
  });

  const s = KOTEL.spawn;
  const spawnY = groundY(s.x, s.z);
  const yaw = Math.atan2(s.x, s.z); // look toward the prayer area's center (0, 0)
  return {
    root,
    collisionRoots: [root, collisionOnly, b.blockers],
    spawn: { position: new Vector3(s.x, spawnY, s.z), yaw },
    environment: KOTEL.environment,
    menu: KOTEL.menu, // the main menu's background (time of day, camera shots)
    seats,
    night: { lights: night.lights, glows: [...night.glows, ...(facades.glows ?? [])] },
    loudspeakers: night.speakers, // the PA for the midnight service: [x, y, z] each
    navBounds: KOTEL.ai.navBounds,
    stairZones: stairZones(),
    // Big flat surfaces that throw a gunshot back (WeaponAudio's slap-back echoes): the
    // Western Wall (x = 0) and the buildings' fronts along the plaza's north side.
    acoustics: {
      walls: [
        { n: [1, 0, 0], d: -KOTEL.wall.faceX, absorb: 0.62, reach: 240 },
        { n: [0, 0, 1], d: -KOTEL.plaza.northZ, absorb: 0.4, reach: 200 },
      ],
    },
    enemySpawns: KOTEL.ai.enemySpawns.map((e) => ({ position: new Vector3(e.x, groundY(e.x, e.z), e.z), yaw: e.yaw })),
    stats: { stones },
    /** Stream the stone textures in (the level shows plain colors until they arrive). */
    applyTextures(library, onProgress = null) {
      const jobs = [];
      for (const [key, mat] of m.cache) {
        const s = SURFACES[key];
        if (!s) continue;
        mat.color.set(s.tint);
        jobs.push(library.apply(mat, s.set, { scale: s.scale ?? 1, normalScale: s.normalScale ?? 1, offset: s.offset }));
      }
      for (const w of wallMaterials) jobs.push(w.applyTextures(library));
      let done = 0;
      return Promise.all(jobs.map((j) => Promise.resolve(j).finally(() => onProgress?.(++done, jobs.length))));
    },
  };
}
