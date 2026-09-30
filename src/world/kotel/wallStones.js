import {
  BoxGeometry,
  Color,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { mulberry32, randRange } from './random.js';

const _m = new Matrix4();
const _q = new Quaternion();
const _p = new Vector3();
const _s = new Vector3();
const _c = new Color();
const _hsl = { h: 0, s: 0, l: 0 };

/**
 * Procedural ashlar wall facing -X: courses of stone blocks laid bottom-up in bands
 * (e.g. huge Herodian stones at the bottom, smaller stones toward the top).
 *
 * @param {object} o
 * @param {number} o.faceX       x of the wall face (stones protrude slightly toward -X)
 * @param {number} o.zStart      one end of the wall along Z
 * @param {number} o.zEnd        other end
 * @param {number} o.baseY       floor height at the foot of the wall
 * @param {number} o.height      total height
 * @param {Array<object>} o.bands bottom to top: { top, course: [min, max], length: [min, max],
 *   gap, relief, margin?, color, colorJitter }
 * @param {{ count: number, color: number, minY: number }} [o.plants]
 * @param {number} [o.seed]
 * @returns {{ meshes: InstancedMesh[], stones: number }}
 */
export function buildStoneWall(o) {
  const rand = mulberry32(o.seed ?? 7);
  const length = Math.abs(o.zEnd - o.zStart);
  const z0 = Math.min(o.zStart, o.zEnd);
  const blocks = []; // { y, h, z, len, depth, relief, margin, color }
  const joints = []; // candidate spots for plants: { y, z }

  let y = o.baseY;
  const top = o.baseY + o.height;
  let bandIndex = 0;
  while (y < top - 0.05) {
    while (bandIndex < o.bands.length - 1 && y >= o.baseY + o.bands[bandIndex].top - 0.05) bandIndex++;
    const band = o.bands[bandIndex];
    let h = randRange(rand, band.course[0], band.course[1]);
    h = Math.min(h, top - y);
    // Stagger the joints course to course with a random starting offset.
    let z = z0 - randRange(rand, 0, band.length[1] * 0.6);
    while (z < z0 + length) {
      const drawn = randRange(rand, band.length[0], band.length[1]);
      const start = Math.max(z, z0);
      const end = Math.min(z + drawn, z0 + length);
      if (end - start > band.gap * 2) {
        const color = new Color(band.color);
        color.getHSL(_hsl);
        const j = band.colorJitter;
        // Mostly lightness variation, a little hue; a few very pale, worn stones.
        const pale = rand() < 0.08 ? 0.12 : 0;
        _c.setHSL(_hsl.h + (rand() - 0.5) * 0.02, _hsl.s * (1 + (rand() - 0.5) * j), Math.min(0.92, _hsl.l + (rand() - 0.5) * j + pale));
        blocks.push({
          y: y + band.gap / 2,
          h: h - band.gap,
          z: start + band.gap / 2,
          len: end - start - band.gap,
          relief: rand() * band.relief,
          margin: band.margin ?? 0,
          color: _c.clone(),
        });
        joints.push({ y: y + h, z: end });
      }
      z += drawn;
    }
    y += h;
  }

  const unit = new BoxGeometry(1, 1, 1);
  const material = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0 });
  const faces = new InstancedMesh(unit, material, blocks.length);
  const bosses = blocks.filter((b) => b.margin > 0);
  const bossMesh = new InstancedMesh(unit, material, Math.max(1, bosses.length));
  bossMesh.count = bosses.length;

  const depth = 0.6; // visible part of each block; the wall body behind is a separate box
  let bi = 0;
  blocks.forEach((b, i) => {
    _p.set(o.faceX + depth / 2 - b.relief, b.y + b.h / 2, b.z + b.len / 2);
    _s.set(depth, b.h, b.len);
    _m.compose(_p, _q.identity(), _s);
    faces.setMatrixAt(i, _m);
    faces.setColorAt(i, b.color);
    if (b.margin > 0) {
      // Herodian drafted margin: the face sits back, the raised boss stands proud.
      const m = b.margin;
      _p.set(o.faceX - b.relief - 0.02, b.y + b.h / 2, b.z + b.len / 2);
      _s.set(0.05, Math.max(0.05, b.h - 2 * m), Math.max(0.05, b.len - 2 * m));
      _m.compose(_p, _q, _s);
      bossMesh.setMatrixAt(bi, _m);
      bossMesh.setColorAt(bi, _c.copy(b.color).offsetHSL(0, 0, 0.03));
      bi++;
    }
  });
  const meshes = [faces, bossMesh];

  // Plants (capers, hyssop) growing out of the joints, mostly higher up.
  if (o.plants && o.plants.count > 0) {
    const leaf = new MeshStandardMaterial({ color: o.plants.color, roughness: 1, flatShading: true });
    const high = joints.filter((j) => j.y > o.baseY + o.plants.minY && j.y < top - 0.5);
    const count = Math.min(o.plants.count, high.length);
    const plants = new InstancedMesh(new IcosahedronGeometry(0.5, 0), leaf, count);
    for (let i = 0; i < count; i++) {
      const j = high[Math.floor(rand() * high.length)];
      const r = randRange(rand, 0.18, 0.55);
      _p.set(o.faceX - r * 0.5, j.y - r * 0.2, j.z);
      _s.set(r * 0.8, r * randRange(rand, 0.8, 1.6), r * randRange(rand, 1, 1.8));
      _q.setFromAxisAngle(_p.clone().set(0, 1, 0), rand() * Math.PI);
      _m.compose(_p, _q, _s);
      plants.setMatrixAt(i, _m);
    }
    _q.identity();
    meshes.push(plants);
  }

  for (const mesh of meshes) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.noCollision = true; // the level adds one simple collision box for the wall
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }
  return { meshes, stones: blocks.length };
}
