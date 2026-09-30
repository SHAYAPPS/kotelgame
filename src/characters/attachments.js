import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Gear and head wear attached to bones (rigid pieces that follow the head or chest): the
// added vest, the enemies' headbands, kippot, hats and headscarves. Sized from the head
// measurements the converter stores per character (Head-bone frame: +Y up the head, +Z the
// face, +X the left ear): crown height, eye line and the forehead ring (manifest `head`).
// Face coverings are painted into the textures by the converter.

const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });

function colored(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  const c = new Color(hex);
  const n = g.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  return g;
}

function mesh(parts) {
  const m = new Mesh(mergeGeometries(parts), mat);
  m.castShadow = true;
  return m;
}

/** The skull ring (forehead height) and crown from the head measurements. */
function skull(head) {
  const ring = head.ring ?? { y: (head.min[1] + head.max[1]) / 2, cz: (head.min[2] + head.max[2]) / 2, rx: (head.max[0] - head.min[0]) / 2, rz: (head.max[2] - head.min[2]) / 2 };
  return { ...ring, top: head.topY ?? head.max[1], eye: head.eyeY ?? ring.y - 0.03 };
}

/** Green headband around the forehead. */
export function headband(head, color = 0x1f7a2e) {
  const s = skull(head);
  const t = new TorusGeometry(1, 0.012, 6, 28).rotateX(Math.PI / 2).scale(s.rx + 0.008, 1, s.rz + 0.008);
  return mesh([colored(t.translate(0, s.y + 0.004, s.cz), color)]);
}

/** Kippah: a small cloth disc on the back of the crown. */
export function kippah(head, color = 0x111114) {
  const s = skull(head);
  const r = 0.07;
  const cap = new SphereGeometry(r * 1.6, 16, 5, 0, Math.PI * 2, 0, 0.42).rotateX(-0.45).translate(0, s.top - r * 1.6 + 0.004, s.cz - s.rz * 0.35);
  return mesh([colored(cap, color)]);
}

/** Black brimmed hat. */
export function blackHat(head) {
  const s = skull(head);
  const r = Math.max(s.rx, s.rz);
  const y = s.y + 0.012;
  return mesh([
    colored(new CylinderGeometry(1, 1, 0.01, 24).scale(r + 0.075, 1, r + 0.08).translate(0, y, s.cz), 0x0c0c0e),
    colored(new CylinderGeometry(1, 1, s.top - y + 0.07, 18).scale(s.rx + 0.012, 1, s.rz + 0.012).translate(0, y + (s.top - y + 0.07) / 2, s.cz), 0x111113),
  ]);
}

/** Sun hat (tourists). */
export function sunHat(head, color = 0xe6d8ae) {
  const s = skull(head);
  const r = Math.max(s.rx, s.rz);
  const y = s.y + 0.018;
  return mesh([
    colored(new CylinderGeometry(1, 1, 0.008, 24).scale(r + 0.1, 1, r + 0.1).translate(0, y, s.cz), color),
    colored(new SphereGeometry(1, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(s.rx + 0.014, s.top - y + 0.03, s.rz + 0.014).translate(0, y, s.cz), color),
  ]);
}

/** Headscarf over the hair, tied at the nape. */
export function headscarf(head, color = 0x4a4f63) {
  const s = skull(head);
  const y = s.eye + 0.02;
  return mesh([
    colored(new SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.62).scale(s.rx + 0.03, s.top - y + 0.035, s.rz + 0.035).translate(0, y, s.cz - 0.012), color),
    colored(new SphereGeometry(0.05, 10, 6).scale(1.2, 0.9, 0.9).translate(0, y - 0.02, s.cz - s.rz - 0.05), color),
  ]);
}

/**
 * Plate carrier on the chest (Spine2-local box): front and back plates, straps over the
 * shoulders, magazine pouches.
 */
export function vest(chest, color = 0x5d5f3f) {
  const [x0, y0, z0] = chest.min;
  const [x1, y1, z1] = chest.max;
  const cx = (x0 + x1) / 2;
  const w = Math.min(0.34, (x1 - x0) * 0.62);
  const top = y1 - (y1 - y0) * 0.1;
  const h = Math.min(0.34, (y1 - y0) * 0.62);
  const cy = top - h / 2;
  const t = 0.022;
  const dark = 0x44472f;
  const front = z1 - 0.004;
  const back = z0 + 0.004;
  return mesh([
    colored(new BoxGeometry(w, h, t).translate(cx, cy, front + t / 2), color),
    colored(new BoxGeometry(w * 0.95, h * 0.95, t).translate(cx, cy, back - t / 2), color),
    ...[-1, 1].map((k) => colored(new BoxGeometry(0.05, 0.012, z1 - z0 + t * 2).translate(cx + k * w * 0.32, top + 0.004, (z0 + z1) / 2), dark)), // shoulder straps
    ...[-1, 0, 1].map((k) => colored(new BoxGeometry(w * 0.27, h * 0.36, 0.035).translate(cx + k * w * 0.31, cy - h * 0.26, front + t + 0.016), dark)), // mag pouches
  ]);
}
