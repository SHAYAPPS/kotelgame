import { Color, HalfFloatType, Vector4 } from 'three/webgpu';
import {
  Fn,
  If,
  Loop,
  dot,
  exp,
  float,
  frameId,
  getViewPosition,
  interleavedGradientNoise,
  length,
  max,
  min,
  normalize,
  pow,
  rtt,
  screenCoordinate,
  smoothstep,
  uniform,
  uniformArray,
  uv,
  vec3,
  vec4,
} from 'three/tsl';
import { gaussianBlur } from 'three/addons/tsl/display/GaussianBlurNode.js';
import { cameraUniforms } from './postCamera.js';

export const MAX_BEAMS = 24;

/**
 * Volumetric haze (a post pass at reduced resolution): each pixel's view ray is marched
 * through the night air up to what it hits (or 60 m), gathering the light the haze scatters
 * toward the eye from the lights flagged `volumetric` (the floodlights' cones become visible
 * beams, the lamps get halos, the giant screens a glow) and a little moonlight. Denser near
 * the ground. A forward-scattering phase function: beams brighten looking toward the lights.
 * The march is jittered per pixel and frame; the temporal anti-aliasing smooths it.
 */
export class Volumetrics {
  /** @param {import('../world/Environment.js').Environment} environment */
  constructor(environment) {
    this.env = environment;
    this.data = Array.from({ length: MAX_BEAMS * 3 }, () => new Vector4());
    this.u = {
      lights: uniformArray(this.data, 'vec4'),
      count: uniform(0, 'int'),
      density: uniform(0.012),
      height: uniform(9), // m: the haze thins out above the ground with this scale
      ceiling: uniform(28), // m: and fades out below this height (the air over the rooftops is clear)
      floor: uniform(0),
      level: uniform(0),
      g: uniform(0.45), // forward scattering
      moon: uniform(new Color(0.04, 0.05, 0.08)),
      intensity: uniform(1),
    };
    this._version = -1;
  }

  /** The lights that make beams (from the environment's night lights). */
  _sync() {
    const L = this.env.lights;
    if (L.version === this._version) return;
    this._version = L.version;
    let n = 0;
    // The strongest first (the floodlights' beams before the lamps' halos).
    const list = L.lights.filter((l) => l.volumetric).sort((a, b) => (b.color.r + b.color.g + b.color.b) * b.range - (a.color.r + a.color.g + a.color.b) * a.range);
    for (const l of list) {
      if (n >= MAX_BEAMS) break;
      const o = n * 3;
      this.data[o].set(l.position.x, l.position.y, l.position.z, l.range);
      this.data[o + 1].set(l.color.r, l.color.g, l.color.b, l.cosOuter);
      if (l.direction) this.data[o + 2].set(l.direction.x, l.direction.y, l.direction.z, l.cosInner);
      else this.data[o + 2].set(0, -1, 0, 1);
      n++;
    }
    this.u.count.value = n;
  }

  /** Per frame (the night level, the moon). */
  update() {
    this._sync();
    this.u.level.value = this.env.lights.level;
    const moon = this.env.keyLight;
    if (moon) this.u.moon.value.copy(moon.color).multiplyScalar(moon.intensity * 0.12 * this.env.night);
  }

  /**
   * The scattered light (a vec3 node, sampled at the screen's uv) for the scene pass's depth.
   * @param {number} steps samples along each ray
   * @param {number} scale resolution of the pass (0.25..1)
   */
  build(depthNode, camera, steps = 16, scale = 0.5) {
    this._sync();
    const u = this.u;
    const cam = cameraUniforms(camera);
    const march = Fn(() => {
      const p = uv();
      const depth = depthNode.sample(p).r;
      const viewPos = vec3(getViewPosition(p, depth, cam.projectionInverse));
      const world = cam.world.mul(vec4(viewPos, 1)).xyz;
      const ro = cam.position.toVar();
      const toHit = world.sub(ro);
      const rd = normalize(toHit).toVar();
      const len = min(length(toHit), 60).toVar();
      const dt = len.div(steps).toVar();
      const jitter = interleavedGradientNoise(screenCoordinate.add(float(frameId).mul(5.588)));
      const sum = vec3(0).toVar();
      const g = u.g;
      const g2 = g.mul(g);
      Loop(steps, ({ i }) => {
        const t = float(i).add(jitter).mul(dt);
        const pos = ro.add(rd.mul(t)).toVar();
        // Denser near the ground, gone above the rooftops (no beams streaking across the sky).
        const h = pos.y.sub(u.floor);
        const dens = u.density.mul(exp(max(h, 0).negate().div(u.height))).mul(smoothstep(u.ceiling, u.ceiling.mul(0.55), h));
        const light = u.moon.toVar();
        Loop(u.count, ({ i: k }) => {
          const a = u.lights.element(k.mul(3));
          const L = a.xyz.sub(pos).toVar();
          const d2 = dot(L, L);
          If(d2.lessThan(a.w.mul(a.w)), () => {
            const b = u.lights.element(k.mul(3).add(1));
            const d = d2.sqrt();
            const ld = L.div(d).toVar();
            const cut = float(1).sub(d.div(a.w).pow4()).clamp();
            const att = cut.mul(cut).div(d2.max(0.5)).toVar();
            If(b.w.greaterThan(-1.5), () => {
              const c = u.lights.element(k.mul(3).add(2));
              att.mulAssign(smoothstep(b.w, c.w, dot(ld.negate(), c.xyz)));
            });
            // Henyey-Greenstein: how much of the light turns toward the eye.
            const cosT = dot(rd, ld.negate()).negate();
            const phase = float(1).sub(g2).div(pow(float(1).add(g2).sub(g.mul(2).mul(cosT)), 1.5).mul(12.566));
            light.addAssign(b.rgb.mul(att.mul(phase)));
          });
        });
        sum.addAssign(light.mul(dens).mul(dt));
      });
      return vec4(sum.mul(u.level).mul(u.intensity), 1);
    });
    const tex = rtt(march(), null, null, { type: HalfFloatType, resolutionScale: scale });
    // A light blur at the pass's resolution takes out the march's jitter pattern (haze is soft).
    const soft = gaussianBlur(tex, null, 1, { resolutionScale: scale });
    this.texture = tex;
    this.blur = soft;
    return soft.rgb;
  }
}

