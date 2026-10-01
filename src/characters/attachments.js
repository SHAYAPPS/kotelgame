import {
  BoxGeometry,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { fitCap, fitRing, surfaceGrid, topHeight } from './headFit.js';

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

/**
 * Builds a mesh from a grid of points: rows x cols (cols wrap around when `wrap`). Faces turn
 * toward `out` (a direction, or a function of a face's centroid giving one).
 */
function gridGeometry(rows, cols, point, { wrap = true, out = null } = {}) {
  const position = new Float32Array(rows * cols * 3);
  const p = [0, 0, 0];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      point(r, c, p);
      position.set(p, (r * cols + c) * 3);
    }
  }
  const index = [];
  const last = wrap ? cols : cols - 1;
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < last; c++) {
      const a = r * cols + c;
      const b = r * cols + ((c + 1) % cols);
      const d = a + cols;
      const e = b + cols;
      index.push(a, d, b, b, d, e);
    }
  }
  if (out) {
    // Which way the faces point on the whole: flip them all if mostly against `out`.
    let sum = 0;
    for (let t = 0; t < index.length; t += 3) {
      const [i0, i1, i2] = [index[t] * 3, index[t + 1] * 3, index[t + 2] * 3];
      const ux = position[i1] - position[i0];
      const uy = position[i1 + 1] - position[i0 + 1];
      const uz = position[i1 + 2] - position[i0 + 2];
      const vx = position[i2] - position[i0];
      const vy = position[i2 + 1] - position[i0 + 1];
      const vz = position[i2 + 2] - position[i0 + 2];
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      const cx = (position[i0] + position[i1] + position[i2]) / 3;
      const cy = (position[i0 + 1] + position[i1 + 1] + position[i2 + 1]) / 3;
      const cz = (position[i0 + 2] + position[i1 + 2] + position[i2 + 2]) / 3;
      const o = typeof out === 'function' ? out(cx, cy, cz) : out;
      sum += nx * o[0] + ny * o[1] + nz * o[2];
    }
    if (sum < 0) for (let t = 0; t < index.length; t += 3) [index[t + 1], index[t + 2]] = [index[t + 2], index[t + 1]];
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(position, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return geo;
}

/** Per-triangle colors on a non-indexed copy: color(tri index, its centroid row/col) -> hex. */
function paint(geo, color) {
  const g = geo.toNonIndexed();
  const n = g.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  const c = new Color();
  for (let t = 0; t < n; t += 3) {
    c.setHex(color(t / 3));
    for (let v = 0; v < 3; v++) col.set([c.r, c.g, c.b], (t + v) * 3);
  }
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  return g;
}

// Ring fits: 40 angles around (0 = the face, toward the left ear).
const RING = 40;

const BAND_W = 0.032; // headband width

/**
 * Where a headband sits on this head: around the forehead, settled lower at the back, and
 * above anything sticking out in front (a cap's brim, the brow of a mask): from the forehead
 * ring up, the first height where nowhere across the band's width the front is wider than
 * the sides allow. Fitted along its top edge, middle and bottom edge, so it follows the
 * head's slope.
 */
export function headbandFit(head, pts) {
  const s = skull(head);
  const tilt = 0.012;
  const ring = (y) => fitRing(pts, { y, cz: s.cz, tilt, n: RING, half: 0.008, q: 0.92 });
  const edge = BAND_W / 2 - 0.003;
  // Front sector (within 50 degrees of the face) vs the sides.
  const sticksOut = (radii) => {
    let front = 0;
    const side = [];
    for (let i = 0; i < RING; i++) {
      const a = (i / RING) * Math.PI * 2;
      if (Math.cos(a) > Math.cos(0.87)) front = Math.max(front, radii[i]);
      else if (Math.abs(Math.cos(a)) < 0.5) side.push(radii[i]);
    }
    side.sort((u, v) => u - v);
    return front > (side[Math.floor(side.length / 2)] ?? front) * 1.32;
  };
  let y = s.y + 0.006;
  let rows;
  for (let k = 0; k <= 10; k++) {
    rows = { top: ring(y + edge), mid: ring(y), bottom: ring(y - edge) };
    if (k === 10 || !(sticksOut(rows.bottom) || sticksOut(rows.mid) || sticksOut(rows.top))) break;
    y += 0.006;
  }
  return { y, cz: s.cz, tilt, ...rows };
}

/**
 * Headband (an attacker's, in his role's color) around the forehead, on the head's real
 * surface (the hood, balaclava or cap: headbandFit): it can't float off it or sink in.
 */
export function headband(head, color = 0x1f7a2e, fit) {
  const W = BAND_W;
  const n = fit.mid.length;
  // Rows: top edge (tucked in), top, middle, bottom, bottom edge (tucked in): [height, which
  // fitted ring, thickness]. The middle never dips inside the line between the edges.
  const rows = [
    [W / 2 + 0.002, 'top', 0.0005],
    [W / 2, 'top', 0.0035],
    [0, 'mid', 0.0042],
    [-W / 2, 'bottom', 0.0035],
    [-W / 2 - 0.002, 'bottom', 0.0005],
  ];
  const geo = gridGeometry(rows.length, n, (r, c, p) => {
    const a = (c / n) * Math.PI * 2;
    const [h, which, t] = rows[r];
    let rad = fit[which][c];
    if (which === 'mid') rad = Math.max(rad, (fit.top[c] + fit.bottom[c]) / 2);
    rad += t;
    p[0] = Math.sin(a) * rad;
    p[1] = fit.y - (fit.tilt * (1 - Math.cos(a))) / 2 + h;
    p[2] = fit.cz + Math.cos(a) * rad;
  }, { out: (x, y, z) => [x, 0, z - fit.cz] });
  return mesh([colored(geo, color)]);
}

export const KIPPAH = {
  velvet: { arc: 0.08, color: 0x0e0e10 }, // black velvet: the largest
  white: { arc: 0.07, color: 0xf2f2ee }, // white satin (visitors)
  knit: { arc: 0.062, color: 0xf2f2f0 }, // crocheted, with a patterned band
};

/** The kippah's spot on this head: the crown's surface around KIPPAH_AXIS, out to `arc` m. */
export function kippahFit(head, pts, arc) {
  const s = skull(head);
  const center = [0, s.y, s.cz];
  const meanR = ((s.top - s.y) + (s.rx + s.rz) / 2) / 2;
  const fit = fitCap(pts, { center, axis: [KIPPAH_AXIS.x, KIPPAH_AXIS.y, KIPPAH_AXIS.z], maxAngle: arc / meanR, rings: 6, segs: 28, q: 0.99, qRim: 0.97 });
  return { ...fit, center };
}

/**
 * Kippah on the back of the crown, laid on the hair's (or scalp's) real surface there
 * (kippahFit): it follows the head's shape, sits on top of the hair, and its rim settles
 * slightly into it.
 * @param {{ style?: 'velvet'|'white'|'knit', knit?: { base: number, pattern: number[], rim: number }, rim?: number|null, fit: object }} opts
 */
export function kippah(head, { style = 'velvet', knit = null, rim = null, fit }) {
  const k = KIPPAH[style] ?? KIPPAH.velvet;
  const { dirs, radii, rings, segs, center } = fit;
  const lift = 0.0035;
  const geo = gridGeometry(rings + 1, segs, (r, c, p) => {
    const i = r * segs + c;
    const rad = radii[i] + lift * (1 - 0.6 * (r / rings));
    p[0] = center[0] + dirs[i * 3] * rad;
    p[1] = center[1] + dirs[i * 3 + 1] * rad;
    p[2] = center[2] + dirs[i * 3 + 2] * rad;
  }, { out: (x, y, z) => [x - center[0], y - center[1], z - center[2]] });
  geo.computeVertexNormals();
  const base = knit ? knit.base : k.color;
  const quads = segs * 2; // two triangles per cell
  const g = paint(geo, (tri) => {
    const row = Math.floor(tri / quads); // 0 (center) .. rings - 1 (rim)
    const seg = Math.floor((tri % quads) / 2);
    const ringT = (row + 0.5) / rings;
    if (knit) {
      if (ringT > 0.84) return knit.rim;
      if (ringT > 0.5 && ringT < 0.72) return seg % 2 ? knit.pattern[Math.floor(seg / 2) % knit.pattern.length] : base;
    } else if (rim && ringT > 0.84) return rim;
    return base;
  });
  return mesh([g]);
}

/** A fedora's band on this head: the hair's surface where the sweatband sits, and the hair's top. */
export function hatFit(head, pts) {
  const s = skull(head);
  const y = s.y + 0.004;
  const radii = fitRing(pts, { y, cz: s.cz, tilt: 0.01, n: RING, half: 0.02, q: 0.9 });
  const top = topHeight(pts, { cz: s.cz, r: 0.06, q: 0.97 });
  return { y, cz: s.cz, tilt: 0.01, radii, top: Number.isNaN(top) ? s.top : top };
}

/**
 * Black fedora (haredi): the band fitted to the head (hatFit), a tapered crown with a crease
 * along the top and pinched front, a snap brim (down in front, up at the back), a ribbon.
 */
export function blackHat(head, { fit }) {
  const n = fit.radii.length;
  const felt = 0x0d0d0f;
  const ribbon = 0x050506;
  const R0 = (c) => fit.radii[c % n] + 0.007; // the hat's inside, just off the hair
  const yAt = (c) => fit.y - (fit.tilt * (1 - Math.cos((c / n) * Math.PI * 2))) / 2;
  const crownH = Math.max(0.112, fit.top - fit.y + 0.022);
  // Crown: rows from the band up, tapering in a little, rounding over at the top edge.
  const L = 7;
  const crown = gridGeometry(L + 1, n, (r, c, p) => {
    const t = r / L;
    const a = (c / n) * Math.PI * 2;
    const pinch = 1 - 0.07 * Math.max(0, Math.cos(a)) * t * t; // front pinch
    const rad = R0(c) * (1 - 0.06 * t * t) * pinch - (t > 0.86 ? (t - 0.86) * 0.12 : 0);
    p[0] = Math.sin(a) * rad;
    p[1] = yAt(c) + crownH * Math.min(t, 1) - (t > 0.86 ? ((t - 0.86) / 0.14) ** 2 * 0.006 : 0);
    p[2] = fit.cz + Math.cos(a) * rad;
  }, { out: (x, y, z) => [x, 0, z - fit.cz] });
  // Top: from the crown's top edge inward, with a crease along the middle (front to back).
  const T = 5;
  const top = gridGeometry(T + 1, n, (r, c, p) => {
    const u = 1 - r / T; // 1 at the edge .. 0 at the center
    const a = (c / n) * Math.PI * 2;
    const pinch = 1 - 0.07 * Math.max(0, Math.cos(a));
    const rad = (R0(c) * 0.94 * pinch - 0.0168) * u;
    const x = Math.sin(a) * rad;
    p[0] = x;
    // The crease: deepest along x = 0, fading out to the sides and toward the brim.
    const crease = 0.02 * Math.exp(-((x / 0.035) ** 2)) * (1 - u * u);
    p[1] = yAt(c) + crownH - 0.006 - crease - 0.004 * u;
    p[2] = fit.cz + Math.cos(a) * rad;
  }, { out: [0, 1, 0] });
  // Brim: from the band out ~5.5 cm, snapped down in front and up at the back.
  const B = 4;
  const brimRows = (side) =>
    gridGeometry(B + 1, n, (r, c, p) => {
      const u = r / B;
      const a = (c / n) * Math.PI * 2;
      const rad = R0(c) + 0.004 + u * 0.056;
      const snap = (-0.011 * Math.max(0, Math.cos(a)) + 0.012 * Math.max(0, -Math.cos(a))) * u * u;
      p[0] = Math.sin(a) * rad;
      p[1] = yAt(c) + snap + side;
      p[2] = fit.cz + Math.cos(a) * rad;
    }, { out: [0, side > 0 ? 1 : -1, 0] });
  const brimTop = brimRows(0.0025);
  const brimBottom = brimRows(-0.0025);
  // The brim's edge.
  const edge = gridGeometry(2, n, (r, c, p) => {
    const a = (c / n) * Math.PI * 2;
    const rad = R0(c) + 0.06;
    const snap = -0.011 * Math.max(0, Math.cos(a)) + 0.012 * Math.max(0, -Math.cos(a));
    p[0] = Math.sin(a) * rad;
    p[1] = yAt(c) + snap + (r ? -0.0025 : 0.0025);
    p[2] = fit.cz + Math.cos(a) * rad;
  }, { out: (x, y, z) => [x, 0, z - fit.cz] });
  // Ribbon around the crown's base.
  const band = gridGeometry(2, n, (r, c, p) => {
    const a = (c / n) * Math.PI * 2;
    const rad = R0(c) + 0.0016;
    p[0] = Math.sin(a) * rad;
    p[1] = yAt(c) + 0.003 + r * 0.03;
    p[2] = fit.cz + Math.cos(a) * rad;
  }, { out: (x, y, z) => [x, 0, z - fit.cz] });
  return mesh([colored(crown, felt), colored(top, felt), colored(brimTop, felt), colored(brimBottom, 0x0a0a0c), colored(edge, felt), colored(band, ribbon)]);
}

/**
 * A beret (the Border Police's): the band on the hair (hatFit), the crown puffed out over it
 * and pulled down to the right side, a little badge over the left eye.
 */
export function beret(head, color = 0x1f3a24, { fit }) {
  const n = fit.radii.length;
  const L = 6;
  const top = Math.max(fit.top - fit.y + 0.012, 0.05);
  const geo = gridGeometry(L + 1, n, (r, c, p) => {
    const t = r / L;
    const a = (c / n) * Math.PI * 2;
    const side = Math.sin(a); // +1 the left ear (+X), -1 the right
    // Out from the band, widest at a third of the way up, then over the top to the middle.
    const bulge = 0.022 * Math.sin(Math.min(1, t * 1.6) * Math.PI * 0.5) * (1 + 0.5 * Math.max(0, -side));
    const rad = (fit.radii[c] + 0.006 + bulge) * (t < 0.55 ? 1 : Math.cos(((t - 0.55) / 0.45) * Math.PI * 0.5));
    const h = top * Math.sin(Math.min(1, t / 0.75) * Math.PI * 0.5) - 0.025 * Math.max(0, -side) * Math.sin(t * Math.PI);
    p[0] = side * rad - 0.012 * Math.sin(t * Math.PI * 0.5); // the crown leans over the right ear
    p[1] = fit.y + h;
    p[2] = fit.cz + Math.cos(a) * rad;
  }, { out: (x, y, z) => [x, y - fit.y, z - fit.cz] });
  geo.computeVertexNormals();
  const band = colored(new BoxGeometry(0.018, 0.022, 0.004).translate(0.035, fit.y + 0.018, fit.cz + fit.radii[0] + 0.012), 0xc9a640);
  return mesh([paint(geo, () => color), band]);
}

// A headscarf's fit: a polar grid from the skull's center (rings from the crown down past the
// ears, segments around).
const SCARF_FIT = { rings: 18, segs: 40, maxAngle: Math.PI * 0.8, cone: 0.11 };
// The bun gathered under it: toward the back of the head, a little below the crown's middle.
const BUN = { dir: [0, 0.3, -0.954], height: 0.016, spread: 0.42 };

/**
 * A headscarf's shell on this head, per direction from the skull's center: the skin where the
 * model has it (forehead, temples, ears, nape), else the skull ellipsoid (the converter took
 * the scalp out from under the hair), plus a layer of flattened hair (fuller where the hair
 * is) and the bun at the back. `skin` / `hair`: CharacterType.headSurface(PART.fixed / .hair).
 */
export function scarfFit(head, skin, hair) {
  const s = skull(head);
  const ry = Math.max(0.04, s.top - s.y);
  const center = [0, s.y, s.cz];
  const { rings, segs, maxAngle, cone } = SCARF_FIT;
  const grid = { center, axis: [0, 1, 0], maxAngle, rings, segs, cone, raw: true };
  const sk = fitCap(skin, { ...grid, q: 0.97, qRim: 0.97 });
  const hr = fitCap(hair, { ...grid, q: 0.6, qRim: 0.6 });
  const n = sk.radii.length;
  let radii = new Float32Array(n);
  const floor = new Float32Array(n); // never under the skin (an ear's rim, the brow)
  for (let i = 0; i < n; i++) {
    const dx = sk.dirs[i * 3];
    const dy = sk.dirs[i * 3 + 1];
    const dz = sk.dirs[i * 3 + 2];
    const ell = 1 / Math.hypot(dx / s.rx, dy / ry, dz / s.rz);
    const base = Number.isNaN(sk.radii[i]) ? ell : Math.max(sk.radii[i], ell * 0.92);
    const h = hr.radii[i];
    const layer = Number.isNaN(h) ? 0.004 : Math.min(0.012, Math.max(0.004, (h - base) * 0.4));
    const a = Math.acos(Math.min(1, Math.max(-1, dx * BUN.dir[0] + dy * BUN.dir[1] + dz * BUN.dir[2])));
    radii[i] = base + layer + BUN.height * Math.exp(-(a * a) / (2 * BUN.spread * BUN.spread));
    floor[i] = base + 0.0025;
  }
  // Smooth (1-2-1 around each ring and between rings), twice.
  for (let pass = 0; pass < 2; pass++) {
    const src = radii;
    radii = new Float32Array(n);
    for (let j = 0; j <= rings; j++) {
      for (let k = 0; k < segs; k++) {
        const at = (jj, kk) => src[Math.min(rings, Math.max(0, jj)) * segs + ((kk + segs) % segs)];
        const around = (at(j, k - 1) + 2 * at(j, k) + at(j, k + 1)) / 4;
        const down = j === 0 ? around : (at(j - 1, k) + 2 * around + at(j + 1, k)) / 4;
        radii[j * segs + k] = down;
      }
    }
    // The crown is one point.
    let c0 = 0;
    for (let k = 0; k < segs; k++) c0 += radii[k] / segs;
    radii.fill(c0, 0, segs);
  }
  for (let i = 0; i < n; i++) radii[i] = Math.max(radii[i], floor[i]);
  return { center, rings, segs, maxAngle, radii, eye: s.eye, y: s.y };
}

/** Per-vertex colors: color(vertex index, rgb out); then non-indexed like colored(). */
function shaded(geo, color) {
  const n = geo.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  const c = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    color(i, c);
    col.set(c, i * 3);
  }
  geo.setAttribute('color', new Float32BufferAttribute(col, 3));
  return geo.toNonIndexed();
}

/**
 * Headscarf (tichel) on its fit (scarfFit): cloth over the flattened hair and a bun, from the
 * hairline in front, over the tops of the ears, down to the nape; a rolled hem along the edge,
 * creases running into the knot at the nape, two short tails hanging from it.
 */
export function headscarf(head, color = 0x4a4f63, fit) {
  const { center, rings, segs, maxAngle, radii } = fit;
  const TAU = Math.PI * 2;
  const W = 64; // around
  const R = 24; // rows from the crown to the edge
  const radiusAt = (psi, theta) => {
    const jf = Math.min(rings, Math.max(0, (theta / maxAngle) * rings));
    const j0 = Math.min(rings - 1, Math.floor(jf));
    const fj = jf - j0;
    // fitCap's segments run from +X toward -Z (axis up): ph = psi - 90 degrees.
    let kf = ((psi - Math.PI / 2) / TAU) * segs;
    kf = ((kf % segs) + segs) % segs;
    const k0 = Math.floor(kf) % segs;
    const k1 = (k0 + 1) % segs;
    const fk = kf - Math.floor(kf);
    const r = (j, k) => radii[j * segs + k];
    return (r(j0, k0) * (1 - fk) + r(j0, k1) * fk) * (1 - fj) + (r(j0 + 1, k0) * (1 - fk) + r(j0 + 1, k1) * fk) * fj;
  };
  const dir = (psi, theta, out) => {
    out[0] = Math.sin(theta) * Math.sin(psi);
    out[1] = Math.cos(theta);
    out[2] = Math.sin(theta) * Math.cos(psi);
    return out;
  };
  // The lower edge: the hairline in front, over the ears, the nape at the back.
  const frontY = fit.eye + 0.042;
  const sideY = fit.eye - 0.03;
  const backY = fit.y - 0.09;
  const edgeY = (psi) => {
    const c = Math.cos(psi); // 1 front, 0 sides, -1 back
    return c >= 0 ? sideY + (frontY - sideY) * Math.pow(c, 1.6) : sideY + (backY - sideY) * -c;
  };
  const d = [0, 0, 0];
  const edge = new Float32Array(W);
  for (let c = 0; c < W; c++) {
    const psi = (c / W) * TAU;
    let theta = 0.3;
    while (theta < maxAngle && center[1] + dir(psi, theta, d)[1] * radiusAt(psi, theta) > edgeY(psi)) theta += 0.005;
    edge[c] = theta;
  }
  // The knot at the nape, just above the edge; creases run into it from all over the back.
  const kTheta = edge[W / 2] - 0.16;
  dir(Math.PI, kTheta, d);
  const kr = radiusAt(Math.PI, kTheta);
  const knot = [center[0] + d[0] * kr, center[1] + d[1] * kr, center[2] + d[2] * kr];
  const K = [d[0], d[1], d[2]]; // the knot's direction from the center
  const e1 = [1, 0, 0];
  const e2 = [K[1] * e1[2] - K[2] * e1[1], K[2] * e1[0] - K[0] * e1[2], K[0] * e1[1] - K[1] * e1[0]];
  const crease = (u) => {
    const cosA = u[0] * K[0] + u[1] * K[1] + u[2] * K[2];
    const a = Math.acos(Math.min(1, Math.max(-1, cosA)));
    const fade = Math.min(1, Math.max(0, (1.7 - a) / 1.3)) * Math.min(1, a / 0.2);
    const phi = Math.atan2(u[0] * e2[0] + u[1] * e2[1] + u[2] * e2[2], u[0] * e1[0] + u[1] * e1[1] + u[2] * e1[2]);
    return fade * fade * Math.sin(phi * 7 + 0.6 * Math.sin(phi * 3));
  };
  const base = new Color(color);
  const folds = new Float32Array((R + 1) * W);
  const cloth = gridGeometry(R + 1, W, (r, c, p) => {
    const psi = (c / W) * TAU;
    const theta = (r / R) * edge[c];
    dir(psi, theta, d);
    const f = crease(d);
    folds[r * W + c] = f;
    // Rolled hem: the last row stands out, the very edge tucks back in.
    const hem = r === R ? -0.001 : r === R - 1 ? 0.0025 : 0;
    const rad = radiusAt(psi, theta) + 0.0022 * f + hem;
    p[0] = center[0] + d[0] * rad;
    p[1] = center[1] + d[1] * rad;
    p[2] = center[2] + d[2] * rad;
  }, { out: (x, y, z) => [x - center[0], y - center[1], z - center[2]] });
  const parts = [shaded(cloth, (i, out) => {
    const r = Math.floor(i / W);
    const k = (1 + 0.16 * folds[i]) * (r >= R - 1 ? 0.86 : 1);
    out[0] = base.r * k;
    out[1] = base.g * k;
    out[2] = base.b * k;
  })];
  // Knot: two lobes side by side, sitting on the cloth.
  for (const side of [-1, 1]) {
    const lobe = new SphereGeometry(0.0145, 10, 7).scale(1.15, 0.85, 0.75);
    lobe.rotateZ(side * 0.35).translate(knot[0] + side * 0.012, knot[1] - 0.004, knot[2] + K[2] * 0.008);
    parts.push(colored(lobe, color));
  }
  // Tails: two tapered ribbons hanging from the knot, splayed and twisting a little, curled
  // across, off the neck; the inside a shade darker.
  const dark = base.clone().multiplyScalar(0.8).getHex();
  for (const side of [-1, 1]) {
    for (const face of [1, -1]) {
      const L = 0.072;
      const tail = gridGeometry(6, 3, (r, c, p) => {
        const t = r / 5;
        const w = 0.016 * (1 - 0.3 * t);
        const twist = side * (0.3 + 0.6 * t);
        const u = c - 1; // -1, 0, 1 across
        p[0] = knot[0] + side * (0.008 + 0.014 * t) + u * w * Math.cos(twist);
        p[1] = knot[1] - 0.01 - L * t;
        p[2] = knot[2] - 0.004 - 0.012 * t * t + u * w * Math.sin(twist) * 0.6 - Math.abs(u) * 0.003 + face * 0.0012;
      }, { wrap: false, out: [0, 0, -face] });
      parts.push(colored(tail, face > 0 ? color : dark));
    }
  }
  return mesh(parts);
}

// The plate carrier: plates (meters) and how it sits.
const PLATE = {
  halfW: 0.12, // half the plates' width
  shoulderW: 0.085, // half-width at the top, between the shoulder cuts
  chamfer: 0.05, // height of the shoulder cuts
  thick: 0.02, // plate + carrier
  gap: 0.004, // off the uniform
  bevel: 0.005,
};

/**
 * A plate carrier's fit on this torso (CharacterType.torsoSurface(): what follows Spine1 /
 * Spine2, in Spine2's frame: +Y up the spine, +Z the chest): the chest and the back as height
 * fields (headFit.js surfaceGrid), the torso's height range and its middle depth.
 */
export function vestFit(pts) {
  let y0 = Infinity;
  let y1 = -Infinity;
  let zf = -Infinity;
  let zb = Infinity;
  for (let p = 0; p < pts.length; p += 3) {
    y0 = Math.min(y0, pts[p + 1]);
    y1 = Math.max(y1, pts[p + 1]);
    if (Math.abs(pts[p]) < 0.05) {
      zf = Math.max(zf, pts[p + 2]);
      zb = Math.min(zb, pts[p + 2]);
    }
  }
  const cz = (zf + zb) / 2;
  const grid = { x0: -0.2, x1: 0.2, y0, y1, cell: 0.01, cz };
  return { y0, y1, cz, pts, front: surfaceGrid(pts, { ...grid, side: 1, q: 0.97 }), back: surfaceGrid(pts, { ...grid, side: -1, q: 0.97 }) };
}

/**
 * One plate (front: side 1, back: -1) from yBot to yTop, lying on the chest / back (the body's
 * shape under it, smoothed, just off the uniform), beveled edges. Returns the geometry, `outAt(x, y)` (the outer surface: distance out from cz) and
 * `slope(y)` (its tilt).
 */
function plateGeometry(fit, side, yBot, yTop) {
  const P = PLATE;
  const surf = side > 0 ? fit.front : fit.back;
  const out = (x, y) => side * (surf.at(x, y) - fit.cz);
  const halfW = (y) => P.halfW + (P.shoulderW - P.halfW) * Math.min(1, Math.max(0, (y - (yTop - P.chamfer)) / P.chamfer));
  // How far out the body is under the plate, on a grid across (x) and up (y); the plate lies on
  // it smoothed (a multi-curve plate in a fabric carrier: it bridges the spine's groove and the
  // dip under the collarbones) and never closer than the body.
  const H = 9;
  const K = 13;
  const xAt = (k, y) => -halfW(y) + (2 * halfW(y) * k) / (K - 1);
  const yAt = (r) => yBot + ((yTop - yBot) * r) / (H - 1);
  const need = new Float32Array(H * K);
  for (let r = 0; r < H; r++) for (let k = 0; k < K; k++) need[r * K + k] = out(xAt(k, yAt(r)), yAt(r));
  let prof = need;
  for (let pass = 0; pass < 4; pass++) {
    const src = prof;
    prof = new Float32Array(H * K);
    for (let r = 0; r < H; r++) {
      for (let k = 0; k < K; k++) {
        let sum = 0;
        let wsum = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dk = -1; dk <= 1; dk++) {
            const rr = Math.min(H - 1, Math.max(0, r + dr));
            const kk = Math.min(K - 1, Math.max(0, k + dk));
            const w = (2 - Math.abs(dr)) * (2 - Math.abs(dk));
            sum += src[rr * K + kk] * w;
            wsum += w;
          }
        }
        prof[r * K + k] = Math.max(need[r * K + k], sum / wsum);
      }
    }
  }
  const at = (x, y) => {
    const fr = Math.min(H - 1, Math.max(0, ((y - yBot) / (yTop - yBot)) * (H - 1)));
    const r = Math.min(H - 2, Math.floor(fr));
    const hw = halfW(y);
    const fk = Math.min(K - 1, Math.max(0, ((x + hw) / (2 * hw)) * (K - 1)));
    const k = Math.min(K - 2, Math.floor(fk));
    const u = fk - k;
    const v = fr - r;
    const row = (rr) => prof[rr * K + k] * (1 - u) + prof[rr * K + k + 1] * u;
    return row(r) * (1 - v) + row(r + 1) * v;
  };
  const inner = (x, y) => at(x, y) + P.gap;
  const outAt = (x, y) => inner(x, y) + P.thick;
  const slope = (y) => (at(0, y + 0.01) - at(0, y - 0.01)) / 0.02;
  // Grid: beveled edge rows / columns tucked in to the plate's inner surface.
  const R = 10;
  const C = 12;
  const geo = gridGeometry(R + 4, C + 4, (r, c, p) => {
    const rr = Math.min(R - 1, Math.max(0, r - 2));
    let y = yBot + ((yTop - yBot) * rr) / (R - 1);
    if (r === 0) y += P.bevel;
    if (r === R + 3) y -= P.bevel;
    const hw = halfW(y);
    const cc = Math.min(C - 1, Math.max(0, c - 2));
    let x = -hw + (2 * hw * cc) / (C - 1);
    if (c === 0) x += P.bevel;
    if (c === C + 3) x -= P.bevel;
    const edge = r === 0 || r === R + 3 || c === 0 || c === C + 3;
    const rim = r === 1 || r === R + 2 || c === 1 || c === C + 2;
    const d = edge ? inner(x, y) : rim ? outAt(x, y) - P.bevel * 0.6 : outAt(x, y);
    p[0] = x;
    p[1] = y;
    p[2] = fit.cz + side * d;
  }, { wrap: false, out: [0, 0, side] });
  return { geo, outAt, slope };
}

/** A shoulder strap at x: over the top of the shoulder from the front plate's top to the back's. */
function strapGeometry(fit, x, front, back) {
  // Around a point under the shoulder, in the (z, y) plane: angle 0 straight up, + toward the chest.
  const oy = Math.min(front.y, back.y) - 0.03;
  const oz = fit.cz;
  const near = [];
  for (let p = 0; p < fit.pts.length; p += 3) {
    if (Math.abs(fit.pts[p] - x) > 0.025 || fit.pts[p + 1] < oy) continue;
    near.push(Math.atan2(fit.pts[p + 2] - oz, fit.pts[p + 1] - oy), Math.hypot(fit.pts[p + 2] - oz, fit.pts[p + 1] - oy));
  }
  const a0 = Math.atan2(front.z - oz, front.y - oy);
  const a1 = Math.atan2(back.z - oz, back.y - oy);
  const rF = Math.hypot(front.z - oz, front.y - oy);
  const rB = Math.hypot(back.z - oz, back.y - oy);
  const N = 14;
  const rad = new Float32Array(N + 1);
  for (let k = 0; k <= N; k++) {
    const a = a0 + ((a1 - a0) * k) / N;
    const d = [];
    for (let i = 0; i < near.length; i += 2) if (Math.abs(near[i] - a) < 0.1) d.push(near[i + 1]);
    d.sort((u, v) => u - v);
    const body = d.length >= 3 ? d[Math.floor((d.length - 1) * 0.97)] : 0;
    // At least the arc between its ends (where nothing is measured, it doesn't sag into the body).
    const ends = rF + ((rB - rF) * k) / N;
    rad[k] = k === 0 ? rF : k === N ? rB : Math.max(body + 0.004, ends);
  }
  // Smooth (the strap is stiff webbing), never into the body.
  const sm = rad.slice();
  for (let k = 1; k < N; k++) sm[k] = Math.max(rad[k], (rad[k - 1] + 2 * rad[k] + rad[k + 1]) / 4);
  const W = 0.022; // half its width
  const T = 0.006; // thickness
  return gridGeometry(N + 1, 4, (r, c, p) => {
    const a = a0 + ((a1 - a0) * r) / N;
    const t = c === 0 || c === 3 ? 0 : T; // the sides tucked in
    const rr = sm[r] + t;
    p[0] = x + (c < 2 ? -W : W) * (c === 0 || c === 3 ? 0.85 : 1);
    p[1] = oy + Math.cos(a) * rr;
    p[2] = oz + Math.sin(a) * rr;
  }, { wrap: false, out: (px, py, pz) => [0, py - oy, pz - oz] });
}

/**
 * Plate carrier on the chest (attached to Spine2), fitted to the torso (vestFit): front and
 * back plates lying on the chest and the back, straps over the shoulders, three magazine
 * pouches on the front.
 */
export function vest(fit, color = 0x5d5f3f) {
  const dark = 0x44472f;
  const H = fit.y1 - fit.y0;
  const front = plateGeometry(fit, 1, fit.y0 + 0.17 * H, fit.y1 - 0.22 * H);
  const back = plateGeometry(fit, -1, fit.y0 + 0.2 * H, fit.y1 - 0.18 * H);
  const yF = fit.y1 - 0.22 * H;
  const yB = fit.y1 - 0.18 * H;
  const parts = [colored(front.geo, color), colored(back.geo, color)];
  for (const x of [-0.06, 0.06]) {
    const f = { y: yF - 0.012, z: fit.cz + front.outAt(x, yF) - PLATE.thick * 0.6 };
    const b = { y: yB - 0.012, z: fit.cz - (back.outAt(x, yB) - PLATE.thick * 0.6) };
    parts.push(colored(strapGeometry(fit, x, f, b), dark));
  }
  // Magazine pouches on the front plate's lower half, each following the plate's curve and tilt.
  const yBot = fit.y0 + 0.17 * H;
  for (const x of [-0.07, 0, 0.07]) {
    const h = 0.1;
    const yc = yBot + 0.012 + h / 2;
    const z = fit.cz + front.outAt(x, yc);
    const pouch = new BoxGeometry(0.058, h, 0.034).translate(0, 0, 0.017);
    const flap = new BoxGeometry(0.062, 0.03, 0.038).translate(0, h / 2 - 0.012, 0.017);
    for (const [g, c] of [[pouch, dark], [flap, color]]) {
      const side = (front.outAt(x + 0.01, yc) - front.outAt(x - 0.01, yc)) / 0.02; // the plate's sideways slope
      g.rotateX(-Math.atan(front.slope(yc))).rotateY(Math.atan(side)).translate(x, yc, z);
      parts.push(colored(g, c));
    }
  }
  return mesh(parts);
}
