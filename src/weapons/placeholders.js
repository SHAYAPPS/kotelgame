import {
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SRGBColorSpace,
  TorusGeometry,
} from 'three';

// Greybox stand-ins for the weapon models: shown until public/assets/weapons/ has loaded
// (and wherever it can't, e.g. without WebGL). Sight / tube geometry matches the poses in
// Viewmodel.js: the rifle's origin is its rear sight aperture, the launcher's its sight.

export const L_TUBE_X = 0.085;
export const L_TUBE_Y = -0.07;
export const L_FRONT_Z = -0.62;
export const MUZZLE_Z = -0.62;
const SIGHT_DROP = 0.022;
export const BORE_Y = -0.07 - SIGHT_DROP;
const MAG_Y = -0.13 - SIGHT_DROP;

export function flashTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const c = size / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0, 'rgba(255,250,225,1)');
  g.addColorStop(0.25, 'rgba(255,200,90,0.9)');
  g.addColorStop(0.6, 'rgba(255,120,30,0.25)');
  g.addColorStop(1, 'rgba(255,90,0,0)');
  ctx.fillStyle = g;
  // A few spikes plus a soft core read as a muzzle flash at a glance.
  ctx.beginPath();
  const spikes = 7;
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? c : c * 0.32;
    const a = (i / (spikes * 2)) * Math.PI * 2;
    ctx.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/** Placeholder rifle (greybox shapes) built around the rear sight at the origin, barrel toward -Z. */
export function buildRifle() {
  const rifle = new Group();
  // Low metalness: there is no environment map yet, so metallic surfaces would render black.
  const metal = new MeshStandardMaterial({ color: 0x45484d, roughness: 0.5, metalness: 0.25 });
  const polymer = new MeshStandardMaterial({ color: 0x3c3e41, roughness: 0.75, metalness: 0 });
  const tan = new MeshStandardMaterial({ color: 0x8a7a5c, roughness: 0.85, metalness: 0 });
  const glove = new MeshStandardMaterial({ color: 0x5e5c47, roughness: 0.95, metalness: 0 });

  const part = (geo, mat, x, y, z, rx = 0) => {
    const m = new Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.x = rx;
    rifle.add(m);
    return m;
  };
  const box = (w, h, d, mat, x, y, z, rx = 0) => part(new BoxGeometry(w, h, d), mat, x, y, z, rx);
  const cyl = (r, len, mat, x, y, z) => part(new CylinderGeometry(r, r, len, 12), mat, x, y, z, Math.PI / 2);

  // Sights sit well above the bore (like an M4 carry handle rear sight): everything
  // else hangs DROP below the sight line (y = 0).
  const D = -SIGHT_DROP;
  // Rear sight: peep ring on the sight line, protected by two thin ears.
  part(new TorusGeometry(0.0075, 0.0017, 8, 24), metal, 0, 0, 0);
  box(0.003, 0.012, 0.004, metal, 0, -0.013, 0);
  box(0.004, 0.028, 0.012, metal, -0.014, -0.012, 0);
  box(0.004, 0.028, 0.012, metal, 0.014, -0.012, 0);
  box(0.034, 0.03, 0.03, metal, 0, -0.037, 0);
  // Upper receiver + rail, lower receiver, magwell.
  box(0.05, 0.055, 0.27, metal, 0, -0.063 + D, 0.03);
  box(0.034, 0.008, 0.27, metal, 0, -0.033 + D, 0.03);
  box(0.046, 0.05, 0.13, polymer, 0, -0.112 + D, -0.02);
  // Handguard (tan) and barrel with flash hider.
  box(0.058, 0.058, 0.25, tan, 0, -0.068 + D, -0.225);
  cyl(0.009, 0.28, metal, 0, BORE_Y, -0.47);
  cyl(0.012, 0.05, metal, 0, BORE_Y, MUZZLE_Z + 0.025);
  // Front sight: A-frame base, two wings and a thin post whose tip sits on the sight line.
  box(0.024, 0.05, 0.02, metal, 0, -0.06, -0.38);
  box(0.004, 0.03, 0.01, metal, -0.011, -0.022, -0.38);
  box(0.004, 0.03, 0.01, metal, 0.011, -0.022, -0.38);
  box(0.003, 0.04, 0.003, metal, 0, -0.02, -0.38);
  // Pistol grip, stock.
  box(0.03, 0.1, 0.042, polymer, 0, -0.14 + D, 0.085, -0.35);
  box(0.044, 0.068, 0.2, polymer, 0, -0.08 + D, 0.28);
  box(0.048, 0.1, 0.02, polymer, 0, -0.095 + D, 0.385);

  // Magazine on its own pivot so the reload can pull it out.
  const mag = new Group();
  mag.position.set(0, MAG_Y, -0.03);
  const magBody = new Mesh(new BoxGeometry(0.028, 0.16, 0.07), polymer);
  magBody.position.set(0, -0.07, -0.005);
  magBody.rotation.x = 0.18;
  mag.add(magBody);
  rifle.add(mag);

  // Gloved hands: right on the grip, left under the handguard.
  box(0.05, 0.07, 0.09, glove, 0.012, -0.15 + D, 0.09, -0.35);
  box(0.06, 0.05, 0.11, glove, -0.012, -0.105 + D, -0.25);

  return { rifle, mag };
}

/** Placeholder rocket launcher around its sight at the origin, tube toward -Z. */
export function buildLauncher() {
  const g = new Group();
  const olive = new MeshStandardMaterial({ color: 0x4f5836, roughness: 0.8, metalness: 0 });
  const dark = new MeshStandardMaterial({ color: 0x2c2f2a, roughness: 0.6, metalness: 0.2 });
  const glove = new MeshStandardMaterial({ color: 0x5e5c47, roughness: 0.95, metalness: 0 });
  const warheadMat = new MeshStandardMaterial({ color: 0x6b6b4a, roughness: 0.5, metalness: 0.2 });
  const tube = new Mesh(new CylinderGeometry(0.048, 0.048, 0.9, 16), olive);
  tube.rotation.x = Math.PI / 2;
  tube.position.set(L_TUBE_X, L_TUBE_Y, -0.17);
  const rear = new Mesh(new CylinderGeometry(0.07, 0.05, 0.12, 16), dark);
  rear.rotation.x = Math.PI / 2;
  rear.position.set(L_TUBE_X, L_TUBE_Y, 0.3);
  const front = new Mesh(new CylinderGeometry(0.055, 0.055, 0.06, 16), dark);
  front.rotation.x = Math.PI / 2;
  front.position.set(L_TUBE_X, L_TUBE_Y, L_FRONT_Z + 0.03);
  // Optical sight: a short box with a dark lens around the view axis.
  const sight = new Mesh(new BoxGeometry(0.034, 0.034, 0.12), dark);
  sight.position.set(0, -0.004, 0.02);
  const mount = new Mesh(new BoxGeometry(0.06, 0.02, 0.05), dark);
  mount.position.set(0.04, -0.03, 0.02);
  // Grips and hands under the tube.
  const grip = new Mesh(new BoxGeometry(0.03, 0.09, 0.04), dark);
  grip.position.set(L_TUBE_X, L_TUBE_Y - 0.09, 0.06);
  grip.rotation.x = -0.25;
  const hand1 = new Mesh(new BoxGeometry(0.05, 0.07, 0.09), glove);
  hand1.position.set(L_TUBE_X + 0.005, L_TUBE_Y - 0.1, 0.07);
  const hand2 = new Mesh(new BoxGeometry(0.06, 0.05, 0.1), glove);
  hand2.position.set(L_TUBE_X - 0.02, L_TUBE_Y - 0.06, -0.3);
  // The loaded rocket's warhead poking out of the front.
  const warhead = new Group();
  const cone = new Mesh(new CylinderGeometry(0.0, 0.06, 0.2, 14), warheadMat);
  cone.rotation.x = -Math.PI / 2;
  cone.position.z = -0.16;
  const neck = new Mesh(new CylinderGeometry(0.06, 0.045, 0.08, 14), warheadMat);
  neck.rotation.x = Math.PI / 2;
  neck.position.z = -0.03;
  warhead.add(cone, neck);
  warhead.position.set(L_TUBE_X, L_TUBE_Y, L_FRONT_Z);
  g.add(tube, rear, front, sight, mount, grip, hand1, hand2, warhead);
  return { launcher: g, warhead };
}
