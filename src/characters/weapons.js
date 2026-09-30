import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Rifles held by the characters: built from boxes, one merged vertex-colored mesh each.
// Local frame: the pistol grip (palm) at the origin, barrel along +Z, top +Y (the frame the
// converter derives from the source aiming pose, see manifest.anims.rifle).

function part(geo, hex, { x = 0, y = 0, z = 0, rx = 0 } = {}) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  if (rx) g.rotateX(rx);
  g.translate(x, y, z);
  const c = new Color(hex);
  const n = g.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  return g;
}

const box = (w, h, d, hex, at) => part(new BoxGeometry(w, h, d), hex, at);
const tube = (r, len, hex, at) => part(new CylinderGeometry(r, r, len, 8).rotateX(Math.PI / 2), hex, at);

function m4() {
  const black = 0x232426;
  const grey = 0x34363a;
  return {
    geo: mergeGeometries([
      box(0.05, 0.07, 0.25, grey, { y: 0.045, z: 0.045 }), // receiver
      box(0.032, 0.1, 0.04, black, { y: -0.025, z: -0.015, rx: 0.3 }), // pistol grip
      tube(0.016, 0.2, black, { y: 0.05, z: -0.18 }), // buffer tube
      box(0.045, 0.085, 0.12, black, { y: 0.03, z: -0.3 }), // stock
      box(0.058, 0.058, 0.22, black, { y: 0.05, z: 0.28 }), // handguard
      tube(0.011, 0.14, black, { y: 0.05, z: 0.45 }), // barrel
      box(0.022, 0.03, 0.03, black, { y: 0.03, z: 0.5 }), // front sight / gas block
      box(0.026, 0.16, 0.065, black, { y: -0.055, z: 0.085, rx: 0.12 }), // magazine
      box(0.032, 0.045, 0.09, black, { y: 0.1, z: 0.06 }), // optic
    ]),
    muzzle: 0.53,
    muzzleY: 0.05,
  };
}

function ak() {
  const metal = 0x2a2a2c;
  const wood = 0x6a3d1e;
  return {
    geo: mergeGeometries([
      box(0.05, 0.07, 0.26, metal, { y: 0.045, z: 0.07 }), // receiver
      box(0.032, 0.1, 0.04, wood, { y: -0.025, z: -0.015, rx: 0.3 }), // grip
      box(0.045, 0.075, 0.3, wood, { y: 0.02, z: -0.2, rx: -0.12 }), // wooden stock (dropped)
      box(0.052, 0.05, 0.17, wood, { y: 0.045, z: 0.28 }), // wooden handguard
      tube(0.012, 0.22, metal, { y: 0.045, z: 0.46 }), // barrel
      tube(0.009, 0.2, metal, { y: 0.075, z: 0.3 }), // gas tube
      box(0.028, 0.1, 0.055, metal, { y: -0.05, z: 0.1, rx: 0.25 }), // curved magazine: upper
      box(0.028, 0.1, 0.055, metal, { y: -0.13, z: 0.145, rx: 0.55 }), //   lower
    ]),
    muzzle: 0.57,
    muzzleY: 0.045,
  };
}

const cache = new Map();
let rifleMat = null;
let flashMat = null;

/**
 * @param {'m4'|'ak'} kind
 * @returns {{ root: Group, muzzle: Object3D, flash: Mesh }}
 */
export function createRifle(kind) {
  if (!cache.has(kind)) cache.set(kind, kind === 'ak' ? ak() : m4());
  const def = cache.get(kind);
  rifleMat ??= new MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.12 });
  if (!flashMat) {
    flashMat = new MeshBasicMaterial({ color: 0xffc87a, transparent: true, opacity: 0.95, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false });
    flashMat.color.multiplyScalar(5); // HDR: blooms
    flashMat.userData.noCSM = true;
  }
  const root = new Group();
  const mesh = new Mesh(def.geo, rifleMat);
  mesh.castShadow = true;
  root.add(mesh);
  const muzzle = new Object3D();
  muzzle.position.set(0, def.muzzleY, def.muzzle);
  root.add(muzzle);
  const flash = new Mesh(flashGeo(), flashMat);
  flash.userData.noCSM = true;
  flash.visible = false;
  muzzle.add(flash);
  return { root, mesh, muzzle, flash };
}

let _flashGeo = null;
function flashGeo() {
  if (_flashGeo) return _flashGeo;
  // Two crossed quads along the barrel + one facing forward: reads from any side.
  const a = new PlaneGeometry(0.12, 0.34).rotateX(Math.PI / 2).translate(0, 0, 0.14);
  const b = a.clone().rotateZ(Math.PI / 2);
  const c = new PlaneGeometry(0.2, 0.2);
  return (_flashGeo = mergeGeometries([a, b, c]));
}
