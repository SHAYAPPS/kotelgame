import { HalfFloatType, Vector2, WebGLRenderTarget } from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FAR_LAYER } from '../characters/config.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/**
 * Subtle color grade in display space: a touch of contrast, warm highlights and cool
 * shadows (sunlit stone vs shade), slightly muted saturation, and a soft vignette.
 */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    contrast: { value: 1.06 },
    saturation: { value: 0.93 },
    warm: { value: 0.035 },
    vignette: { value: 0.22 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float contrast, saturation, warm, vignette;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, saturation);
      col = (col - 0.5) * contrast + 0.5;
      // Split tone: warm highlights, cool shadows.
      col += vec3(warm, warm * 0.35, -warm * 0.6) * smoothstep(0.35, 1.0, l);
      col += vec3(-warm * 0.4, 0.0, warm * 0.5) * (1.0 - smoothstep(0.0, 0.4, l));
      vec2 d = vUv - 0.5;
      col *= 1.0 - vignette * smoothstep(0.35, 0.85, length(d * vec2(1.25, 1.0)));
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), c.a);
    }
  `,
};

/**
 * Suppression: under heavy fire the edges of the view smear (a radial blur that grows toward
 * the borders) and darken a little. Off (the pass disabled) when not suppressed.
 */
const SuppressionShader = {
  uniforms: {
    tDiffuse: { value: null },
    amount: { value: 0 },
    aspect: { value: 1.78 },
    texel: { value: new Vector2(1 / 1920, 1 / 1080) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float amount, aspect;
    uniform vec2 texel;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 d = vUv - 0.5;
      float r = length(d * vec2(aspect, 1.0)) / (0.5 * aspect);
      float m = smoothstep(0.32, 0.95, r) * amount;
      if (m < 0.002) { gl_FragColor = c; return; }
      // Radial smear toward the center plus a small ring of taps.
      vec3 acc = vec3(0.0);
      for (int i = 0; i < 8; i++) {
        float t = float(i) / 7.0;
        acc += texture2D(tDiffuse, vUv - d * t * 0.06 * m).rgb;
      }
      vec2 o = texel * 7.0 * m;
      acc += texture2D(tDiffuse, vUv + vec2(o.x, 0.0)).rgb + texture2D(tDiffuse, vUv - vec2(o.x, 0.0)).rgb;
      acc += texture2D(tDiffuse, vUv + vec2(0.0, o.y)).rgb + texture2D(tDiffuse, vUv - vec2(0.0, o.y)).rgb;
      acc /= 12.0;
      vec3 col = mix(c.rgb, acc, min(1.0, m * 1.4));
      col *= 1.0 - 0.28 * m;
      gl_FragColor = vec4(col, c.a);
    }
  `,
};

/**
 * The frame: world (HDR, MSAA) -> ambient occlusion -> the weapon on top (depth cleared,
 * no AO on it) -> bloom (only really bright things: flashes, fire, the sun) -> filmic tone
 * mapping + sRGB -> color grade.
 */
export class PostFX {
  constructor(renderer, scene, camera, viewScene, viewCamera, quality) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.viewScene = viewScene;
    this.viewCamera = viewCamera;
    this.setQuality(quality);
  }

  setQuality(q) {
    this.q = q;
    if (this.composer) {
      this.composer.renderTarget1.dispose();
      this.composer.renderTarget2.dispose();
      for (const p of this.composer.passes) p.dispose?.();
    }
    const size = this.renderer.getDrawingBufferSize(new Vector2());
    const rt = new WebGLRenderTarget(size.x, size.y, { type: HalfFloatType, samples: q.msaa });
    const composer = new EffectComposer(this.renderer, rt);
    composer.setPixelRatio(1); // the renderer's pixel ratio is already in the drawing buffer size
    this.composer = composer;

    composer.addPass(new RenderPass(this.scene, this.camera));
    this.ao = null;
    if (q.ao !== 'off') {
      this.ao = new GTAOPass(this.scene, this.camera, size.x, size.y);
      this.ao.blendIntensity = 0.85;
      this.ao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.4, thickness: 1.2, scale: 1, samples: q.ao === 'full' ? 16 : 8 });
      this.ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: q.ao === 'full' ? 16 : 8 });
      // The AO prepass skips far characters (see characters/config.js aoDistance).
      const renderOverride = this.ao._renderOverride.bind(this.ao);
      this.ao._renderOverride = (...args) => {
        this.camera.layers.disable(FAR_LAYER);
        renderOverride(...args);
        this.camera.layers.enable(FAR_LAYER);
      };
      composer.addPass(this.ao);
    }
    const view = new RenderPass(this.viewScene, this.viewCamera);
    view.clear = false;
    view.clearDepth = true;
    composer.addPass(view);
    this.bloom = null;
    if (q.bloom) {
      this.bloom = new UnrealBloomPass(new Vector2(size.x / 2, size.y / 2), 0.35, 0.5, 3.2);
      composer.addPass(this.bloom);
    }
    composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    composer.addPass(this.grade);
    this.suppression = new ShaderPass(SuppressionShader);
    this.suppression.enabled = false;
    composer.addPass(this.suppression);
    this.setSize(size.x, size.y);
    // The new passes take the current night look.
    const n = this._night;
    this._night = undefined;
    if (n !== undefined) this.setNight(n);
  }

  /**
   * Night (0..1): a stronger glow around lights and flashes, the grade a little cooler in the
   * shadows and warmer in the light (sodium lamps against the night).
   */
  setNight(n) {
    if (n === this._night) return;
    this._night = n;
    if (this.bloom) {
      this.bloom.strength = 0.35 + 0.25 * n;
      this.bloom.threshold = 3.2 - 1.6 * n;
    }
    const u = this.grade?.uniforms;
    if (u) {
      u.warm.value = 0.035 + 0.025 * n;
      u.saturation.value = 0.93 - 0.05 * n;
      u.vignette.value = 0.22 + 0.1 * n;
    }
  }

  /** 0..1: how blurred the edges are (suppression, from the audio's state). */
  setSuppression(amount) {
    const p = this.suppression;
    if (!p) return;
    p.enabled = amount > 0.01;
    p.uniforms.amount.value = amount;
  }

  /** Drawing-buffer size in pixels. */
  setSize(w, h) {
    this.composer.setSize(w, h);
    if (this.suppression) {
      this.suppression.uniforms.aspect.value = w / Math.max(1, h);
      this.suppression.uniforms.texel.value.set(1 / Math.max(1, w), 1 / Math.max(1, h));
    }
    // Half-resolution AO on medium.
    if (this.ao && this.q.ao === 'half') this.ao.setSize(Math.max(1, Math.floor(w / 2)), Math.max(1, Math.floor(h / 2)));
    if (this.bloom) this.bloom.setSize(Math.floor(w / 2), Math.floor(h / 2));
  }

  render(dt) {
    this.composer.render(dt);
  }
}
