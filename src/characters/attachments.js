import {
  BoxGeometry,
  BufferGeometry,
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

// Where a kippah sits: this far back from the top of the head (radians on the skull ellipsoid).
export const KIPPAH_TILT = 0.5;
export const KIPPAH_AXIS = { x: 0, y: Math.cos(KIPPAH_TILT), z: -Math.sin(KIPPAH_TILT) };
export const HEAD_TOP = { x: 0, y: 1, z: 0 };

/** Green headband around the forehead. */
export function headband(head, color = 0x1f7a2e) {
  const s = skull(head);
  const t = new TorusGeometry(1, 0.012, 6, 28).rotateX(Math.PI / 2).scale(s.rx + 0.008, 1, s.rz + 0.008);
  return mesh([colored(t.translate(0, s.y + 0.004, s.cz), color)]);
}

const KIPPAH = {
  velvet: { arc: 0.08, color: 0x0e0e10 }, // black velvet: the largest
  white: { arc: 0.07, color: 0xf2f2ee }, // white satin (visitors)
  knit: { arc: 0.062, color: 0xf2f2f0 }, // crocheted, with a patterned band
};

/**
 * Kippah on the back of the crown: a cap laid onto the skull ellipsoid (scaled by `hair`, how
 * far the hair stands off the skull there: CharacterType.hairScale), so it follows the head.
 * @param {{ style?: 'velvet'|'white'|'knit', knit?: { base: number, pattern: number[], rim: number }, rim?: number|null, hair?: number }} opts
 */
export function kippah(head, { style = 'velvet', knit = null, rim = null, hair = 1 } = {}) {
  const s = skull(head);
  const k = KIPPAH[style] ?? KIPPAH.velvet;
  const ry = Math.max(0.04, s.top - s.y);
  // Unit-sphere cap around +Y (the angle from the arc on the head), colored per triangle.
  const theta = k.arc / (((ry + s.rz) / 2) * hair);
  const geo = new SphereGeometry(1, 28, 7, 0, Math.PI * 2, 0, theta).toNonIndexed();
  geo.deleteAttribute('uv');
  geo.deleteAttribute('normal');
  const pos = geo.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  const c = new Color();
  const base = knit ? knit.base : k.color;
  for (let t = 0; t < pos.count; t += 3) {
    let cy = 0;
    let ang = 0;
    for (let v = 0; v < 3; v++) {
      cy += pos.getY(t + v) / 3;
      ang += Math.atan2(pos.getX(t + v), pos.getZ(t + v)) / 3;
    }
    const ringT = Math.acos(Math.min(1, cy)) / theta; // 0 center .. 1 rim
    let hex = base;
    if (knit) {
      if (ringT > 0.86) hex = knit.rim;
      else if (ringT > 0.55 && ringT < 0.76) {
        const seg = Math.floor((ang / (Math.PI * 2) + 1) * 28) % 28;
        hex = seg % 2 ? knit.pattern[Math.floor(seg / 2) % knit.pattern.length] : base;
      }
    } else if (rim && ringT > 0.86) hex = rim;
    c.setHex(hex);
    for (let v = 0; v < 3; v++) col.set([c.r, c.g, c.b], (t + v) * 3);
  }
  geo.setAttribute('color', new Float32BufferAttribute(col, 3));
  // Tilt back to the kippah's spot, then onto the (hair-scaled) skull ellipsoid, 3 mm up.
  geo.rotateX(-KIPPAH_TILT);
  const lift = 1 + 0.002 / ry;
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(i, pos.getX(i) * s.rx * hair * lift, s.y + pos.getY(i) * ry * hair * lift, s.cz + pos.getZ(i) * s.rz * hair * lift);
  }
  geo.computeVertexNormals();
  return mesh([geo]);
}

/** Black brimmed hat (haredi): the crown clears the hair (`hair`: CharacterType.hairScale up top). */
export function blackHat(head, { hair = 1 } = {}) {
  const s = skull(head);
  const k = Math.min(hair, 1.25);
  const rx = s.rx * k + 0.014;
  const rz = s.rz * k + 0.014;
  const y = s.y + 0.012;
  const hairTop = s.y + (s.top - s.y) * hair;
  const crownH = Math.max(0.105, hairTop - y + 0.012);
  const brim = Math.max(rx, rz) + 0.058;
  return mesh([
    colored(new CylinderGeometry(1, 1, 0.009, 28).scale(brim, 1, brim + 0.006).translate(0, y, s.cz), 0x0c0c0e),
    colored(new CylinderGeometry(0.9, 1, crownH, 20).scale(rx, 1, rz).translate(0, y + crownH / 2, s.cz), 0x111113),
    colored(new TorusGeometry(1, 0.007, 4, 28).rotateX(Math.PI / 2).scale(rx + 0.001, 1, rz + 0.001).translate(0, y + 0.018, s.cz), 0x050506), // band
  ]);
}

/**
 * Headscarf (tichel): cloth laid close over the hair (a bun makes a bump), from the hairline
 * in front, over the tops of the ears, down to the nape; tied at the back. `shell(dir)` = how
 * far the hair and scalp stand off the skull ellipsoid toward a direction (unit, ellipsoid
 * space; CharacterType.hairScale).
 */
export function headscarf(head, color = 0x4a4f63, { shell = () => 1.1 } = {}) {
  const s = skull(head);
  const ry = Math.max(0.04, s.top - s.y);
  const W = 32; // around
  const G = 22; // grid rows from the crown down (for the shell)
  const maxTheta = Math.PI * 0.9;
  const thick = 0.009 / ry;
  // The shell on a (around, down) grid, smoothed a little.
  const K = new Float32Array((W + 1) * (G + 1));
  const d = { x: 0, y: 0, z: 0 };
  const dirOf = (psi, theta) => {
    d.x = Math.sin(theta) * Math.sin(psi);
    d.y = Math.cos(theta);
    d.z = Math.sin(theta) * Math.cos(psi);
    return d;
  };
  // Cloth volume: the gathered hair under it, fuller at the back of the crown.
  for (let g = 0; g <= G; g++) {
    for (let w = 0; w < W; w++) {
      const u = dirOf((w / W) * Math.PI * 2, (g / G) * maxTheta);
      const back = Math.max(0, -u.z) * Math.max(0, u.y + 0.35);
      K[g * (W + 1) + w] = shell(u) + thick + 0.1 * back;
    }
  }
  for (let pass = 0; pass < 2; pass++) {
    const src = K.slice();
    for (let g = 0; g <= G; g++) {
      for (let w = 0; w < W; w++) {
        let sum = 0;
        let n = 0;
        for (let og = -1; og <= 1; og++) {
          const gg = g + og;
          if (gg < 0 || gg > G) continue;
          for (let ow = -1; ow <= 1; ow++) {
            sum += src[gg * (W + 1) + ((w + ow + W) % W)];
            n++;
          }
        }
        K[g * (W + 1) + w] = Math.max(src[g * (W + 1) + w] * 0.9, sum / n);
      }
    }
  }
  const kAt = (w, theta) => {
    const gf = Math.min(G, Math.max(0, (theta / maxTheta) * G));
    const g0 = Math.floor(gf);
    const g1 = Math.min(G, g0 + 1);
    const f = gf - g0;
    const ww = ((w % W) + W) % W;
    return K[g0 * (W + 1) + ww] * (1 - f) + K[g1 * (W + 1) + ww] * f;
  };
  const point = (w, theta, out) => {
    const psi = (w / W) * Math.PI * 2;
    const k = kAt(w, theta);
    const u = dirOf(psi, theta);
    out[0] = u.x * s.rx * k;
    out[1] = s.y + u.y * ry * k;
    out[2] = s.cz + u.z * s.rz * k;
    return out;
  };
  // The lower edge: the hairline in front, over the ears, the nape at the back.
  const frontY = s.eye + 0.042;
  const sideY = s.eye - 0.03; // over the tops of the ears
  const backY = s.y - 0.09;
  const edgeY = (psi) => {
    const c = Math.cos(psi); // 1 front, 0 sides, -1 back
    return c >= 0 ? sideY + (frontY - sideY) * Math.pow(c, 1.6) : sideY + (backY - sideY) * -c;
  };
  const p = [0, 0, 0];
  const edge = new Float32Array(W + 1);
  for (let w = 0; w <= W; w++) {
    const target = edgeY((w / W) * Math.PI * 2);
    let theta = 0;
    for (let k = 1; k <= 60; k++) {
      const t = (k / 60) * maxTheta;
      if (point(w, t, p)[1] < target) break;
      theta = t;
    }
    edge[w] = theta;
  }
  // Mesh: rows from the crown (t = 0) to the edge (t = 1) at every angle around.
  const R = 12;
  const position = [];
  for (let r = 0; r <= R; r++) {
    for (let w = 0; w <= W; w++) {
      point(w, (r / R) * edge[w], p);
      position.push(p[0], p[1], p[2]);
    }
  }
  const index = [];
  const row = W + 1;
  for (let r = 0; r < R; r++) {
    for (let w = 0; w < W; w++) {
      const a = r * row + w;
      const b = a + 1;
      const c = a + row;
      const e = c + 1;
      index.push(a, c, b, b, c, e);
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(position, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  const cloth = colored(geo, color);
  // The knot at the nape.
  point(W / 2, edge[W / 2], p);
  const knot = colored(new SphereGeometry(0.028, 10, 6).scale(1.3, 0.9, 1).translate(0, p[1] + 0.012, p[2] - 0.016), color);
  return mesh([cloth, knot]);
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
