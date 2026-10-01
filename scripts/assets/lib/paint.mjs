// Painting textures from 3D: rasterize a mesh's triangles in UV space and shade every covered
// texel from its interpolated surface attributes (position, normal, anything per vertex).
// Used by the weapon converter for the gloves / sleeves of the first-person arms.

/**
 * @param {number} W @param {number} H texture size
 * @param {Float32Array} uv per vertex, 0..1, glTF convention (v down)
 * @param {Uint32Array} index triangles
 * @param {Array<{ array: ArrayLike<number>, size: number }>} attrs per-vertex attributes
 * @param {(x: number, y: number, values: Float32Array[], tri: number, frame: object) => void} shade
 *   called once per texel with the interpolated attributes (one Float32Array per attr) and the
 *   triangle's UV frame: { T, B } = 3D directions of increasing u / v per unit of texture space
 *   (meters per UV unit), from the first attribute (the positions)
 * @returns {Uint8Array} coverage mask (1 = painted)
 */
export function paintTriangles(W, H, uv, index, attrs, shade) {
  const mask = new Uint8Array(W * H);
  const values = attrs.map((a) => new Float32Array(a.size));
  const P = attrs[0].array;
  const frame = { T: [0, 0, 0], B: [0, 0, 0] };
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t];
    const b = index[t + 1];
    const c = index[t + 2];
    const ax = uv[a * 2] * W;
    const ay = uv[a * 2 + 1] * H;
    const bx = uv[b * 2] * W;
    const by = uv[b * 2 + 1] * H;
    const cx = uv[c * 2] * W;
    const cy = uv[c * 2 + 1] * H;
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (Math.abs(area) < 1e-12) continue;
    // UV frame: solve dP = T du + B dv over the triangle's two edges (texture space in 0..1 units).
    const du1 = (bx - ax) / W;
    const dv1 = (by - ay) / H;
    const du2 = (cx - ax) / W;
    const dv2 = (cy - ay) / H;
    const det = du1 * dv2 - du2 * dv1;
    for (let k = 0; k < 3; k++) {
      const e1 = P[b * 3 + k] - P[a * 3 + k];
      const e2 = P[c * 3 + k] - P[a * 3 + k];
      frame.T[k] = det ? (e1 * dv2 - e2 * dv1) / det : 0;
      frame.B[k] = det ? (e2 * du1 - e1 * du2) / det : 0;
    }
    const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx)) - 1);
    const maxX = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)) + 1);
    const minY = Math.max(0, Math.floor(Math.min(ay, by, cy)) - 1);
    const maxY = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)) + 1);
    const margin = -1.0 / Math.sqrt(Math.abs(area));
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        let w0 = ((bx - px) * (cy - py) - (by - py) * (cx - px)) / area;
        let w1 = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) / area;
        let w2 = 1 - w0 - w1;
        if (w0 < margin || w1 < margin || w2 < margin) continue;
        // Edge texels (conservative margin): clamp into the triangle.
        w0 = Math.max(0, w0);
        w1 = Math.max(0, w1);
        w2 = Math.max(0, w2);
        const s = w0 + w1 + w2;
        w0 /= s;
        w1 /= s;
        w2 /= s;
        for (let i = 0; i < attrs.length; i++) {
          const { array, size } = attrs[i];
          const v = values[i];
          for (let k = 0; k < size; k++) v[k] = array[a * size + k] * w0 + array[b * size + k] * w1 + array[c * size + k] * w2;
        }
        shade(x, y, values, t / 3, frame);
        mask[y * W + x] = 1;
      }
    }
  }
  return mask;
}

/** Fills unpainted texels from painted neighbors (`steps` rings), so mip levels don't bleed in black. */
export function bleed(rgba, mask, W, H, steps = 8) {
  const m = mask.slice();
  for (let s = 0; s < steps; s++) {
    const src = m.slice();
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (src[i]) continue;
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        let n = 0;
        for (const j of [i - 1, i + 1, i - W, i + W]) {
          if (j < 0 || j >= W * H || !src[j]) continue;
          r += rgba[j * 4];
          g += rgba[j * 4 + 1];
          b += rgba[j * 4 + 2];
          a += rgba[j * 4 + 3];
          n++;
        }
        if (!n) continue;
        rgba[i * 4] = r / n;
        rgba[i * 4 + 1] = g / n;
        rgba[i * 4 + 2] = b / n;
        rgba[i * 4 + 3] = a / n;
        m[i] = 1;
      }
    }
  }
}

/** Smooth 3D value noise in -1..1 (hash-based, deterministic). */
export function noise3(x, y, z) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = x - xi;
  const yf = y - yi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const w = zf * zf * (3 - 2 * zf);
  const h = (i, j, k) => {
    let n = (i * 374761393 + j * 668265263 + k * 2147483647) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) & 0xffff) / 32767.5 - 1;
  };
  const lerp = (a, b, t) => a + (b - a) * t;
  return lerp(
    lerp(lerp(h(xi, yi, zi), h(xi + 1, yi, zi), u), lerp(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u), v),
    lerp(lerp(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u), lerp(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u), v),
    w,
  );
}

/** Fractal noise: `octaves` of noise3, each twice the frequency and half the amplitude. */
export function fbm3(x, y, z, octaves = 4) {
  let s = 0;
  let a = 0.5;
  let f = 1;
  for (let i = 0; i < octaves; i++) {
    s += a * noise3(x * f, y * f, z * f);
    f *= 2.03;
    a *= 0.5;
  }
  return s;
}
