import { HalfFloatType } from 'three/webgpu';
import {
  Break,
  Fn,
  If,
  Loop,
  dot,
  float,
  frameId,
  getViewPosition,
  interleavedGradientNoise,
  max,
  min,
  normalize,
  pow,
  reflect,
  rtt,
  screenCoordinate,
  smoothstep,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { cameraUniforms } from './postCamera.js';

/**
 * Reflections on the polished paving (a post pass at reduced resolution): for floor pixels
 * smooth enough to mirror (their roughness from the world pass), the reflected view ray is
 * marched through the depth buffer; where it passes behind something the scene's color there
 * is reflected, weighted by Fresnel (stone: F0 0.04, strong only at grazing angles), the
 * surface's smoothness, how far the ray went and the screen's edges. Jittered per pixel and
 * frame (the temporal anti-aliasing smooths it). Adds the floodlights, lamps and people
 * mirrored in the stone; the material's own image-based reflections carry the rest.
 */
export class StoneReflections {
  constructor() {
    this.u = { intensity: uniform(1), maxRough: uniform(0.62) };
  }

  /**
   * @returns {import('three/webgpu').Node} vec3: the reflected light to add
   * @param {object} color texture node of the world pass  @param {object} depth its depth
   * @param {object} normal view-space normal (sampled at a uv)  @param {object} rough roughness texture channel
   * @param {import('three/webgpu').Camera} camera the scene's camera
   */
  build(color, depth, normal, rough, camera, { steps = 24, scale = 0.5 } = {}) {
    const u = this.u;
    const cam = cameraUniforms(camera);
    const trace = Fn(() => {
      const p = uv();
      const out = vec4(0).toVar();
      const r = rough.sample(p).g;
      const d = depth.sample(p).r;
      If(r.lessThan(u.maxRough).and(d.lessThan(0.9999)), () => {
        const P = vec3(getViewPosition(p, d, cam.projectionInverse)).toVar();
        const N = normalize(normal.sample(p)).toVar();
        // Floors only (the normal pointing up in the world).
        const up = cam.view.mul(vec4(0, 1, 0, 0)).xyz;
        If(dot(N, up).greaterThan(0.85), () => {
          const V = normalize(P);
          const R = reflect(V, N).toVar();
          const jitter = interleavedGradientNoise(screenCoordinate.add(float(frameId).mul(5.588)));
          const t = float(0.15).add(jitter.mul(0.25)).toVar();
          const hit = vec2(0).toVar();
          const found = float(0).toVar();
          Loop(steps, () => {
            const q = vec3(P.add(R.mul(t)));
            const clip = cam.projection.mul(vec4(q, 1));
            const s = clip.xy.div(clip.w).mul(vec2(0.5, -0.5)).add(0.5);
            If(s.x.lessThan(0).or(s.x.greaterThan(1)).or(s.y.lessThan(0)).or(s.y.greaterThan(1)).or(clip.w.lessThan(0.05)), () => {
              Break();
            });
            const sceneP = getViewPosition(s, depth.sample(s).r, cam.projectionInverse);
            // Behind what's there (within a slab): a hit.
            const behind = sceneP.z.sub(q.z);
            If(behind.greaterThan(0).and(behind.lessThan(t.mul(0.08).add(0.25))), () => {
              hit.assign(s);
              found.assign(1);
              Break();
            });
            t.mulAssign(1.22);
            t.addAssign(0.08);
          });
          If(found.greaterThan(0), () => {
            const cosT = max(dot(V.negate(), N), 0);
            const fresnel = float(0.04).add(float(0.96).mul(pow(float(1).sub(cosT), 5)));
            const smooth = smoothstep(u.maxRough, 0.15, r);
            const edge = smoothstep(0, 0.12, min(min(hit.x, float(1).sub(hit.x)), min(hit.y, float(1).sub(hit.y))));
            const fade = smoothstep(45, 8, t);
            const w = fresnel.mul(smooth).mul(edge).mul(fade).mul(u.intensity);
            out.assign(vec4(color.sample(hit).rgb.mul(w), w));
          });
        });
      });
      return out;
    });
    const tex = rtt(trace(), null, null, { type: HalfFloatType, resolutionScale: scale });
    this.texture = tex;
    return tex.rgb;
  }
}

