import { Group, Mesh, PlaneGeometry, Vector3 } from 'three';
import { PALETTE, boxGeometry, greyboxMesh, rampGeometry } from './greybox.js';

const DEG = Math.PI / 180;

/**
 * Movement test range: a large flat ground with color-coded obstacles for every
 * movement mechanic (see PALETTE). Meshes double as colliders unless marked
 * `userData.noCollision`.
 *
 * @param {(color: number) => import('three').Material} material
 * @returns {{ root: Group, collisionRoots: Group[], spawn: { position: Vector3, yaw: number } }}
 */
export function createTestRange(material) {
  const root = new Group();
  root.name = 'TestRange';

  const box = (x, bottom, z, w, h, d, color, rotY = 0) => {
    const mesh = greyboxMesh(boxGeometry(w, h, d), material(color), x, bottom, z, rotY);
    root.add(mesh);
    return mesh;
  };

  // Ground: a huge visual plane for a clean horizon; collision uses a smaller copy.
  const groundSize = 1200;
  const groundGeo = new PlaneGeometry(groundSize, groundSize).rotateX(-Math.PI / 2);
  const uv = groundGeo.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * groundSize, uv.getY(i) * groundSize);
  const ground = new Mesh(groundGeo, material(PALETTE.ground));
  ground.receiveShadow = true;
  ground.userData.noCollision = true;
  root.add(ground);

  const collisionOnly = new Group();
  collisionOnly.add(new Mesh(new PlaneGeometry(120, 120).rotateX(-Math.PI / 2)));

  // A. Step / jump row, straight ahead of the spawn.
  box(-7, 0, -2, 2, 0.2, 2, PALETTE.step);
  box(-3.5, 0, -2, 2, 0.33, 2, PALETTE.step);
  box(0, 0, -2, 2, 0.6, 2, PALETTE.jump);
  box(3.5, 0, -2, 2, 0.9, 2, PALETTE.jump);
  box(7, 0, -2, 2, 1.3, 2, PALETTE.high);

  // B. Stairs (8 x 18 cm) up to a platform, with a 1.44 m drop off the far side.
  const rise = 0.18;
  const run = 0.32;
  for (let i = 0; i < 8; i++) box(-15, 0, 1 - run * (i + 0.5), 3, rise * (i + 1), run, PALETTE.stone);
  box(-15, 0, 1 - run * 8 - 2, 3, rise * 8, 4, PALETTE.stone);

  // C. Walkable 20 degree ramp to a 2 m platform, and a 55 degree slope that is too steep.
  const rampLen = 2 / Math.tan(20 * DEG);
  root.add(greyboxMesh(rampGeometry(3, 2, rampLen), material(PALETTE.ramp), 15, 0, 1));
  box(15, 0, 1 - rampLen - 2, 3, 2, 4, PALETTE.ramp);
  root.add(greyboxMesh(rampGeometry(2, 2.5, 2.5 / Math.tan(55 * DEG)), material(PALETTE.steep), 19.5, 0, 1));

  // D. Crouch tunnel: 1.3 m clearance, 3 m wide, 4 m long.
  box(-1.7, 0, -12, 0.4, 1.3, 4, PALETTE.crouch);
  box(1.7, 0, -12, 0.4, 1.3, 4, PALETTE.crouch);
  box(0, 1.3, -12, 3.8, 0.3, 4, PALETTE.crouch);

  // E. Crate pyramid: 0.8 m levels to climb by jumping.
  const crate = (x, level) => box(x, level * 0.8, -12, 1, 0.8, 1, PALETTE.crate);
  crate(7, 0);
  crate(8, 0);
  crate(9, 0);
  crate(8, 1);
  crate(9, 1);
  crate(9, 2);

  // F. Walls to slide along and pillars to weave through.
  box(0, 0, -22, 28, 3, 0.5, PALETTE.stone);
  box(-12, 0, -14, 8, 3, 0.5, PALETTE.stone, 35 * DEG);
  for (const [x, z] of [[-6, -7], [-9, -10], [5, -7], [11, -6], [-4, -17], [4, -18]]) {
    box(x, 0, z, 0.6, 3, 0.6, PALETTE.concrete);
  }

  // G. Boundary walls.
  const edge = 50;
  box(0, 0, -edge, edge * 2 + 1, 3, 1, PALETTE.boundary);
  box(0, 0, edge, edge * 2 + 1, 3, 1, PALETTE.boundary);
  box(-edge, 0, 0, 1, 3, edge * 2 + 1, PALETTE.boundary);
  box(edge, 0, 0, 1, 3, edge * 2 + 1, PALETTE.boundary);

  // H. Distant towers for a sense of scale (outside the play area, no collision).
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.4;
    const tower = box(Math.sin(a) * 115, 0, -Math.cos(a) * 115, 6, 16 + ((i * 7) % 5) * 5, 6, PALETTE.stone);
    tower.userData.noCollision = true;
  }

  return {
    root,
    collisionRoots: [root, collisionOnly],
    spawn: { position: new Vector3(0, 0, 8), yaw: 0 },
  };
}
