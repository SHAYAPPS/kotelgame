import {
  BoxGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, randRange } from './random.js';

/**
 * A stone material whose textures are projected from world space onto each block's faces
 * (the wall face uses z/y), with a random offset per stone so no two blocks show the same
 * patch of texture. UVs in meters times 1/meters of the texture set.
 */
function wallMaterial(texSet) {
  const scale = { value: 0.5 };
  const m = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uWallScale = scale;
    shader.vertexShader =
      'uniform float uWallScale;\n' +
      shader.vertexShader.replace(
        '#include <fog_vertex>',
        `#include <fog_vertex>
        {
          vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vec3 io = (modelMatrix * instanceMatrix[3]).xyz;
          vec2 off = fract(sin(vec2(dot(io, vec3(12.9898, 78.233, 37.719)), dot(io, vec3(39.346, 11.135, 83.155)))) * 43758.5453);
          vec3 an = abs(normal);
          vec2 wuv = (an.x > 0.5 ? wp.zy : (an.y > 0.5 ? wp.zx : wp.xy)) * uWallScale + off;
          #ifdef USE_MAP
            vMapUv = wuv;
          #endif
          #ifdef USE_NORMALMAP
            vNormalMapUv = wuv;
          #endif
          #ifdef USE_ROUGHNESSMAP
            vRoughnessMapUv = wuv;
          #endif
          #ifdef USE_AOMAP
            vAoMapUv = wuv;
          #endif
        }`,
      );
  };
  m.customProgramCacheKey = () => 'kotel-wall-projected';
  m.userData.textureSet = texSet;
  m.userData.scale = scale;
  return m;
}

/** A small caper/hyssop leaf cluster (alpha cut-out), drawn on a canvas. */
function leafTexture() {
  if (typeof document === 'undefined') return null; // tests build the level without a DOM
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const rand = mulberry32(99);
  // Caper-like: a few arching stems from a root near the top, drooping under their own
  // weight, with small rounded leaves along them. Muted olive greens, darker inside.
  const stems = 9;
  for (let s = 0; s < stems; s++) {
    const a = -Math.PI * 0.9 + (s / (stems - 1)) * Math.PI * 0.8 + (rand() - 0.5) * 0.3; // fan out and down
    let x = 64, y = 40;
    let dx = Math.cos(a), dy = -Math.sin(a) * 0.6;
    const len = 30 + rand() * 30;
    for (let k = 0; k < len; k += 3) {
      dy += 0.05; // droop
      const n = Math.hypot(dx, dy);
      x += (dx / n) * 3;
      y += (dy / n) * 3;
      if (x < 6 || x > 122 || y < 6 || y > 122) break;
      const l = 18 + rand() * 16 + (k / len) * 8;
      g.fillStyle = `hsl(${78 + rand() * 22}, ${22 + rand() * 18}%, ${l}%)`;
      g.beginPath();
      g.ellipse(x + (rand() - 0.5) * 6, y + (rand() - 0.5) * 6, 3 + rand() * 4, 2.5 + rand() * 3, rand() * Math.PI, 0, Math.PI * 2);
      g.fill();
    }
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

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
 * @param {number} o.faceX       x of the wall face (faces are recessed behind it; bosses stand
 *   at most 2 cm proud)
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
  const blocks = []; // { y, h, z, len, depth, relief, margin, color, rough }
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
        // Textured: the stone's color comes from the texture; the instance color is a
        // near-white tint (so each block is a little lighter/darker/warmer than the next).
        const tint = new Color().setHSL(0.1 + (rand() - 0.5) * 0.03, 0.15 + rand() * 0.2, Math.min(1, 0.86 + (rand() - 0.5) * j * 1.2 + pale * 0.8));
        blocks.push({
          y: y + band.gap / 2,
          h: h - band.gap,
          z: start + band.gap / 2,
          len: end - start - band.gap,
          relief: rand() * band.relief,
          margin: band.margin ?? 0,
          color: _c.clone(),
          tint,
          rough: !!band.rough,
          band: bandIndex,
        });
        joints.push({ y: y + h, z: end });
      }
      z += drawn;
    }
    y += h;
  }

  const unit = new BoxGeometry(1, 1, 1);
  // Two stone qualities: dressed limestone (big lower courses) and rougher stone (upper).
  const smoothMat = wallMaterial('limestone');
  const roughMat = wallMaterial('limestone_rough');
  const materials = [smoothMat, roughMat];
  const smoothBlocks = blocks.filter((b) => !b.rough);
  const roughBlocks = blocks.filter((b) => b.rough);
  const tint = (b) => (o.textured === false ? b.color : b.tint);
  const depth = 0.6; // visible part of each block; the wall body behind is a separate box
  const makeFaces = (list, mat) => {
    const mesh = new InstancedMesh(unit, mat, Math.max(1, list.length));
    mesh.count = list.length;
    list.forEach((b, i) => {
      // Faces are recessed 0..relief into the wall, so nothing sits proud of faceX - 0.02.
      _p.set(o.faceX + depth / 2 + b.relief, b.y + b.h / 2, b.z + b.len / 2);
      _s.set(depth, b.h, b.len);
      _m.compose(_p, _q.identity(), _s);
      mesh.setMatrixAt(i, _m);
      mesh.setColorAt(i, tint(b));
    });
    return mesh;
  };
  const bosses = blocks.filter((b) => b.margin > 0);
  const bossMesh = new InstancedMesh(unit, smoothMat, Math.max(1, bosses.length));
  bossMesh.count = bosses.length;
  bosses.forEach((b, bi) => {
    // Herodian drafted margin: the face sits back, the raised boss stands proud.
    const m = b.margin;
    _p.set(o.faceX + b.relief - 0.02 + 0.025, b.y + b.h / 2, b.z + b.len / 2);
    _s.set(0.05, Math.max(0.05, b.h - 2 * m), Math.max(0.05, b.len - 2 * m));
    _m.compose(_p, _q.identity(), _s);
    bossMesh.setMatrixAt(bi, _m);
    bossMesh.setColorAt(bi, _c.copy(tint(b)).offsetHSL(0, 0, 0.03));
  });
  const meshes = [makeFaces(smoothBlocks, smoothMat), bossMesh];
  if (roughBlocks.length) meshes.push(makeFaces(roughBlocks, roughMat));

  // Plants (capers, hyssop) growing out of cracks and joints, mostly higher up: a few
  // crossed leaf cards each, cut out of a leaf texture.
  if (o.plants && o.plants.count > 0) {
    const leafTex = leafTexture();
    const leaf = new MeshStandardMaterial({ color: leafTex ? 0xffffff : o.plants.color, map: leafTex, alphaTest: 0.5, side: DoubleSide, roughness: 0.85 });
    const card = new PlaneGeometry(1, 1);
    const bush = mergeGeometries([0, 1, 2].map((k) => card.clone().rotateY((k * Math.PI) / 3).rotateZ((k - 1) * 0.35)));
    const high = joints.filter((j) => j.y > o.baseY + o.plants.minY && j.y < top - 0.5);
    const count = Math.min(o.plants.count, high.length);
    const plants = new InstancedMesh(bush, leaf, count);
    const up = new Vector3(0, 1, 0);
    let j = null;
    for (let i = 0; i < count; i++) {
      // Clumps: plants take hold where a joint has crumbled, so a few grow close together.
      if (!j || rand() < 0.45) j = high[Math.floor(rand() * high.length)];
      else j = { y: j.y + randRange(rand, -0.6, 0.6), z: j.z + randRange(rand, -1.2, 1.2) };
      const r = randRange(rand, 0.4, 1.15) * (j.y > o.baseY + 11 ? 1 : 0.75);
      _p.set(o.faceX - r * 0.3, j.y - r * 0.3, j.z); // hangs below its root
      _s.set(r, r * randRange(rand, 0.7, 1.1), r);
      _q.setFromAxisAngle(up, rand() * Math.PI);
      _m.compose(_p, _q, _s);
      plants.setMatrixAt(i, _m);
    }
    _q.identity();
    plants.castShadow = true;
    meshes.push(plants);
  }

  // Prayer notes: folded slips of paper pushed into the joints at hand height, thickest
  // in the middle of the prayer area.
  if (o.notes && o.notes.count > 0) {
    const paper = new MeshStandardMaterial({ color: 0xf3efe4, roughness: 0.95 });
    const slip = new BoxGeometry(0.012, 0.035, 0.06);
    const noteMesh = new InstancedMesh(slip, paper, o.notes.count);
    const reach = blocks.filter((b) => b.y < o.baseY + 2.3 && b.y + b.h > o.baseY + 0.7 && b.z > o.notes.z[0] && b.z < o.notes.z[1]);
    const shades = [0xf6f3ea, 0xefe9da, 0xf1ece0, 0xe6e9ee, 0xf2e6d8];
    let n = 0;
    for (let tries = 0; n < o.notes.count && tries < o.notes.count * 6 && reach.length; tries++) {
      const b = reach[Math.floor(rand() * reach.length)];
      // More notes near the middle of the wall's prayer section.
      const zc = (b.z - (o.notes.z[0] + o.notes.z[1]) / 2) / ((o.notes.z[1] - o.notes.z[0]) / 2);
      if (rand() < Math.abs(zc) * 0.7) continue;
      const vertical = rand() < 0.6;
      const y = vertical ? randRange(rand, Math.max(b.y, o.baseY + 0.8), Math.min(b.y + b.h, o.baseY + 2.1)) : b.y;
      const z = vertical ? b.z + (rand() < 0.5 ? 0 : b.len) : randRange(rand, b.z, b.z + b.len);
      if (y < o.baseY + 0.7 || y > o.baseY + 2.2) continue;
      _p.set(o.faceX - 0.004 - rand() * 0.012, y, z);
      _q.setFromAxisAngle(new Vector3(1, 0, 0), (vertical ? Math.PI / 2 : 0) + (rand() - 0.5) * 0.9);
      _s.set(1, randRange(rand, 0.7, 1.3), randRange(rand, 0.6, 1.2));
      _m.compose(_p, _q, _s);
      noteMesh.setMatrixAt(n, _m);
      noteMesh.setColorAt(n, _c.set(shades[Math.floor(rand() * shades.length)]));
      n++;
    }
    noteMesh.count = n;
    _q.identity();
    meshes.push(noteMesh);
  }

  for (const mesh of meshes) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.noCollision = true; // the level adds one simple collision box for the wall
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }
  return {
    meshes,
    stones: blocks.length,
    materials: materials.map((mat) => ({
      applyTextures: (library) =>
        library.load(mat.userData.textureSet).then((set) => {
          if (!set) return;
          mat.userData.scale.value = 1 / set.meters;
          return library.apply(mat, mat.userData.textureSet, { normalScale: mat === roughMat ? 1.3 : 1 });
        }),
    })),
  };
}
