// Packs a character's textures into one atlas (one material, one draw call), remaps the
// UVs into it (glTF convention: v down) and builds the color and normal images.
import sharp from 'sharp';

export const GUTTER = 6; // pixels of edge padding around each cell (mip bleeding)

/**
 * Rectangle packer: largest first into a growing power-of-two canvas.
 * @param {{ w: number, h: number }[]} rects
 * @returns {{ W: number, H: number, pos: { x: number, y: number }[] }}
 */
export function pack(rects) {
  const order = rects.map((r, i) => i).sort((a, b) => rects[b].w * rects[b].h - rects[a].w * rects[a].h);
  let W = rects[order[0]].w;
  let H = rects[order[0]].h;
  for (;;) {
    const pos = tryPack(rects, order, W, H);
    if (pos) return { W, H, pos };
    if (W <= H) W *= 2;
    else H *= 2;
  }
}

function tryPack(rects, order, W, H) {
  // Guillotine packer with free rectangles (best short-side fit).
  const free = [{ x: 0, y: 0, w: W, h: H }];
  const pos = new Array(rects.length);
  for (const i of order) {
    const r = rects[i];
    let best = -1;
    let bestScore = Infinity;
    free.forEach((f, k) => {
      if (r.w > f.w || r.h > f.h) return;
      const score = Math.min(f.w - r.w, f.h - r.h);
      if (score < bestScore) {
        bestScore = score;
        best = k;
      }
    });
    if (best < 0) return null;
    const f = free.splice(best, 1)[0];
    pos[i] = { x: f.x, y: f.y };
    // Split the leftover L-shape along the shorter axis.
    const right = { x: f.x + r.w, y: f.y, w: f.w - r.w, h: r.h };
    const below = { x: f.x, y: f.y + r.h, w: f.w, h: f.h - r.h };
    if (right.w > 0 && right.h > 0) free.push(right);
    if (below.w > 0 && below.h > 0) free.push(below);
  }
  return pos;
}

/** Decodes an embedded image to raw RGBA at w x h (with the gutter added around it). */
async function cell(bytes, w, h, { fallback = [128, 128, 128, 255], flipY = false } = {}) {
  const inner = { width: w - 2 * GUTTER, height: h - 2 * GUTTER };
  let img = bytes
    ? sharp(Buffer.from(bytes)).ensureAlpha().resize(inner.width, inner.height, { fit: 'fill', kernel: 'lanczos3' })
    : sharp({ create: { ...inner, channels: 4, background: { r: fallback[0], g: fallback[1], b: fallback[2], alpha: fallback[3] / 255 } } });
  if (flipY) img = img.flip();
  const raw = await img.extend({ top: GUTTER, bottom: GUTTER, left: GUTTER, right: GUTTER, extendWith: 'copy' }).raw().toBuffer();
  return raw;
}

function blit(dst, W, src, x0, y0, w, h) {
  for (let y = 0; y < h; y++) src.copy(dst, ((y0 + y) * W + x0) * 4, y * w * 4, (y + 1) * w * 4);
}

/**
 * @param {{ key: string, color: Uint8Array|null, normal: Uint8Array|null, size: number, flat?: number[] }[]} textures
 *   one entry per distinct texture; `size` = cell size in the color atlas (px)
 * @param {object} geo merged geometry (rig.mjs); `geo.mat` -> texture index via `matTexture`
 * @param {number[]} matTexture material index -> texture index
 * @param {number} normalScale normal atlas resolution relative to the color atlas
 */
export async function buildAtlas(textures, geo, matTexture, { normalScale = 0.5, normalFlipY = false } = {}) {
  const rects = textures.map((t) => ({ w: t.size, h: t.size }));
  const packed = pack(rects);
  const pos = packed.pos;
  // Crop to the cells actually used (e.g. 1536 x 1024 instead of 2048 x 1024).
  const W = Math.ceil(Math.max(...pos.map((p, i) => p.x + rects[i].w)) / 4) * 4;
  const H = Math.ceil(Math.max(...pos.map((p, i) => p.y + rects[i].h)) / 4) * 4;
  // UVs: FBX (v up, wraps) -> glTF atlas space (v down).
  const uv = new Float32Array(geo.count * 2);
  let wrapped = 0;
  for (let i = 0; i < geo.count; i++) {
    const ti = matTexture[geo.mat[i]];
    const s = textures[ti].size;
    const p = pos[ti];
    let u = geo.uv[i * 2];
    let v = geo.uv[i * 2 + 1];
    if (u < -0.001 || u > 1.001 || v < -0.001 || v > 1.001) wrapped++;
    u = Math.min(1, Math.max(0, u));
    v = Math.min(1, Math.max(0, v));
    uv[i * 2] = (p.x + GUTTER + u * (s - 2 * GUTTER)) / W;
    uv[i * 2 + 1] = (p.y + GUTTER + (1 - v) * (s - 2 * GUTTER)) / H;
  }
  const color = Buffer.alloc(W * H * 4);
  for (let t = 0; t < textures.length; t++) {
    const s = textures[t].size;
    blit(color, W, await cell(textures[t].color, s, s, { fallback: textures[t].flat ?? [200, 200, 200, 255] }), pos[t].x, pos[t].y, s, s);
  }
  const nW = Math.max(4, Math.round((W * normalScale) / 4) * 4);
  const nH = Math.max(4, Math.round((H * normalScale) / 4) * 4);
  const normal = Buffer.alloc(nW * nH * 4);
  for (let t = 0; t < textures.length; t++) {
    const s = Math.round(textures[t].size * normalScale);
    const raw = await cell(textures[t].normal, s, s, { fallback: [128, 128, 255, 255] });
    if (normalFlipY && textures[t].normal) for (let k = 1; k < raw.length; k += 4) raw[k] = 255 - raw[k];
    blit(normal, nW, raw, Math.round(pos[t].x * normalScale), Math.round(pos[t].y * normalScale), s, s);
  }
  return { W, H, uv, color, normal, nW, nH, wrapped, cells: pos.map((p, i) => ({ ...p, size: textures[i].size })) };
}

/**
 * Rasterizes triangles into an atlas-sized mask (uv in 0..1, glTF convention), marking
 * each covered pixel with `value`. Used for per-part recoloring and alpha regions.
 */
export function rasterize(mask, W, H, uv, index, pick, value) {
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t];
    const b = index[t + 1];
    const c = index[t + 2];
    if (!pick(a, b, c)) continue;
    const ax = uv[a * 2] * W;
    const ay = uv[a * 2 + 1] * H;
    const bx = uv[b * 2] * W;
    const by = uv[b * 2 + 1] * H;
    const cx = uv[c * 2] * W;
    const cy = uv[c * 2 + 1] * H;
    const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx)) - 1);
    const maxX = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)) + 1);
    const minY = Math.max(0, Math.floor(Math.min(ay, by, cy)) - 1);
    const maxY = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)) + 1);
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (Math.abs(area) < 1e-9) continue;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        // Barycentric test with a small margin (conservative, covers edge pixels).
        const w0 = ((bx - px) * (cy - py) - (by - py) * (cx - px)) / area;
        const w1 = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) / area;
        const w2 = 1 - w0 - w1;
        const m = -1.2 / Math.sqrt(Math.abs(area));
        if (w0 >= m && w1 >= m && w2 >= m) mask[y * W + x] = value;
      }
    }
  }
}

/** Grows mask values into unset neighbors `steps` times (covers island seams). */
export function dilate(mask, W, H, steps, empty = 0) {
  for (let s = 0; s < steps; s++) {
    const src = mask.slice();
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (src[i] !== empty) continue;
        const n = (x > 0 && src[i - 1] !== empty && src[i - 1]) || (x < W - 1 && src[i + 1] !== empty && src[i + 1]) || (y > 0 && src[i - W] !== empty && src[i - W]) || (y < H - 1 && src[i + W] !== empty && src[i + W]);
        if (n) mask[i] = n;
      }
    }
  }
}

export function rgbToHsl(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

/** Skin-ish pixel: warm hue, some saturation, not too dark. */
export function isSkin(r, g, b) {
  const [h, s, l] = rgbToHsl(r / 255, g / 255, b / 255);
  return (h < 50 || h > 340) && s > 0.18 && s < 0.75 && l > 0.18 && l < 0.85 && r > g && g >= b * 0.85;
}
