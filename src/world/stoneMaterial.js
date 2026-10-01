import { MeshStandardNodeMaterial } from 'three/webgpu';
import {
  Break,
  Fn,
  If,
  Loop,
  abs,
  attribute,
  cameraPosition,
  cross,
  dFdx,
  dFdy,
  dot,
  float,
  inverseSqrt,
  length,
  max,
  mix,
  mx_fractal_noise_float,
  mx_noise_float,
  normalGeometry,
  normalView,
  normalWorld,
  normalize,
  positionView,
  positionWorld,
  select,
  smoothstep,
  texture,
  transformNormalToView,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';

// Stone surfaces (the plaza's paving, the wall's blocks, terraces, buildings) as node
// materials, set up once their texture set arrives (world/Textures.js): the texture set
// sampled where it should be (the wall's blocks project it from world space, each block at its
// own offset), parallax occlusion so joints, drafted margins and pits look carved in, close-up
// detail (fine grain in the stone's relief and color), and wear: the paving polished where
// people walk (smoother, so it catches reflections), the wall darkened and smoothed where
// hands touch it, grime at the foot of walls. The switches (Settings > Graphics) are uniforms.

export const STONE = {
  parallax: uniform(1),
  detail: uniform(1),
};

/** A stone material (plain color until its textures arrive). */
export function stoneMaterial(params = {}) {
  const m = new MeshStandardNodeMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0, ...params });
  return m;
}

/**
 * Give `m` its texture set's maps through custom nodes.
 * @param {{ color, normal, orm, meters: number }} set
 * @param {{ scale?: number, normalScale?: number, offset?: number[], mode?: 'uv' | 'wall',
 *   wear?: 'floor' | 'wall' | 'none', depth?: number, wallX?: number }} o mode 'wall': uv from the
 *   world (z / y on the wall face) plus each block's offset (instance attribute `aStoneOff`);
 *   depth: parallax depth (m); wear: what wears it
 */
export function applyStone(m, set, { scale = 1, normalScale = 1, offset = [0, 0], mode = 'uv', wear = 'none', depth = 0.02, wallX = 0 } = {}) {
  const rep = scale / set.meters;
  const colorMap = set.color;
  const normalMapTex = set.normal;
  const orm = set.orm;
  const baseUV = Fn((_, builder) => {
    if (mode === 'wall') {
      const n = abs(normalGeometry);
      const wp = positionWorld;
      const projected = select(n.x.greaterThan(0.5), wp.zy, select(n.y.greaterThan(0.5), wp.zx, wp.xy));
      return projected.mul(rep).add(attribute('aStoneOff', 'vec2'));
    }
    // Props without texture coordinates (instanced boxes): projected from the world, along
    // the axis the surface faces.
    if (builder.geometry?.hasAttribute && !builder.geometry.hasAttribute('uv')) {
      const n = abs(normalWorld);
      const wp = positionWorld;
      return select(n.x.greaterThan(0.5), wp.zy, select(n.y.greaterThan(0.5), wp.xz, wp.xy)).mul(rep);
    }
    return uv().mul(rep).add(vec2(offset[0], offset[1]));
  })().toVar('stoneBaseUV');

  // The surface frame from screen-space derivatives (any mapping, mirrored or not): view space.
  const N = normalize(normalView).toVar('stoneN');
  const dp1 = dFdx(positionView);
  const dp2 = dFdy(positionView);
  const gx = dFdx(baseUV).toVar('stoneGx');
  const gy = dFdy(baseUV).toVar('stoneGy');
  const dp2perp = cross(dp2, N);
  const dp1perp = cross(N, dp1);
  const T0 = dp2perp.mul(gx.x).add(dp1perp.mul(gy.x));
  const B0 = dp2perp.mul(gx.y).add(dp1perp.mul(gy.y));
  const inv = inverseSqrt(max(max(dot(T0, T0), dot(B0, B0)), 1e-20));
  const T = T0.mul(inv).toVar('stoneT');
  const B = B0.mul(inv).toVar('stoneB');
  const dist = length(positionWorld.sub(cameraPosition));

  // Parallax occlusion: march into the height field (the AO channel: cavities are deep) along
  // the view ray, then refine between the last two steps. Close up only.
  const puv = Fn(() => {
    const result = vec2(baseUV).toVar();
    const strength = STONE.parallax.mul(smoothstep(28, 12, dist)).toVar();
    If(strength.greaterThan(0.01), () => {
      const v = normalize(positionView.negate());
      const vt = vec3(dot(v, T), dot(v, B), dot(v, N));
      const steps = 12;
      const layer = float(1 / steps);
      // The full shift for the deepest point, in uv (uv per meter: rep).
      const shift = vt.xy.div(vt.z.max(0.25)).mul(depth * rep).mul(strength);
      const delta = shift.div(steps).toVar();
      const cur = vec2(baseUV).toVar();
      const d = float(0).toVar();
      const h = float(0).toVar();
      h.assign(float(1).sub(texture(orm, cur).grad(gx, gy).r));
      Loop(steps, () => {
        If(d.greaterThanEqual(h), () => {
          Break();
        });
        cur.subAssign(delta);
        d.addAssign(layer);
        h.assign(float(1).sub(texture(orm, cur).grad(gx, gy).r));
      });
      const prev = cur.add(delta);
      const after = h.sub(d);
      const before = float(1).sub(texture(orm, prev).grad(gx, gy).r).sub(d.sub(layer));
      const w = after.div(after.sub(before).min(-1e-4));
      result.assign(mix(cur, prev, w.clamp()));
    });
    return result;
  })().toVar('stoneUV');

  const albedo = texture(colorMap, puv).grad(gx, gy);
  const ormS = texture(orm, puv).grad(gx, gy);
  const nt = texture(normalMapTex, puv).grad(gx, gy).xyz.mul(2).sub(1);
  const mapped = normalize(T.mul(nt.x.mul(normalScale)).add(B.mul(nt.y.mul(normalScale))).add(N.mul(nt.z))).toVar('stoneNormal');

  // Close-up detail: fine grain in the relief (a world-space noise bump) and the color.
  const detail = STONE.detail.mul(smoothstep(14, 4, dist)).toVar('stoneDetail');
  const wp = positionWorld;
  const nw = normalWorld;
  const bumped = Fn(() => {
    const n = mapped.toVar();
    If(detail.greaterThan(0.01), () => {
      const e = 0.006;
      const noise = (p) => mx_fractal_noise_float(p.mul(11), 3, 2.1, 0.5);
      const h0 = noise(wp);
      const g = vec3(noise(wp.add(vec3(e, 0, 0))).sub(h0), noise(wp.add(vec3(0, e, 0))).sub(h0), noise(wp.add(vec3(0, 0, e))).sub(h0)).div(e);
      // The tangential part of the gradient tilts the normal (world -> view).
      const gt = g.sub(nw.mul(dot(g, nw)));
      const tilt = transformNormalToView(gt);
      n.assign(normalize(n.sub(tilt.mul(0.006).mul(detail))));
    });
    return n;
  })();

  // Wear and grime (world positions: the plaza's own layout).
  const tint = uniform(m.color);
  const baseRough = m.roughness;
  const surface = Fn(() => {
    // Declare the shared values here, at the top of the fragment shader (the color is built
    // first; a var first used inside a branch would only exist there).
    for (const v of [baseUV, N, gx, gy, T, B, puv, detail]) v.toStack();
    const base = albedo.rgb.mul(tint).toVar();
    const rough = ormS.g.mul(baseRough).toVar();
    const low = mx_noise_float(wp.mul(0.35)).mul(0.5).add(0.5); // large patches
    const fine = mx_noise_float(wp.mul(3.1)).mul(0.5).add(0.5);
    if (wear === 'floor' || wear === 'wall') {
      // Up-facing: paving polished by feet, most near the wall and in the plaza's middle.
      const up = smoothstep(0.6, 0.9, nw.y);
      const nearWall = smoothstep(-26, -4, wp.x);
      const walkways = smoothstep(0.45, 0.8, low);
      const polish = up.mul(max(nearWall.mul(0.75), walkways.mul(0.55))).mul(fine.mul(0.4).add(0.6)).toVar();
      rough.assign(mix(rough, rough.mul(0.42), polish));
      base.mulAssign(mix(float(1), float(0.9), polish));
      // Grime at the foot of walls (and in the joints: the height field's low spots).
      const side = float(1).sub(up);
      const foot = side.mul(smoothstep(0.55, 0.0, wp.y)).mul(0.35);
      const joints = smoothstep(0.55, 0.15, ormS.r).mul(0.25);
      base.mulAssign(float(1).sub(foot).mul(float(1).sub(joints.mul(up.mul(0.6).add(0.4)))));
    }
    if (wear === 'wall') {
      // Hands on the stones at the prayer area: darker, warmer, smoother between ~0.8 and 2.1 m.
      const front = smoothstep(wallX - 1.2, wallX - 0.2, wp.x).mul(smoothstep(0.5, 0.8, abs(nw.x)));
      const reach = smoothstep(0.75, 1.05, wp.y).mul(smoothstep(2.25, 1.85, wp.y));
      const section = smoothstep(-30, -27, wp.z).mul(smoothstep(30, 27, wp.z));
      const touch = front.mul(reach).mul(section).mul(fine.mul(0.5).add(0.5)).mul(0.8).toVar();
      base.assign(mix(base, base.mul(vec3(0.78, 0.72, 0.62)), touch));
      rough.assign(mix(rough, float(0.5), touch));
    }
    // Fine color grain up close.
    base.mulAssign(float(1).add(fine.sub(0.5).mul(0.12).mul(detail)));
    return vec4(base, rough);
  })().toVar('stoneSurface');

  m.colorNode = vec4(surface.rgb, 1);
  m.roughnessNode = surface.a.clamp(0.04, 1);
  m.metalnessNode = float(0);
  m.normalNode = bumped;
  m.aoNode = mix(float(1), ormS.r, 0.8);
  m.needsUpdate = true;
}
