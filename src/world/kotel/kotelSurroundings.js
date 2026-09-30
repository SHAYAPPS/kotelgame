import { BoxGeometry, ConeGeometry, CylinderGeometry, Euler, Matrix4, Quaternion, SphereGeometry, Vector3 } from 'three';
import { KOTEL } from './config.js';
import { placement } from './instancing.js';
import {
  concreteBlock,
  lampPost,
  metalDetector,
  planterTree,
  policeBarrier,
  xrayScanner,
} from './props.js';

const HALF_PI = Math.PI / 2;
const _q = new Quaternion();
const _e = new Euler();
const _p = new Vector3();
const _s = new Vector3(1, 1, 1);

function matrixAt(x, y, z, pitch, yaw) {
  _q.setFromEuler(_e.set(pitch, yaw, 0, 'YXZ'));
  return new Matrix4().compose(_p.set(x, y, z), _q, _s);
}

/**
 * Everything around the prayer area: plaza edges and buildings, the stairs to the
 * Jewish Quarter, the southern entrance with the checkpoint, the fenced dig, the
 * Mughrabi Bridge, plaza props and the skyline beyond the wall.
 * @returns {import('./instancing.js').PropType[]} extra prop types to build
 */
export function buildSurroundings({ b, m, props, rand, groundY }) {
  const extra = {
    lamp: lampPost(m),
    barrier: policeBarrier(m),
    block: concreteBlock(m),
    detector: metalDetector(m),
    xray: xrayScanner(m),
    planter: planterTree(m),
  };
  buildTunnelsEntrance(b);
  buildPlazaEdges(b, groundY);
  buildStairs(b, extra);
  buildSouth(b, extra, props);
  buildDig(b, rand);
  buildBridge(b, extra, groundY);
  placePlazaProps(b, extra, groundY);
  buildBackdrop(b, rand);
  return Object.values(extra);
}

function buildTunnelsEntrance(b) {
  const t = KOTEL.tunnels;
  const [x0, x1] = t.x;
  const [z0, z1] = t.z;
  const d0 = t.doorX - t.doorWidth / 2;
  const d1 = t.doorX + t.doorWidth / 2;
  b.box(x0, d0, 0, t.height, z0, z1, 'building');
  b.box(d1, x1, 0, t.height, z0, z1, 'building');
  b.box(d0, d1, t.doorHeight, t.height, z0, z1, 'building');
  b.box(d0, d1, 0, t.doorHeight, z0, z1 - 1.2, 'building'); // back of the recess
  b.box(d0, d1, 0, t.doorHeight, z1 - 1.25, z1 - 1.2, 'doorway', { collide: false });
  // Closed gate: the tunnels are not part of this level yet.
  b.box(d0, d1, 0, t.doorHeight, z1 - 0.3, z1 - 0.25, 'metalDark');
  b.box(d0 - 0.3, d1 + 0.3, t.doorHeight, t.doorHeight + 0.4, z1 - 0.1, z1 + 0.05, 'stoneLight');
}

function buildPlazaEdges(b, groundY) {
  const { plaza, buildings } = KOTEL;
  for (const [x0, x1, z0, z1, h] of buildings.north) b.box(x0, x1, -0.6, groundY(x1, 0) + h, z0, z1, 'building');
  for (const [x0, x1, z0, z1, h] of buildings.west) b.box(x0, x1, -0.6, groundY(x1, 0) + h, z0, z1, 'building');

  // Arcade in front of the north buildings (covered walkway: piers make good cover).
  const az = buildings.arcadeZ;
  for (const [xa, xb] of [[-54, -32], [-77, -58.5]]) {
    const y0 = groundY((xa + xb) / 2, 0);
    for (let x = xa; x <= xb + 1e-6; x += (xb - xa) / Math.round((xb - xa) / 4.4)) {
      b.box(x - 0.45, x + 0.45, y0, y0 + 4.2, az, az + 0.9, 'buildingDark');
    }
    b.box(xa - 0.45, xb + 0.45, y0 + 4.2, y0 + 5.2, az, az + 3.2, 'buildingDark'); // roof
  }
  // Parapet along the top of the west terrace edge at the building feet.
  b.box(plaza.westX - 0.3, plaza.westX, groundY(plaza.westX + 1, 0), groundY(plaza.westX + 1, 0) + 0.8, plaza.northZ, KOTEL.stairs.z[0], 'fence');
  b.box(plaza.westX - 0.3, plaza.westX, groundY(plaza.westX + 1, 0), groundY(plaza.westX + 1, 0) + 0.8, KOTEL.stairs.z[1], plaza.southZ, 'fence');
}

function buildStairs(b, extra) {
  const s = KOTEL.stairs;
  const [z0, z1] = s.z;
  let x = KOTEL.plaza.westX;
  let y = KOTEL.plaza.terraces.reduce((sum, t) => sum + t.rise, 0);
  for (let f = 0; f < s.flights; f++) {
    for (let k = 1; k <= s.stepsPerFlight; k++) {
      b.box(x - s.run, x, -0.6, y + k * s.rise, z0, z1, 'pavingUpper');
      x -= s.run;
    }
    y += s.stepsPerFlight * s.rise;
    const len = f === s.flights - 1 ? 6 : s.landing;
    b.box(x - len, x, -0.6, y, z0, z1, 'pavingUpper');
    x -= len;
  }
  // Top of the stairs (Jewish Quarter): closed off for now.
  b.box(x - 0.4, x, y, y + 3.2, z0, z1, 'building');
  b.blocker(x + 0.2, x + 2.5, y, y + 6, z0, z1);
  for (let i = 0; i < 5; i++) extra.barrier.add(placement(x + 2, y, z0 + 1.3 + i * 2.3, 0));
}

function buildSouth(b, extra, props) {
  const { plaza, south, dig } = KOTEL;
  const [cx0, cx1] = south.corridorX;
  const [sz0, sz1] = south.z;
  const lvl = south.level;
  const h = 7;
  // South edge of the plaza (either side of the entrance corridor) and the corridor walls.
  b.box(plaza.westX, cx0, -0.6, h, plaza.southZ, plaza.southZ + 1, 'building');
  b.box(cx1, dig.x[0], -0.6, h, plaza.southZ, plaza.southZ + 1, 'building');
  b.box(dig.x[0], 0, -0.6, h, dig.z[1], dig.z[1] + 1.5, 'stone');
  b.box(cx0 - 1, cx0, -0.6, h, plaza.southZ, sz1, 'building');
  b.box(cx1, cx1 + 1, -0.6, h, plaza.southZ, sz1, 'building');
  b.box(cx0, cx1, -0.6, lvl, plaza.southZ, sz1, 'paving');
  // Toward Dung Gate: out of bounds for now.
  b.box(cx0, cx1, lvl, lvl + 3, sz1, sz1 + 0.6, 'metalDark');
  b.blocker(cx0, cx1, lvl, lvl + 8, sz1 - 1.5, sz1 + 0.6);

  // Security checkpoint pavilion: canopy on posts, screening lanes with metal
  // detectors and X-ray machines, a guard booth.
  const c = south.checkpoint;
  const x0 = c.x - c.width / 2;
  const x1 = c.x + c.width / 2;
  const z0 = c.z - c.depth / 2;
  const z1 = c.z + c.depth / 2;
  const top = lvl + c.canopyHeight;
  b.box(x0 - 0.5, x1 + 0.5, top, top + 0.35, z0 - 0.5, z1 + 0.5, 'canopy');
  for (const [px, pz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) b.box(px - 0.15, px + 0.15, lvl, top, pz - 0.15, pz + 0.15, 'steel');
  const lanes = 4;
  const laneW = (c.width - 3) / lanes; // leave room for the booth on the east side
  for (let i = 0; i <= lanes; i++) {
    const x = x0 + i * laneW;
    b.box(x - 0.1, x + 0.1, lvl, lvl + 1.1, z0 + 0.5, z1 - 0.5, 'plasticGrey');
    if (i < lanes) {
      const lx = x + laneW / 2;
      extra.detector.add(placement(lx, lvl, c.z - 1, 0));
      extra.xray.add(placement(x + 0.7, lvl, c.z + 2, 0));
    }
  }
  // Guard booth.
  b.box(x1 - 2.6, x1 - 0.4, lvl, lvl + 2.6, z0 + 1, z0 + 4, 'buildingDark');
  props.table.add(placement(x1 - 1.5, lvl, z0 - 1.2, 0));
  props.chair.add(placement(x1 - 1.5, lvl, z0 - 0.4, 0));
  // Concrete blocks and barriers channeling people from the lanes into the plaza.
  for (const [x, z, yaw] of [[cx0 + 1.5, 76, HALF_PI], [cx1 - 1.5, 76, HALF_PI], [cx0 + 3, 70, 0], [cx1 - 3, 70, 0]]) {
    extra.block.add(placement(x, lvl, z, yaw));
  }
  // Barrier funnels on both sides of the exit (the middle stays open).
  for (const side of [-1, 1]) {
    for (let i = 0; i < 2; i++) extra.barrier.add(placement(c.x + side * (5.2 + i * 1.6), lvl, 73.5 - i * 1.2, side * 0.6));
  }
}

function buildDig(b, rand) {
  const { dig, prayer } = KOTEL;
  const [x0, x1] = dig.x;
  const [z0, z1] = dig.z;
  const fh = dig.fenceHeight;
  // Fence around the archaeological area (out of bounds); the bridge passes over it.
  b.box(x0, -prayer.depth, 0, fh, z0 - 0.08, z0 + 0.08, 'metal');
  b.box(x0 - 0.08, x0 + 0.08, 0, fh, z0, z1, 'metal');
  // Ruins and mounds of the old earthen ramp.
  for (let i = 0; i < 22; i++) {
    const x = x0 + 2 + rand() * (x1 - x0 - 4);
    const z = z0 + 2 + rand() * (z1 - z0 - 4);
    const w = 1 + rand() * 4;
    const d = 1 + rand() * 4;
    b.box(x - w / 2, x + w / 2, -0.4, 0.2 + rand() * 1.4, z - d / 2, z + d / 2, 'dig', { collide: false });
  }
}

function buildBridge(b, extra, groundY) {
  const br = KOTEL.mughrabi;
  const sx = br.start.x;
  const sz = br.start.z;
  const sy = groundY(sx, sz);
  const landing = 3.2;
  // The ramp ends short of the wall; a flat landing leads to the gate.
  const ex = br.end.x - landing;
  const ez = br.end.z;
  const ey = br.gateY;
  const dx = ex - sx;
  const dz = ez - sz;
  const run = Math.hypot(dx, dz);
  const length = Math.hypot(run, ey - sy);
  const yaw = Math.atan2(dx, dz); // local +Z along the bridge
  const pitch = -Math.atan2(ey - sy, run);
  const w = br.width;
  const t = 0.3;
  const mid = new Vector3((sx + ex) / 2, (sy + ey) / 2, (sz + ez) / 2);
  const side = new Vector3(dz, 0, -dx).normalize(); // horizontal, perpendicular

  const piece = (offset, up, w0, h0, color, collide = true) => {
    const c = mid.clone().addScaledVector(side, offset).add(new Vector3(0, up, 0));
    b.add(new BoxGeometry(w0, h0, length), color, { matrix: matrixAt(c.x, c.y, c.z, pitch, yaw), collide });
  };
  piece(0, -t / 2, w, t, 'wood'); // deck (its top follows the ramp line)
  piece(w / 2 + 0.06, br.wallHeight / 2, 0.12, br.wallHeight, 'wood'); // side walls
  piece(-w / 2 - 0.06, br.wallHeight / 2, 0.12, br.wallHeight, 'wood');
  piece(0, br.roofHeight, w + 0.8, 0.12, 'roof', false); // roof
  piece(0, br.roofHeight + 0.35, 0.3, 0.3, 'roof', false); // ridge

  // Trestle posts down to the ground.
  const n = Math.floor(run / br.postSpacing);
  for (let i = 1; i < n; i++) {
    const f = i / n;
    const px = sx + dx * f;
    const pz = sz + dz * f;
    const deckY = sy + (ey - sy) * f - t;
    for (const o of [-w / 2, w / 2]) {
      const qx = px + side.x * o;
      const qz = pz + side.z * o;
      const gy = qx > KOTEL.dig.x[0] && qz > KOTEL.dig.z[0] ? -0.4 : groundY(qx, qz);
      if (deckY - gy > 0.4) b.box(qx - 0.12, qx + 0.12, gy, deckY, qz - 0.12, qz + 0.12, 'woodDark');
    }
  }

  // Landing at the Mughrabi Gate, blocked off (the Temple Mount is out of bounds).
  const lz0 = ez - w / 2 - 0.4;
  const lz1 = ez + w / 2 + 0.4;
  b.box(ex - 0.5, 0, ey - t, ey, lz0, lz1, 'wood');
  b.box(ex - 0.5, 0, ey, ey + br.wallHeight, lz0 - 0.12, lz0, 'wood');
  b.box(ex - 0.5, 0, ey, ey + br.wallHeight, lz1, lz1 + 0.12, 'wood');
  b.box(ex - 0.5, 0.2, ey + br.roofHeight, ey + br.roofHeight + 0.12, lz0 - 0.4, lz1 + 0.4, 'roof', { collide: false });
  b.box(-0.05, 0.1, ey, ey + 3.2, ez - 1.6, ez + 1.6, 'doorway', { collide: false }); // the gate
  b.blocker(-1.6, 0, ey, ey + 4, lz0, lz1);
  extra.barrier.add(placement(-1.9, ey, ez, HALF_PI));
}

function placePlazaProps(b, extra, groundY) {
  const { plaza, prayer } = KOTEL;
  // Rows of lamp posts across the plaza levels (not on the steps).
  for (const x of [-42, -67, -94]) {
    for (let z = plaza.northZ + 6; z < plaza.southZ - 3; z += 13) extra.lamp.add(placement(x, groundY(x, z), z, 0));
  }
  // Police barriers: queues at the two openings and a ring by the flagpole.
  for (const [o0, o1] of prayer.openings) {
    const x = -prayer.depth - 6.5;
    extra.barrier.add(placement(x, 0, o0 - 1.6, HALF_PI));
    extra.barrier.add(placement(x, 0, o1 + 1.6, HALF_PI));
  }
  const f = plaza.flagpole;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    extra.barrier.add(placement(f.x + Math.cos(a) * 3.2, 0, f.z + Math.sin(a) * 3.2, -a));
  }
  b.box(f.x - 0.4, f.x + 0.4, 0, 0.4, f.z - 0.4, f.z + 0.4, 'stoneLight');
  b.add(new CylinderGeometry(0.07, 0.1, f.height, 8).translate(f.x, f.height / 2, f.z), 'steel');
  // Flag: white field, two blue stripes (star omitted in greybox).
  const fy = f.height - 2.2;
  b.box(f.x - 0.02, f.x + 0.02, fy, fy + 2, f.z + 0.1, f.z + 3, 'flagWhite', { collide: false });
  for (const oy of [0.25, 1.55]) b.box(f.x - 0.03, f.x + 0.03, fy + oy, fy + oy + 0.22, f.z + 0.1, f.z + 3, 'flagBlue', { collide: false });

  // Planters with trees along the upper terrace.
  for (let z = plaza.northZ + 8; z < plaza.southZ - 5; z += 12) {
    if (z > KOTEL.stairs.z[0] - 3 && z < KOTEL.stairs.z[1] + 3) continue;
    extra.planter.add(placement(plaza.westX + 3, groundY(plaza.westX + 3, z), z, 0));
  }
}

function buildBackdrop(b, rand) {
  const k = KOTEL.backdrop;
  const deco = { collide: false };
  const tm = k.templeMountY;
  // Temple Mount esplanade behind the wall (out of bounds; seen from the bridge and terraces).
  b.box(KOTEL.wall.thickness, 380, tm - 1.5, tm, -160, 240, 'stoneLight', deco);

  // Dome of the Rock: raised platform, octagon, drum and the golden dome.
  const d = k.domeOfTheRock;
  b.box(d.x - 55, d.x + 55, tm, d.platformY, d.z - 55, d.z + 55, 'stoneLight', deco);
  b.add(new CylinderGeometry(d.octagonRadius, d.octagonRadius, d.octagonHeight, 8).translate(d.x, d.platformY + d.octagonHeight / 2, d.z), 'tiles', deco);
  const drumY = d.platformY + d.octagonHeight;
  b.add(new CylinderGeometry(d.drumRadius, d.drumRadius, d.drumHeight, 16).translate(d.x, drumY + d.drumHeight / 2, d.z), 'tiles', deco);
  b.add(new SphereGeometry(d.domeRadius + 0.6, 24, 12, 0, Math.PI * 2, 0, HALF_PI).scale(1, 1.25, 1).translate(d.x, drumY + d.drumHeight, d.z), 'gold', deco);

  // Minarets: square shafts with a lantern and a small cap.
  for (const mn of [k.chainMinaret, k.fakhriyyaMinaret]) {
    b.box(mn.x - 2, mn.x + 2, tm - 2, tm + mn.height * 0.7, mn.z - 2, mn.z + 2, 'stone', deco);
    b.add(new CylinderGeometry(1.6, 1.8, mn.height * 0.22, 8).translate(mn.x, tm + mn.height * 0.81, mn.z), 'stone', deco);
    b.add(new ConeGeometry(1.4, mn.height * 0.12, 8).translate(mn.x, tm + mn.height * 0.98, mn.z), 'leadDome', deco);
  }

  // Al-Aqsa: a long hall with its grey lead dome, far to the south-east.
  const q = k.alAqsaDome;
  b.box(q.x - 12, q.x + 12, tm, tm + 12, q.z - 40, q.z + 30, 'stone', deco);
  b.add(new SphereGeometry(q.radius, 16, 8, 0, Math.PI * 2, 0, HALF_PI).translate(q.x, tm + 12, q.z - 10), 'leadDome', deco);

  // Cypress and pine trees along the top of the wall (as seen above the south part).
  for (let i = 0; i < 26; i++) {
    const x = 8 + rand() * 30;
    const z = -30 + rand() * 110;
    const h = 7 + rand() * 7;
    b.add(new ConeGeometry(1.2 + rand(), h, 7).translate(x, tm + h / 2, z), 'cypress', deco);
  }

  // Old City skyline around the plaza: Jewish Quarter to the west, the Muslim Quarter north.
  for (let i = 0; i < 40; i++) {
    const west = i < 24;
    const x = west ? -150 - rand() * 90 : -120 + rand() * 110;
    const z = west ? -80 + rand() * 180 : -70 - rand() * 90;
    const w = 8 + rand() * 14;
    const dd = 8 + rand() * 14;
    const h = 12 + rand() * 18;
    b.box(x - w / 2, x + w / 2, 0, h, z - dd / 2, z + dd / 2, 'building', deco);
  }
}
