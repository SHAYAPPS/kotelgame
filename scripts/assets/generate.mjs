// Generates the stand-in stone textures (tileable, 1024 px) and encodes them to KTX2 in
// public/assets/textures/. They are made here from noise (so they're ours, CC0), and are
// used until `npm run assets:fetch` replaces them with CC0 photoscans (Poly Haven,
// ambientCG). Each set: <id>_color (sRGB), <id>_normal (OpenGL, +Y up), <id>_orm
// (R = ambient occlusion, G = roughness, B = metalness).
//
//   node scripts/assets/generate.mjs [id ...]
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { encodeKTX2 } from './ktx2.mjs';
import { writeCredits } from './credits.mjs';

const OUT = new URL('../../public/assets/textures/', import.meta.url);
const SIZE = 1024;

// ---------------------------------------------------------------------------
// Tileable noise (the lattice wraps every `period` cells, so textures tile).

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeNoise(seed) {
  const rand = mulberry32(seed);
  const perm = new Uint16Array(512);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const grad = new Float32Array(512);
  for (let i = 0; i < 256; i++) {
    const a = rand() * Math.PI * 2;
    grad[i * 2] = Math.cos(a);
    grad[i * 2 + 1] = Math.sin(a);
  }
  const g = (ix, iy, period, fx, fy) => {
    const h = perm[(perm[((ix % period) + period) % period & 255] + (((iy % period) + period) % period)) & 511];
    return grad[h * 2] * fx + grad[h * 2 + 1] * fy;
  };
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  /** Gradient noise in [-1, 1] at (x, y) with the given integer period (in cells). */
  return (x, y, period) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const u = fade(fx);
    const v = fade(fy);
    const a = g(ix, iy, period, fx, fy);
    const b = g(ix + 1, iy, period, fx - 1, fy);
    const c = g(ix, iy + 1, period, fx, fy - 1);
    const d = g(ix + 1, iy + 1, period, fx - 1, fy - 1);
    return 1.4142 * (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v);
  };
}

/** Fractal noise over the unit square [0,1)^2, tiling; `base` = cells across at octave 0. */
function fbm(noise, u, v, base, octaves, gain = 0.5, stretchY = 1) {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let f = base;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise(u * f, v * f * stretchY, f * (o === 0 ? 1 : 1));
    norm += amp;
    amp *= gain;
    f *= 2;
  }
  return sum / norm;
}

/** Ridged noise: thin bright lines where the noise crosses zero (cracks, veins). */
function ridge(noise, u, v, base, width) {
  const n = Math.abs(noise(u * base, v * base, base));
  return Math.max(0, 1 - n / width);
}

// Cheap cellular noise (tiling): nearest jittered point per cell, with that point's
// random radius (for pits of different sizes). Returns distance / radius (< 1 = inside).
function makeCells(seed, cells, sizePower = 3) {
  const rand = mulberry32(seed);
  const pts = new Float32Array(cells * cells * 3);
  for (let i = 0; i < cells * cells; i++) {
    pts[i * 3] = rand();
    pts[i * 3 + 1] = rand();
    pts[i * 3 + 2] = 0.08 + Math.pow(rand(), sizePower) * 0.42; // radius in cell units
  }
  return (u, v) => {
    const x = u * cells;
    const y = v * cells;
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    let best = 9;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const gx = (((cx + dx) % cells) + cells) % cells;
        const gy = (((cy + dy) % cells) + cells) % cells;
        const k = (gy * cells + gx) * 3;
        const d = Math.hypot(cx + dx + pts[k] - x, cy + dy + pts[k + 1] - y) / pts[k + 2];
        if (d < best) best = d;
      }
    }
    return best;
  };
}

// ---------------------------------------------------------------------------
// Output helpers

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Normal map (OpenGL) from a tiling height field (meters of relief per texel = `strength`). */
function normalsFromHeight(h, size, strength) {
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const xl = h[y * size + ((x - 1 + size) % size)];
      const xr = h[y * size + ((x + 1) % size)];
      const yu = h[((y - 1 + size) % size) * size + x];
      const yd = h[((y + 1) % size) * size + x];
      // Image rows go down; OpenGL normal maps have +Y up.
      const nx = (xl - xr) * strength;
      const ny = (yd - yu) * strength;
      const len = Math.hypot(nx, ny, 1);
      const i = (y * size + x) * 4;
      out[i] = Math.round((nx / len * 0.5 + 0.5) * 255);
      out[i + 1] = Math.round((ny / len * 0.5 + 0.5) * 255);
      out[i + 2] = Math.round((1 / len * 0.5 + 0.5) * 255);
      out[i + 3] = 255;
    }
  }
  return out;
}

/** Cavity-based ambient occlusion from the height field (blurred height minus height). */
function aoFromHeight(h, size, radius, strength) {
  // Box blur (separable, wrapping) of the height field.
  const tmp = new Float32Array(size * size);
  const blur = new Float32Array(size * size);
  const r = radius;
  for (let y = 0; y < size; y++) {
    let s = 0;
    for (let k = -r; k <= r; k++) s += h[y * size + ((k + size) % size)];
    for (let x = 0; x < size; x++) {
      tmp[y * size + x] = s / (2 * r + 1);
      s += h[y * size + ((x + r + 1) % size)] - h[y * size + ((x - r + size) % size)];
    }
  }
  for (let x = 0; x < size; x++) {
    let s = 0;
    for (let k = -r; k <= r; k++) s += tmp[((k + size) % size) * size + x];
    for (let y = 0; y < size; y++) {
      blur[y * size + x] = s / (2 * r + 1);
      s += tmp[((y + r + 1) % size) * size + x] - tmp[((y - r + size) % size) * size + x];
    }
  }
  const ao = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++) ao[i] = 1 - 0.45 * (1 - clamp01(1 - Math.max(0, blur[i] - h[i]) * strength)); // cavities only darken so far
  return ao;
}

async function writeSet(id, { color, height, rough, normalStrength, aoRadius = 8, aoStrength = 14 }) {
  const n = SIZE * SIZE;
  const rgba = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    rgba[i * 4] = color[i * 3];
    rgba[i * 4 + 1] = color[i * 3 + 1];
    rgba[i * 4 + 2] = color[i * 3 + 2];
    rgba[i * 4 + 3] = 255;
  }
  const normal = normalsFromHeight(height, SIZE, normalStrength);
  const ao = aoFromHeight(height, SIZE, aoRadius, aoStrength);
  const orm = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    orm[i * 4] = Math.round(ao[i] * 255);
    orm[i * 4 + 1] = Math.round(clamp01(rough[i]) * 255);
    orm[i * 4 + 2] = 0;
    orm[i * 4 + 3] = 255;
  }
  if (process.env.PREVIEW) {
    // Look at the result before it's compressed: PREVIEW=<dir> writes PNGs there.
    const sharp = (await import('sharp')).default;
    await sharp(Buffer.from(rgba), { raw: { width: SIZE, height: SIZE, channels: 4 } }).png().toFile(`${process.env.PREVIEW}/${id}_color.png`);
    await sharp(Buffer.from(normal), { raw: { width: SIZE, height: SIZE, channels: 4 } }).png().toFile(`${process.env.PREVIEW}/${id}_normal.png`);
  }
  await writeFile(new URL(`${id}_color.ktx2`, OUT), await encodeKTX2(rgba, SIZE, SIZE, 'color'));
  await writeFile(new URL(`${id}_normal.ktx2`, OUT), await encodeKTX2(normal, SIZE, SIZE, 'normal'));
  await writeFile(new URL(`${id}_orm.ktx2`, OUT), await encodeKTX2(orm, SIZE, SIZE, 'data'));
}

// ---------------------------------------------------------------------------
// Jerusalem limestone: pale cream with grey/ochre mottling, pits, weathering streaks and
// hairline cracks. `rough` makes the rougher, more pitted stone of the upper courses.

function stoneField(seed, { rough = 0, tintWarm = 0 } = {}) {
  const noise = makeNoise(seed);
  const noise2 = makeNoise(seed + 1);
  const noise3 = makeNoise(seed + 3);
  const pitsA = makeCells(seed + 2, 40, 4); // many small pits
  const pitsB = makeCells(seed + 5, 12, 2); // a few larger, shallow erosion hollows
  const n = SIZE * SIZE;
  const color = new Uint8Array(n * 3);
  const height = new Float32Array(n);
  const rgh = new Float32Array(n);
  const base = [226, 215, 190];
  for (let y = 0; y < SIZE; y++) {
    const v = y / SIZE;
    for (let x = 0; x < SIZE; x++) {
      const u = x / SIZE;
      const i = y * SIZE + x;
      const large = fbm(noise, u, v, 2, 3); // broad tone changes
      const mottle = fbm(noise2, u, v, 8, 5); // patchy grey / ochre
      const grain = fbm(noise3, u, v, 64, 4, 0.6); // sandy fine grain
      const speck = noise3(u * 512, v * 512, 512); // single-texel speckle
      // Weathering patina: grey-brown patches, more on rough stone.
      const patina = smooth(0.1 - rough * 0.2, 0.45, fbm(noise, u + 0.5, v + 0.2, 4, 4));
      // Pits cluster in some areas.
      const cluster = smooth(0.15, 0.6, fbm(noise2, u + 0.3, v, 5, 2)) * (0.25 + rough * 0.8);
      const pa = pitsA(u, v);
      const pitA = pa < 1 ? (1 - pa * pa) * cluster : 0;
      const pb = pitsB(u, v);
      const hollow = pb < 1 ? smooth(1, 0.2, pb) * (0.25 + rough * 0.5) : 0;
      // Cracks: rare, jagged (domain-warped), hairline.
      const wu = u + noise(u * 40, v * 40, 40) * 0.004;
      const wv = v + noise(u * 40 + 7, v * 40, 40) * 0.004;
      const crackMask = smooth(0.3, 0.55, fbm(noise3, u, v, 3, 2));
      const crack = ridge(noise2, wu, wv, 5, 0.012) * crackMask;
      const h = large * 0.1 + mottle * 0.15 + grain * (0.14 + rough * 0.22) - pitA * (0.4 + rough * 0.4) - hollow * 0.35 - crack * 0.6;
      height[i] = h;
      let l = 1 + large * 0.05 + mottle * 0.06 + grain * 0.06 + speck * 0.025;
      l -= pitA * (0.13 + rough * 0.07) + hollow * 0.06 + crack * 0.22 + patina * (0.07 + rough * 0.08);
      const ochre = clamp01(mottle * 1.6 + 0.1) * (0.07 + tintWarm);
      const grey = patina * (0.3 + rough * 0.25);
      // Patina darkens toward a warm grey-brown (not blue).
      const r = base[0] * l * (1 + ochre * 0.45) * (1 - grey * 0.16);
      const g = base[1] * l * (1 + ochre * 0.15) * (1 - grey * 0.17);
      const b = base[2] * l * (1 - ochre * 0.4) * (1 - grey * 0.2);
      color[i * 3] = Math.max(0, Math.min(255, r));
      color[i * 3 + 1] = Math.max(0, Math.min(255, g));
      color[i * 3 + 2] = Math.max(0, Math.min(255, b));
      rgh[i] = 0.8 + grain * 0.1 + pitA * 0.12 + patina * 0.05 + rough * 0.06;
    }
  }
  return { color, height, rough: rgh };
}

// Paving: pale limestone slabs (4 m per tile) in running courses, each slab its own tone,
// worn edges, dark joints, a few cracked slabs.
function paving(seed) {
  const rand = mulberry32(seed);
  const stone = stoneField(seed + 10, { rough: -0.3 });
  const tile = 4; // meters per texture
  // Course heights (sum to the tile), slab widths per course (sum to the tile).
  const rows = [];
  let yy = 0;
  while (yy < tile - 0.4) {
    const h = Math.min(tile - yy, 0.5 + rand() * 0.5);
    rows.push({ y0: yy, y1: yy + h, cuts: [] });
    yy += h;
  }
  rows[rows.length - 1].y1 = tile;
  for (const r of rows) {
    let xx = rand() * 0.8;
    const start = xx;
    while (xx < start + tile - 0.5) {
      r.cuts.push(xx);
      xx += 0.7 + rand() * 0.9;
    }
    r.tone = [];
    for (let k = 0; k < r.cuts.length; k++) r.tone.push({ l: 0.94 + rand() * 0.1, warm: (rand() - 0.5) * 0.06, crack: rand() < 0.08 });
  }
  const noise = makeNoise(seed + 20);
  const n = SIZE * SIZE;
  const joint = 0.007; // meters
  for (let y = 0; y < SIZE; y++) {
    const my = (y / SIZE) * tile;
    const row = rows.find((r) => my >= r.y0 && my < r.y1) ?? rows[rows.length - 1];
    for (let x = 0; x < SIZE; x++) {
      const mx = (x / SIZE) * tile;
      const i = y * SIZE + x;
      // Which slab (the cut list wraps around the tile).
      let k = 0;
      let left = row.cuts[0];
      let right = row.cuts[0] + tile;
      for (let c = 0; c < row.cuts.length; c++) {
        const a = row.cuts[c];
        const b = c + 1 < row.cuts.length ? row.cuts[c + 1] : row.cuts[0] + tile;
        const px = mx < row.cuts[0] ? mx + tile : mx;
        if (px >= a && px < b) {
          k = c;
          left = a;
          right = b;
          break;
        }
      }
      const px = mx < row.cuts[0] ? mx + tile : mx;
      const edge = Math.min(px - left, right - px, my - row.y0, row.y1 - my);
      const t = row.tone[k];
      const inJoint = edge < joint;
      const bevel = smooth(0, 0.02, edge); // worn, rounded slab edges
      const crack = t.crack ? ridge(noise, x / SIZE + k * 0.13, y / SIZE, 3, 0.02) : 0;
      stone.height[i] = inJoint ? -0.6 : stone.height[i] * 0.6 + (bevel - 1) * 0.35 - crack * 0.4;
      const l = inJoint ? 0.55 : t.l * (0.93 + 0.07 * bevel) * (1 - crack * 0.25);
      stone.color[i * 3] = Math.min(255, stone.color[i * 3] * l * (1 + t.warm));
      stone.color[i * 3 + 1] = Math.min(255, stone.color[i * 3 + 1] * l);
      stone.color[i * 3 + 2] = Math.min(255, stone.color[i * 3 + 2] * l * (1 - t.warm));
      // Foot traffic polishes the slabs a little.
      stone.rough[i] = inJoint ? 0.95 : stone.rough[i] - 0.1;
    }
  }
  return stone;
}

// Building ashlar: courses of dressed Jerusalem stone (4 m per tile) with light mortar,
// chisel texture and a little grime.
function ashlar(seed) {
  const rand = mulberry32(seed);
  const stone = stoneField(seed + 30, { rough: 0.2, tintWarm: 0.03 });
  const noise = makeNoise(seed + 40);
  const tile = 4;
  const rows = [];
  let yy = 0;
  while (yy < tile - 0.3) {
    const h = Math.min(tile - yy, 0.32 + rand() * 0.14);
    rows.push({ y0: yy, y1: yy + h, cuts: [], tone: [] });
    yy += h;
  }
  rows[rows.length - 1].y1 = tile;
  for (const r of rows) {
    let xx = rand() * 0.6;
    const start = xx;
    while (xx < start + tile - 0.4) {
      r.cuts.push(xx);
      r.tone.push({ l: 0.9 + rand() * 0.14, warm: (rand() - 0.5) * 0.08 });
      xx += 0.5 + rand() * 0.7;
    }
  }
  const joint = 0.012;
  for (let y = 0; y < SIZE; y++) {
    const my = (y / SIZE) * tile;
    const row = rows.find((r) => my >= r.y0 && my < r.y1) ?? rows[rows.length - 1];
    for (let x = 0; x < SIZE; x++) {
      const mx = (x / SIZE) * tile;
      const px = mx < row.cuts[0] ? mx + tile : mx;
      const i = y * SIZE + x;
      let k = row.cuts.length - 1;
      for (let c = 0; c < row.cuts.length; c++) {
        const b = c + 1 < row.cuts.length ? row.cuts[c + 1] : row.cuts[0] + tile;
        if (px >= row.cuts[c] && px < b) {
          k = c;
          break;
        }
      }
      const left = row.cuts[k];
      const right = k + 1 < row.cuts.length ? row.cuts[k + 1] : row.cuts[0] + tile;
      const edge = Math.min(px - left, right - px, my - row.y0, row.y1 - my);
      const inJoint = edge < joint;
      // Pillowed faces: slightly domed, chisel marks on top.
      const dome = smooth(0, 0.06, edge);
      const chisel = noise((x / SIZE) * 220, (y / SIZE) * 220, 220) * 0.5 + noise((x / SIZE) * 90, (y / SIZE) * 90, 90) * 0.5;
      const t = row.tone[k];
      stone.height[i] = inJoint ? -0.5 : stone.height[i] * 0.5 + dome * 0.3 + chisel * 0.12;
      const l = inJoint ? 1.05 : t.l * (0.9 + 0.1 * dome) * (1 + chisel * 0.03);
      stone.color[i * 3] = Math.min(255, stone.color[i * 3] * l * (1 + t.warm));
      stone.color[i * 3 + 1] = Math.min(255, stone.color[i * 3 + 1] * l);
      stone.color[i * 3 + 2] = Math.min(255, stone.color[i * 3 + 2] * l * (1 - t.warm * 1.2));
      stone.rough[i] = inJoint ? 0.97 : stone.rough[i];
    }
  }
  return stone;
}

// ---------------------------------------------------------------------------

export const SETS = {
  limestone: { meters: 2, make: () => stoneField(11), normalStrength: 6 },
  limestone_rough: { meters: 1.5, make: () => stoneField(23, { rough: 1, tintWarm: 0.02 }), normalStrength: 9 },
  paving: { meters: 4, make: () => paving(37), normalStrength: 5 },
  ashlar: { meters: 4, make: () => ashlar(53), normalStrength: 7 },
};

async function main() {
  await mkdir(OUT, { recursive: true });
  const manifestUrl = new URL('manifest.json', OUT);
  let manifest = {};
  try {
    manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
  } catch {
    // first run
  }
  const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SETS);
  for (const id of ids) {
    const set = SETS[id];
    if (!set) throw new Error(`Unknown texture set "${id}"`);
    const t0 = performance.now();
    const fields = set.make();
    await writeSet(id, { ...fields, normalStrength: set.normalStrength });
    manifest[id] = { meters: set.meters, source: 'generated', license: 'CC0', maps: ['color', 'normal', 'orm'] };
    console.log(`${id}: ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  }
  await writeFile(manifestUrl, JSON.stringify(manifest, null, 2) + '\n');
  await writeCredits();
}

main();
