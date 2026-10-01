import { BlendMode, Color, HalfFloatType, MaterialBlending, NodeMaterial, PassNode, QuadMesh, RenderPipeline, RenderTarget, UnsignedByteType, Vector4 } from 'three/webgpu';
import {
  Fn,
  If,
  Loop,
  clamp,
  unpackRGBToNormal,
  convertToTexture,
  diffuseColor,
  packNormalToRGB,
  dot,
  float,
  fract,
  int,
  interleavedGradientNoise,
  length,
  max,
  metalness,
  min,
  mix,
  mrt,
  normalView,
  output,
  pass,
  renderOutput,
  roughness,
  sample,
  screenCoordinate,
  screenUV,
  sin,
  smoothstep,
  uniform,
  uniformArray,
  uv,
  vec2,
  vec3,
  vec4,
  velocity,
} from 'three/tsl';
import { traa } from 'three/addons/tsl/display/TRAANode.js';
import { fxaa } from 'three/addons/tsl/display/FXAANode.js';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { ssgi } from 'three/addons/tsl/display/SSGINode.js';
import { sss } from 'three/addons/tsl/display/SSSNode.js';
import { dof } from 'three/addons/tsl/display/DepthOfFieldNode.js';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { lensflare } from 'three/addons/tsl/display/LensflareNode.js';
import { gaussianBlur } from 'three/addons/tsl/display/GaussianBlurNode.js';
import { Volumetrics } from './Volumetrics.js';
import { StoneReflections } from './StoneReflections.js';

export const MAX_HEAT = 8; // heat-distortion sources at once (explosions, the launcher, fires)

const LUMA = vec3(0.2126, 0.7152, 0.0722);
const MATERIAL_BLEND = new BlendMode(MaterialBlending);

/**
 * Bloom's bright pass with a soft knee: what's above the threshold glows in proportion (no
 * light popping in and out of the glow as the exposure moves), easing in over the knee.
 */
const softKnee = Fn(({ input, threshold, smoothWidth }) => {
  const v = dot(input.rgb, LUMA);
  const s = clamp(v.sub(threshold).add(smoothWidth), 0, smoothWidth.mul(2));
  const curve = s.mul(s).div(smoothWidth.mul(4).add(1e-5));
  return vec4(input.rgb.mul(max(curve, v.sub(threshold)).div(max(v, 1e-5))), 1);
});

/**
 * A pass that always clears to transparent: the weapon's pass is composited by its alpha, and
 * a pass first drawn from inside another (off-screen) pass would otherwise clear to opaque
 * black (three resets the clear color there).
 */
class TransparentPass extends PassNode {
  updateBefore(frame) {
    const r = frame.renderer;
    r.getClearColor(_clear);
    const alpha = r.getClearAlpha();
    r.setClearColor(0x000000, 0);
    const out = super.updateBefore(frame);
    r.setClearColor(_clear, alpha);
    return out;
  }
}
const _clear = new Color();

/**
 * The frame (three's node-based RenderPipeline): the world in one pass (HDR, with normals,
 * velocity, diffuse and metal / roughness as extra outputs for the screen-space effects) ->
 * ambient occlusion (GTAO) or screen-space GI (bounced light + AO) -> contact shadows ->
 * reflections on polished stone -> volumetric haze (the floodlights' beams) -> temporal
 * anti-aliasing (TRAA; TAAU when the resolution drops) -> depth of field (aiming,
 * conversations) -> motion blur -> the weapon on top (its own pass, MSAA) -> heat distortion
 * and the suppression smear -> eye adaptation (exposure) -> bloom and lens flares -> filmic
 * tone mapping -> the color grade (night), vignette, film grain. Every effect follows the
 * graphics settings (core/Graphics.js); the pipeline is rebuilt when they change.
 */
export class PostFX {
  /**
   * @param {import('three/webgpu').WebGPURenderer} renderer
   * @param {{ quality: object, effects: object, environment: import('../world/Environment.js').Environment }} o
   */
  constructor(renderer, scene, camera, viewScene, viewCamera, { quality, effects, environment }) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.viewScene = viewScene;
    this.viewCamera = viewCamera;
    this.environment = environment;
    // Live parameters (uniforms survive rebuilds).
    this.u = {
      exposure: uniform(1),
      night: uniform(0),
      suppression: uniform(0),
      time: uniform(0),
      dofAmount: uniform(0),
      focus: uniform(10),
      focalLength: uniform(3),
      bokeh: uniform(2),
      motion: uniform(0.5),
      aoStrength: uniform(0.85),
      giStrength: uniform(0.08),
      contact: uniform(0.4),
      bloomStrength: uniform(0.35),
      flare: uniform(0.08),
      grain: uniform(0.035),
      vignette: uniform(0.22),
      contrast: uniform(1.06),
      saturation: uniform(0.93),
      warm: uniform(0.035),
      heatCount: uniform(0, 'int'),
    };
    // Heat sources: screen-space (uv x, y, radius in uv, strength) + their depth (view z).
    this.heat = Array.from({ length: MAX_HEAT }, () => new Vector4());
    this.heatDepth = Array.from({ length: MAX_HEAT }, () => new Vector4());
    this.u.heatU = uniformArray(this.heat, 'vec4');
    this.u.heatDepthU = uniformArray(this.heatDepth, 'vec4');
    this.volumetrics = new Volumetrics(environment);
    this.reflections = new StoneReflections();
    this.pipeline = new RenderPipeline(renderer);
    this.pipeline.outputColorTransform = false; // tone mapping + sRGB happen in the chain (the grade comes after)
    this.resolutionScale = 1;
    this._exposureTarget = 1;
    this._lumTimer = 0;
    this._lumPending = false;
    this.setQuality(quality, effects);
  }

  /** A preset (core/Graphics.js QUALITY) and the effects on / off: rebuild the chain. */
  setQuality(q, effects) {
    this.q = q;
    this.e = { ...effects };
    this._build();
    const n = this._night;
    this._night = undefined;
    if (n !== undefined) this.setNight(n);
  }

  _build() {
    const { scene, camera, q, u } = this;
    // What the device can write at once: drop the reflections, then the bounced light, if the
    // world pass's images wouldn't fit (8 bytes each, counted per sample).
    const e = { ...this.e };
    const limit = this.renderer.backend?.device?.limits?.maxColorAttachmentBytesPerSample ?? Infinity;
    const bytes = () => 8 * (1 + (e.ao || e.ssgi || e.ssr ? 1 : 0) + (e.aa || e.motionBlur !== 'off' ? 1 : 0) + (e.ssgi ? 1 : 0) + (e.ssr ? 1 : 0));
    if (bytes() > limit) e.ssr = false;
    if (bytes() > limit) e.ssgi = false;
    this._disposeNodes();
    this._motionStrength = 0;
    const scenePass = pass(scene, camera);
    const wantNormal = e.ao || e.ssgi || e.ssr;
    const wantVelocity = e.aa || e.motionBlur !== 'off';
    // The extra images are written with alpha 0 and blended like the material: opaque surfaces
    // write them as they are, transparent ones (smoke, dust, sparks, flashes) leave them
    // untouched (else a puff of smoke would stamp its quad's normals into the AO and GI).
    const outputs = { output };
    if (wantNormal) outputs.normal = vec4(packNormalToRGB(normalView), 0);
    if (wantVelocity) outputs.velocity = vec4(velocity, 0, 0);
    if (e.ssgi) outputs.diffuseColor = vec4(diffuseColor.rgb, 0);
    if (e.ssr) outputs.metalrough = vec4(metalness, roughness, 0, 0);
    const targets = mrt(outputs);
    for (const k of Object.keys(outputs)) if (k !== 'output') targets.setBlendMode(k, MATERIAL_BLEND);
    scenePass.setMRT(targets);
    // Bandwidth: 8 bits are plenty for normals, albedo, metal / roughness.
    for (const k of ['normal', 'diffuseColor', 'metalrough']) if (outputs[k]) scenePass.getTexture(k).type = UnsignedByteType;
    this.scenePass = scenePass;
    const color = scenePass.getTextureNode('output');
    const depth = scenePass.getTextureNode('depth');
    const normal = wantNormal ? sample((p) => unpackRGBToNormal(scenePass.getTextureNode('normal').sample(p).rgb)) : null;
    const nodes = (this._nodes = []);
    const keep = (n) => (nodes.push(n), n);

    // Indirect light: screen-space GI (bounce + AO), else GTAO.
    let world = color;
    if (e.ssgi) {
      const gi = keep(ssgi(color, depth, normal, camera));
      gi.sliceCount.value = q.ssgi?.slices ?? 2;
      gi.stepCount.value = q.ssgi?.steps ?? 8;
      gi.radius.value = 6;
      gi.thickness.value = 0.6;
      if ('useTemporalFiltering' in gi) gi.useTemporalFiltering = !!e.aa;
      const albedo = scenePass.getTextureNode('diffuseColor');
      world = vec4(color.rgb.mul(mix(float(1), gi.a, u.aoStrength)).add(albedo.rgb.mul(gi.rgb).mul(u.giStrength)), color.a);
    } else if (e.ao) {
      const a = keep(ao(depth, normal, camera));
      a.resolutionScale = q.aoScale ?? 0.5;
      a.radius.value = 0.7;
      a.distanceExponent.value = 1.4;
      a.thickness.value = 1.2;
      a.samples.value = q.aoSamples ?? 12;
      if ('useTemporalFiltering' in a) a.useTemporalFiltering = !!e.aa;
      world = vec4(color.rgb.mul(mix(float(1), a.getTextureNode().r, u.aoStrength)), color.a);
    }
    // Contact shadows: short screen-space rays toward the key light (feet on the stone).
    if (e.contactShadows && this.environment.keyLight) {
      const s = keep(sss(depth, camera, this.environment.keyLight));
      s.maxDistance.value = 0.35;
      s.thickness.value = 0.02;
      s.quality.value = 0.4;
      if ('useTemporalFiltering' in s) s.useTemporalFiltering = !!e.aa;
      world = vec4(world.rgb.mul(mix(float(1), s.getTextureNode().r, u.contact)), world.a);
    }
    // Reflections on the polished paving (the material's roughness decides how much).
    if (e.ssr) {
      const mr = scenePass.getTextureNode('metalrough');
      const refl = this.reflections.build(color, depth, normal, mr, camera, { steps: q.ssrSteps ?? 24, scale: q.ssrScale ?? 0.5 });
      world = vec4(world.rgb.add(refl), world.a);
    }
    // The haze in the floodlights' beams (and the lamps' halos).
    if (e.haze) {
      const h = this.volumetrics.build(depth, camera, q.hazeSteps ?? 16, q.hazeScale ?? 0.5);
      world = vec4(world.rgb.add(h), world.a);
    }

    // Anti-aliasing: temporal (jittered frames accumulated with motion vectors; it also
    // smooths the reduced resolution while the frame rate dips, see setResolutionScale).
    const vel = wantVelocity ? scenePass.getTextureNode('velocity') : null;
    let image = world;
    if (e.aa) image = keep(traa(world, depth, vel, camera));

    // Depth of field: aiming (the target sharp, the rest a little soft) and close conversations.
    if (e.dof) {
      const d = keep(dof(image, scenePass.getViewZNode(), u.focus, u.focalLength, u.bokeh));
      image = mix(image, d, u.dofAmount);
    }
    // Motion blur: the camera turning fast, fast things moving.
    if (e.motionBlur !== 'off') {
      const high = e.motionBlur === 'high';
      this._motionStrength = high ? 0.6 : 0.35;
      image = this._motionBlur(convertToTexture(image), vel, high ? 12 : 8, high ? 0.03 : 0.02);
    }

    // The weapon (its own scene and camera, MSAA, no screen-space effects) over the world.
    const vmPass = new TransparentPass(PassNode.COLOR, this.viewScene, this.viewCamera, { samples: 4 });
    this.vmPass = vmPass;
    const vm = vmPass.getTextureNode('output');
    const over = vec4(image.rgb.mul(float(1).sub(vm.a)).add(vm.rgb).clamp(0, 30000), 1);
    const hdr = convertToTexture(over); // (half float)
    this.hdr = hdr;

    // Display: heat shimmer and the suppression smear (they move the lookup), the exposure,
    // bloom and lens flares, tone mapping, the grade.
    const heat = e.heat ? this._heatOffset(scenePass.getViewZNode(), vm) : null;
    const display = Fn(() => {
      const p = uv().toVar();
      if (heat) p.addAssign(heat());
      const c = hdr.sample(p).rgb.toVar();
      // Suppression: a radial smear toward the center, growing to the edges.
      If(u.suppression.greaterThan(0.002), () => {
        const d = p.sub(0.5);
        const r = length(d.mul(vec2(1.78, 1))).div(0.89);
        const m = smoothstep(0.32, 0.95, r).mul(u.suppression);
        const acc = vec3(0).toVar();
        Loop(8, ({ i }) => {
          acc.addAssign(hdr.sample(p.sub(d.mul(float(i).div(7)).mul(0.06).mul(m))).rgb);
        });
        c.assign(mix(c, acc.div(8), m.mul(1.4).min(1)).mul(float(1).sub(m.mul(0.28))));
      });
      return vec4(c.mul(u.exposure), 1);
    })();
    let lit = display;
    if (e.bloom) {
      const b = keep(bloom(display, 1, 0.45, 1.2));
      b.strength.value = 1;
      b.smoothWidth.value = 0.6; // (the knee)
      b.highPassFn = softKnee;
      this._bloom = b;
      lit = lit.add(b.mul(u.bloomStrength));
      if (e.lensFlare) {
        // Ghosts of small, intense sources only (lamp heads, flashes), not of the lit wall.
        const f = keep(lensflare(b, { ghostTint: vec3(0.95, 0.92, 0.9), threshold: float(1.4), ghostSamples: float(4), ghostSpacing: float(0.26), ghostAttenuationFactor: float(26), downSampleRatio: 4 }));
        lit = lit.add(gaussianBlur(f, null, 3, { resolutionScale: 0.5 }).mul(u.flare));
      }
    }
    // Filmic tone mapping into sRGB, then the grade in display space.
    const mapped = renderOutput(lit);
    let graded = Fn(() => {
      const col = mapped.rgb.toVar();
      const l = dot(col, LUMA);
      col.assign(mix(vec3(l), col, u.saturation));
      col.assign(col.sub(0.5).mul(u.contrast).add(0.5));
      // Split tone: warm highlights, cool shadows.
      col.addAssign(vec3(u.warm, u.warm.mul(0.35), u.warm.mul(-0.6)).mul(smoothstep(0.35, 1, l)));
      col.addAssign(vec3(u.warm.mul(-0.4), 0, u.warm.mul(0.5)).mul(float(1).sub(smoothstep(0, 0.4, l))));
      if (e.vignette) {
        const d = uv().sub(0.5);
        col.mulAssign(float(1).sub(u.vignette.mul(smoothstep(0.35, 0.85, length(d.mul(vec2(1.25, 1)))))));
      }
      if (e.grain) {
        // Fine luminance grain, stronger in the darks, a new pattern every frame.
        const n = fract(sin(dot(uv().mul(vec2(1229.3, 777.1)).add(fract(u.time.mul(17.3))), vec2(12.9898, 78.233))).mul(43758.5453));
        col.addAssign(n.sub(0.5).mul(u.grain).mul(float(1).sub(l.mul(0.7))));
      }
      return vec4(clamp(col, 0, 1), 1);
    })();
    if (!e.aa) graded = fxaa(graded);
    this.pipeline.outputNode = graded;
    this.pipeline.needsUpdate = true;
    this._setupLuminance();
  }

  /**
   * Motion blur along each pixel's motion over the frame (screen space: the camera turning,
   * things moving), scaled to a fixed shutter time (u.motion, see render()) so it doesn't
   * grow when the frame rate drops. Jittered per pixel (smooth streaks, no stepped copies);
   * skipped where nothing moves.
   */
  _motionBlur(src, vel, samples, maxLength) {
    const u = this.u;
    return Fn(() => {
      const p = uv();
      const out = src.sample(p).toVar();
      // NDC motion -> uv, the shutter's share, limited.
      const v = vel.sample(p).xy.mul(vec2(0.5, -0.5)).mul(u.motion).toVar();
      const len = length(v);
      v.mulAssign(min(float(1), float(maxLength).div(len.max(1e-6))));
      If(len.greaterThan(0.0006), () => {
        const j = interleavedGradientNoise(screenCoordinate).sub(0.5);
        const acc = vec4(0).toVar();
        Loop(samples, ({ i }) => {
          const t = float(i).add(0.5).add(j).div(samples).sub(0.5);
          acc.addAssign(src.sample(p.add(v.mul(t))));
        });
        out.assign(acc.div(samples));
      });
      return out;
    })();
  }

  /** The heat shimmer's lookup offset (uv): animated noise around each source, only behind it. */
  _heatOffset(viewZ, vm) {
    const u = this.u;
    return Fn(() => {
      const p = uv();
      const off = vec2(0).toVar();
      Loop(u.heatCount, ({ i }) => {
        const h = u.heatU.element(i);
        const hd = u.heatDepthU.element(i);
        const d = p.sub(h.xy).mul(vec2(1.78, 1));
        const r = length(d).div(h.z.max(1e-4));
        const fall = smoothstep(1, 0.15, r);
        // Only what's behind the source shimmers (and only the world, not the weapon).
        const behind = smoothstep(-0.5, 1.5, hd.x.sub(viewZ).negate());
        const w = fall.mul(h.w).mul(behind);
        const t = u.time.mul(9);
        const n = vec2(sin(p.y.mul(160).add(t).add(sin(p.x.mul(90).sub(t.mul(0.7))))), sin(p.x.mul(140).sub(t.mul(1.3)).add(sin(p.y.mul(70).add(t)))));
        off.addAssign(n.mul(w).mul(0.0035));
      });
      return off.mul(float(1).sub(vm.a));
    });
  }

  /** Eye adaptation: the scene's brightness read back from a tiny copy every quarter second. */
  _setupLuminance() {
    if (!this._lumRT) {
      this._lumRT = new RenderTarget(32, 18, { type: HalfFloatType });
      this._lumQuad = new QuadMesh(new NodeMaterial());
    }
    const hdr = this.hdr;
    // Each texel: the log luminance of its patch of the frame (center-weighted later).
    this._lumQuad.material.fragmentNode = Fn(() => {
      const acc = float(0).toVar();
      for (let y = 0; y < 3; y++) {
        for (let x = 0; x < 3; x++) {
          const c = hdr.sample(screenUV.add(vec2((x - 1) / 96, (y - 1) / 54))).rgb;
          acc.addAssign(dot(c, LUMA).add(1e-4).log());
        }
      }
      return vec4(acc.div(9), 0, 0, 1);
    })();
    this._lumQuad.material.needsUpdate = true;
    this._lumData = new Uint16Array(32 * 18 * 4);
  }

  _readLuminance() {
    if (this._lumPending || !this.e.eyeAdaptation) return;
    const r = this.renderer;
    r.setRenderTarget(this._lumRT);
    this._lumQuad.render(r);
    r.setRenderTarget(null);
    this._lumPending = true;
    r.readRenderTargetPixelsAsync(this._lumRT, 0, 0, 32, 18)
      .then((data) => {
        // Center-weighted log average (half-floats).
        let sum = 0;
        let wsum = 0;
        for (let y = 0; y < 18; y++) {
          for (let x = 0; x < 32; x++) {
            const v = data instanceof Float32Array ? data[(y * 32 + x) * 4] : halfToFloat(data[(y * 32 + x) * 4]);
            const dx = (x + 0.5) / 32 - 0.5;
            const dy = (y + 0.5) / 18 - 0.5;
            const w = Math.exp(-(dx * dx * 3 + dy * dy * 5) * 4);
            sum += v * w;
            wsum += w;
          }
        }
        const avg = Math.exp(sum / Math.max(1e-6, wsum));
        if (!Number.isFinite(avg)) return;
        // Mid grey at the average, within limits (adaptation is a nudge, not a light meter).
        const A = this.adapt;
        this.avgLuminance = avg;
        // Partial adaptation (a power under 1/2): dark corners open up but stay dark.
        this._exposureTarget = Math.min(A.max, Math.max(A.min, (A.key / Math.max(1e-5, avg)) ** 0.4));
      })
      .catch(() => {})
      .finally(() => (this._lumPending = false));
  }

  /**
   * Night (0..1): a stronger glow around lights and flashes, the grade a little cooler in the
   * shadows and warmer in the light (sodium lamps against the night), more vignette.
   */
  setNight(n) {
    if (n === this._night) return;
    this._night = n;
    const u = this.u;
    u.night.value = n;
    u.bloomStrength.value = 0.32 + 0.22 * n;
    u.warm.value = 0.035 + 0.02 * n;
    u.saturation.value = 0.93 - 0.06 * n;
    u.vignette.value = 0.2 + 0.1 * n;
    u.flare.value = 0.04 + 0.05 * n;
    u.grain.value = 0.025 + 0.02 * n;
    // Eye adaptation's range: darker nights open the eyes more.
    this.adapt = { key: 0.16 - 0.03 * n, min: 0.72, max: 1.6 - 0.25 * n };
  }

  /** 0..1: how blurred the edges are (suppression, from the audio's state). */
  setSuppression(amount) {
    this.u.suppression.value = amount;
  }

  /**
   * Depth of field: `amount` 0..1, focused at `distance` m (aiming: the aim point;
   * conversations: the speaker).
   */
  setFocus(distance, amount) {
    const u = this.u;
    u.focus.value += (Math.max(0.5, distance) - u.focus.value) * 0.25;
    u.dofAmount.value = amount;
  }

  /** Heat sources this frame: [{ x, y (uv), radius (uv), strength, viewZ }]. */
  setHeat(list) {
    const n = Math.min(MAX_HEAT, list.length);
    for (let i = 0; i < n; i++) {
      const h = list[i];
      this.heat[i].set(h.x, h.y, h.radius, h.strength);
      this.heatDepth[i].set(h.viewZ, 0, 0, 0);
    }
    this.u.heatCount.value = n;
  }

  /**
   * Dynamic resolution: the frame's internal resolution (a share of the base pixel ratio); the
   * temporal anti-aliasing smooths the change. `basePixelRatio`: what the preset asks for.
   */
  setResolutionScale(s, basePixelRatio) {
    if (Math.abs(s - this.resolutionScale) < 0.01) return;
    this.resolutionScale = s;
    this.renderer.setPixelRatio(basePixelRatio * s);
  }

  /** Drawing-buffer size changed (the passes follow the renderer on their own). */
  setSize() {}

  render(dt) {
    const u = this.u;
    u.time.value += dt;
    // Motion blur as a fixed shutter time (the motion vectors span one frame).
    u.motion.value = (this._motionStrength ?? 0) * Math.min(2, 1 / 60 / Math.max(1e-3, dt));
    this.volumetrics.update();
    this.pipeline.render();
    // Eye adaptation: quicker toward darker views opening up, slower closing (like eyes).
    if (this.e.eyeAdaptation) {
      this._lumTimer -= dt;
      if (this._lumTimer <= 0) {
        this._lumTimer = 0.25;
        this._readLuminance();
      }
      const target = Number.isFinite(this._exposureTarget) ? this._exposureTarget : 1;
      const rate = target > u.exposure.value ? 1.1 : 2.2;
      u.exposure.value += (target - u.exposure.value) * (1 - Math.exp(-rate * dt));
    } else u.exposure.value = 1;
  }

  _disposeNodes() {
    for (const n of this._nodes ?? []) n.dispose?.();
    this._nodes = [];
    this.scenePass?.dispose?.();
    this.vmPass?.dispose?.();
  }
}

/** IEEE half float bits -> number. */
function halfToFloat(h) {
  const s = (h & 0x8000) >> 15;
  const e = (h & 0x7c00) >> 10;
  const f = h & 0x03ff;
  if (e === 0) return (s ? -1 : 1) * 2 ** -14 * (f / 1024);
  if (e === 31) return f ? NaN : (s ? -1 : 1) * Infinity;
  return (s ? -1 : 1) * 2 ** (e - 15) * (1 + f / 1024);
}

