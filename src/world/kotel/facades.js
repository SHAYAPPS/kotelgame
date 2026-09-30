import { BoxGeometry, ExtrudeGeometry, InstancedMesh, Matrix4, MeshStandardMaterial, PlaneGeometry, Quaternion, Shape, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { KOTEL } from './config.js';
import { randRange } from './random.js';

// Windows, arched openings and shutters on the plaza-facing building fronts (visual only).
// Each opening is a stone surround standing a few cm proud of the wall, dark glass just
// in front of the wall face (it reflects the sky), and on some windows painted wooden
// shutters folded open. Everything is instanced: a handful of draw calls for all of it.

const _m = new Matrix4();
const _q = new Quaternion();
const _p = new Vector3();
const _s = new Vector3(1, 1, 1);
const UP = new Vector3(0, 1, 0);

/** Stone surround of a W x H rectangular window (local +Z out of the wall). */
function rectFrame(w, h) {
  const t = 0.14; // frame width
  const d = 0.06; // how far it stands out
  const parts = [
    new BoxGeometry(w + 2 * t, t * 1.3, d * 1.6).translate(0, h / 2 + t * 0.65, d * 0.8), // lintel
    new BoxGeometry(w + 2 * t + 0.1, t * 0.8, d * 3).translate(0, -h / 2 - t * 0.4, d * 1.5), // sill
    new BoxGeometry(t, h, d).translate(-w / 2 - t / 2, 0, d / 2),
    new BoxGeometry(t, h, d).translate(w / 2 + t / 2, 0, d / 2),
  ];
  return mergeGeometries(parts.map((g) => g.toNonIndexed()));
}

/** A round-headed opening: rectangle with a semicircular top. */
function archShape(w, h, inset = 0) {
  const r = w / 2 - inset;
  const s = new Shape();
  const y0 = -h / 2 + inset;
  const ys = h / 2 - w / 2; // springing line
  s.moveTo(-r, y0);
  s.lineTo(r, y0);
  s.lineTo(r, ys);
  s.absarc(0, ys, r, 0, Math.PI, false);
  s.lineTo(-r, y0);
  return s;
}

function archFrame(w, h) {
  const t = 0.16;
  const outer = archShape(w + 2 * t, h + t * 2);
  outer.holes.push(archShape(w, h + 0.001));
  const g = new ExtrudeGeometry(outer, { depth: 0.06, bevelEnabled: false, curveSegments: 10 }); // already non-indexed
  const sill = new BoxGeometry(w + 2 * t + 0.1, t * 0.8, 0.18).translate(0, -h / 2 - t * 0.6, 0.09).toNonIndexed();
  return mergeGeometries([g, sill]);
}

function archGlass(w, h) {
  return new ExtrudeGeometry(archShape(w, h), { depth: 0.005, bevelEnabled: false, curveSegments: 10 });
}

/**
 * @param {import('three').Group} root
 * @param {(key: string) => import('three').Material} m level materials by color role
 * @param {(x: number, z: number) => number} groundY
 * @param {() => number} rand
 */
export function buildFacades(root, m, groundY, rand) {
  const { buildings, tunnels, plaza } = KOTEL;
  // Plaza-facing fronts: a point on the face's left end, the direction along it, the
  // outward normal, its length, the ground height there and the building height.
  const fronts = [];
  for (const [x0, x1, z0, z1, h] of buildings.west) {
    const y = groundY(x1 + 1, (z0 + z1) / 2);
    fronts.push({ o: [x1, y, z1], along: [0, 0, -1], n: [1, 0, 0], len: z1 - z0, height: h, arches: true });
  }
  for (const [x0, x1, z0, z1, h] of buildings.north) {
    const y = groundY((x0 + x1) / 2, z1 + 1);
    fronts.push({ o: [x0, y, z1], along: [1, 0, 0], n: [0, 0, 1], len: x1 - x0, height: h + 1, start: 6.2 }); // above the arcade
  }
  fronts.push({ o: [tunnels.x[0], 0, tunnels.z[1]], along: [1, 0, 0], n: [0, 0, 1], len: tunnels.x[1] - tunnels.x[0], height: tunnels.height, start: 4.5, skipNear: [tunnels.doorX, 2.5] });
  fronts.push({ o: [tunnels.x[0], 0, tunnels.z[0]], along: [0, 0, 1], n: [-1, 0, 0], len: tunnels.z[1] - tunnels.z[0], height: tunnels.height, start: 4.5 });

  const rect = [];
  const arch = [];
  const shutters = [];
  for (const f of fronts) {
    const floorH = 3.4;
    const first = f.start ?? 1.1;
    const n = new Vector3(...f.n);
    const along = new Vector3(...f.along);
    const yaw = Math.atan2(n.x, n.z); // local +Z -> the face normal
    for (let y = first; y + 2.2 < f.height - 0.8; y += floorH) {
      const groundFloor = y < 2;
      const spacing = randRange(rand, 2.8, 3.6);
      for (let a = 1.6; a < f.len - 1.2; a += spacing) {
        if (rand() < 0.14) continue; // blank bays
        if (f.skipNear && Math.abs(f.o[0] + along.x * a - f.skipNear[0]) < f.skipNear[1]) continue;
        const useArch = (f.arches && groundFloor) || rand() < 0.18;
        const w = useArch ? randRange(rand, 1.0, 1.4) : randRange(rand, 0.9, 1.2);
        const h = useArch ? (groundFloor ? 2.4 : 1.9) : randRange(rand, 1.4, 1.7);
        const cy = y + h / 2 + (groundFloor ? 0 : 0.3);
        const px = f.o[0] + along.x * a + n.x * 0.005;
        const pz = f.o[2] + along.z * a + n.z * 0.005;
        const item = { x: px, y: f.o[1] + cy, z: pz, yaw, w, h };
        (useArch ? arch : rect).push(item);
        if (!useArch && !groundFloor && rand() < 0.45) shutters.push(item);
      }
    }
  }

  const stone = m('stoneLight');
  const glass = new MeshStandardMaterial({ color: 0x1b232b, roughness: 0.12, metalness: 0.2 });
  const wood = new MeshStandardMaterial({ color: 0x3f6b56, roughness: 0.75 }); // faded green shutters
  const meshes = [];
  const place = (geo, mat, list, scale = (it) => _s.set(it.w, it.h, 1), offsetZ = 0) => {
    if (!list.length) return;
    const mesh = new InstancedMesh(geo, mat, list.length);
    list.forEach((it, i) => {
      _q.setFromAxisAngle(UP, it.yaw);
      _p.set(it.x + Math.sin(it.yaw) * offsetZ, it.y, it.z + Math.cos(it.yaw) * offsetZ);
      _m.compose(_p, _q, scale(it));
      mesh.setMatrixAt(i, _m);
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.noCollision = true;
    mesh.computeBoundingSphere();
    meshes.push(mesh);
  };
  // Unit-sized geometries scaled per window.
  place(rectFrame(1, 1), stone, rect, (it) => _s.set(it.w, it.h, 1));
  place(new PlaneGeometry(1, 1).translate(0, 0, 0.004), glass, rect);
  place(archFrame(1, 1.6), stone, arch, (it) => _s.set(it.w, it.h / 1.6, 1));
  place(archGlass(1, 1.6), glass, arch, (it) => _s.set(it.w, it.h / 1.6, 1));
  // Shutters folded open on both sides of the window.
  const leaf = mergeGeometries([
    new BoxGeometry(0.5, 1, 0.04).translate(-0.78, 0, 0.1).toNonIndexed(),
    new BoxGeometry(0.5, 1, 0.04).translate(0.78, 0, 0.1).toNonIndexed(),
  ]);
  place(leaf, wood, shutters, (it) => _s.set(it.w, it.h, 1));
  for (const mesh of meshes) root.add(mesh);
  return { windows: rect.length + arch.length };
}
