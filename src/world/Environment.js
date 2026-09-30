import {
  BackSide,
  Color,
  EquirectangularReflectionMapping,
  FloatType,
  FogExp2,
  HemisphereLight,
  Mesh,
  PMREMGenerator,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import { CSM } from 'three/addons/csm/CSM.js';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { solarPosition, sunDirection } from './sun.js';

const SKY_ZENITH = new Color(0x3f78c4);
const SKY_HORIZON = new Color(0xc6d8e6);
const GROUND_BELOW = new Color(0x9c9a92);

/**
 * Sky, sunlight and haze.
 * - Sky dome: a gradient with the sun disc and slowly drifting clouds (cheap, sharp at any
 *   resolution), matched to the HDRI.
 * - Image-based light and reflections from a CC0 HDRI (PMREM); the HDRI's own sun is clamped
 *   out because the directional sun below casts the real light and shadows.
 * - The sun: placed from the time of day (see ./sun.js); cascaded shadow maps (CSM) cover the
 *   whole view with sharp shadows near you. Every lit material in the scene has to be set up
 *   for CSM; `prepare()` does that for anything new each frame.
 * - Haze: exponential fog tinted like the horizon.
 */
export class Environment {
  /**
   * @param {import('three').Scene} scene
   * @param {import('three').WebGLRenderer} renderer
   * @param {import('three').PerspectiveCamera} camera
   * @param {object} o  level lighting config: { sun: { lat, lon, date, time, utcOffset } | sunOffset,
   *   hdri, fogDensity, sunIntensity, envIntensity }
   * @param {object} quality a preset from src/core/Graphics.js
   */
  constructor(scene, renderer, camera, o = {}, quality) {
    this.scene = scene;
    this.renderer = renderer;
    this.camera = camera;
    this.o = o;
    this.sunDir = new Vector3();
    if (o.sun) sunDirection(solarPosition(o.sun), this.sunDir);
    else this.sunDir.set(...(o.sunOffset ?? [35, 70, 45])).normalize();

    // Sun color/strength by elevation: warmer and dimmer near the horizon.
    const el = Math.asin(this.sunDir.y);
    const warm = Math.max(0, 1 - el / 0.6);
    this.sunColor = new Color(1, 0.96 - warm * 0.12, 0.9 - warm * 0.3);
    this.sunIntensity = (o.sunIntensity ?? 3.2) * Math.min(1, 0.35 + el * 1.2);

    const fogColor = SKY_HORIZON.clone().lerp(new Color(0xe6dccb), 0.25);
    scene.fog = new FogExp2(fogColor, o.fogDensity ?? 0.0021);

    this.sky = new Mesh(new SphereGeometry(500, 48, 24), this._skyMaterial());
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1;
    this.sky.userData.noCSM = true;
    scene.add(this.sky);

    // Fill: sky blue from above and, from below, the warm light the sunlit pale plaza
    // bounces onto everything (it's what keeps the shaded wall glowing cream, not grey).
    this.hemi = new HemisphereLight(0xc4d8ee, 0xe9d3a6, 1.35);
    scene.add(this.hemi);

    this.csm = null;
    this.setQuality(quality);
    this._loadHDRI(o.hdri ?? 'assets/hdri/sky_512.exr');
  }

  _skyMaterial() {
    return new ShaderMaterial({
      side: BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        zenith: { value: SKY_ZENITH },
        horizon: { value: SKY_HORIZON },
        below: { value: GROUND_BELOW },
        sunDir: { value: this.sunDir },
        sunColor: { value: new Color(1, 0.97, 0.9) },
        time: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position.z = gl_Position.w; // always at the far plane
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 zenith;
        uniform vec3 horizon;
        uniform vec3 below;
        uniform vec3 sunDir;
        uniform vec3 sunColor;
        uniform float time;
        varying vec3 vDir;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
        }
        float fbm(vec2 p) {
          float s = 0.0, a = 0.5;
          for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; }
          return s;
        }
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 col = h >= 0.0
            ? mix(horizon, zenith, pow(max(h, 0.0), 0.5))
            : mix(horizon, below, clamp(-h * 6.0, 0.0, 1.0));
          // Sun: a bright disc and a soft glow around it.
          float cs = dot(d, normalize(sunDir));
          col += sunColor * (pow(max(cs, 0.0), 900.0) * 40.0 + pow(max(cs, 0.0), 24.0) * 0.35);
          // Fair-weather clouds on a flat layer, thinning toward the zenith and horizon.
          if (h > 0.02) {
            vec2 p = d.xz / (h + 0.08) * 1.6 + vec2(time * 0.004, time * 0.0015);
            float c = smoothstep(0.52, 0.78, fbm(p));
            c *= smoothstep(0.02, 0.18, h);
            float lit = 0.85 + 0.15 * max(cs, 0.0);
            col = mix(col, vec3(0.97, 0.97, 0.98) * lit, c * 0.85);
          }
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
  }

  /** `urls`: one path or a list tried in order (the full-size sky if fetched, then the bundled small one). */
  _loadHDRI(urls) {
    const list = Array.isArray(urls) ? urls : [urls];
    const url = list[0];
    if (!url) return; // no HDRI at all: the hemisphere light carries the fill
    const hdr = url.endsWith('.hdr');
    const loader = hdr ? new HDRLoader() : new EXRLoader();
    loader.setDataType(FloatType);
    loader.load(
      url,
      (tex) => {
        // Clamp the HDRI's sun: the real sun is the directional light (with shadows).
        const data = tex.image.data;
        for (let i = 0; i < data.length; i++) if (data[i] > 24) data[i] = 24;
        tex.mapping = EquirectangularReflectionMapping;
        tex.needsUpdate = true;
        const pmrem = new PMREMGenerator(this.renderer);
        this.envMap = pmrem.fromEquirectangular(tex).texture;
        pmrem.dispose();
        tex.dispose();
        this.scene.environment = this.envMap;
        this.scene.environmentIntensity = this.o.envIntensity ?? 0.55;
        this.hemi.intensity = this.o.bounce ?? 0.9;
      },
      undefined,
      () => this._loadHDRI(list.slice(1)), // missing or unreadable: try the next one
    );
  }

  /** Graphics preset changed: rebuild the cascaded shadows. */
  setQuality(q) {
    const materials = this.csm ? [...this.csm.shaders.keys()] : [];
    if (this.csm) {
      this.csm.remove();
      this.csm.dispose();
    }
    this.quality = q;
    this.csm = new CSM({
      camera: this.camera,
      parent: this.scene,
      cascades: q.cascades,
      maxFar: q.shadowFar,
      mode: 'practical',
      shadowMapSize: q.shadowMapSize,
      shadowBias: -0.00025,
      lightDirection: this.sunDir.clone().negate(),
      lightIntensity: this.sunIntensity,
      lightNear: 1,
      lightFar: 600,
      lightMargin: 120,
    });
    this.csm.fade = true;
    for (const light of this.csm.lights) {
      light.color.copy(this.sunColor);
      light.shadow.normalBias = 0.035;
      light.shadow.radius = 1.5;
    }
    this._prepared = new WeakSet();
    this.renderer.shadowMap.autoUpdate = true;
    for (const m of materials) this._setupMaterial(m, true);
  }

  _setupMaterial(m, force = false) {
    if (!force && this._prepared.has(m)) return;
    this._prepared.add(m);
    if (m.userData.noCSM || !m.isMeshStandardMaterial && !m.isMeshPhysicalMaterial && !m.isMeshLambertMaterial && !m.isMeshPhongMaterial) return;
    // CSM replaces onBeforeCompile; keep any shader patch the material already has.
    const prev = m.userData.baseOnBeforeCompile ?? m.onBeforeCompile;
    m.userData.baseOnBeforeCompile = prev;
    this.csm.setupMaterial(m);
    const csmHook = m.onBeforeCompile;
    m.onBeforeCompile = (shader, renderer) => {
      if (prev) prev.call(m, shader, renderer);
      csmHook.call(m, shader, renderer);
    };
    m.needsUpdate = true;
  }

  /** Set up every lit material in `root` for the cascaded shadows (cheap when nothing is new). */
  prepare(root = this.scene) {
    root.traverse((obj) => {
      const mat = obj.material;
      if (!mat || obj.userData.noCSM) return;
      if (Array.isArray(mat)) for (const m of mat) this._setupMaterial(m);
      else this._setupMaterial(mat);
    });
  }

  /** Kept for callers from before CSM; shadows now update every frame. */
  refreshShadows() {}

  /** Per frame: sky follows the camera, shadow cascades follow the view. */
  update(camera, dt = 0) {
    this.sky.position.copy(camera.position);
    this.sky.material.uniforms.time.value += dt;
    this.prepare();
    this.csm.update();
  }
}

