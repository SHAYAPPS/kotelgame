import {
  BackSide,
  Color,
  DataTexture,
  DirectionalLight,
  EquirectangularReflectionMapping,
  FloatType,
  FogExp2,
  HemisphereLight,
  Mesh,
  MeshBasicNodeMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  SphereGeometry,
  TextureLoader,
  Vector3,
} from 'three/webgpu';
import {
  Fn,
  If,
  Loop,
  asin,
  atan,
  clamp,
  dot,
  float,
  floor,
  fract,
  max,
  mix,
  normalize,
  positionLocal,
  pow,
  sin,
  smoothstep,
  texture,
  uniform,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { CSMShadowNode } from 'three/addons/csm/CSMShadowNode.js';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { solarPosition, sunDirection } from './sun.js';
import { NightLights } from './NightLights.js';

const SKY_ZENITH = new Color(0x3f78c4);
const SKY_HORIZON = new Color(0xc6d8e6);
const GROUND_BELOW = new Color(0x9c9a92);
// Just after sunrise (the main menu): a deeper sky, a warm horizon and haze, dimmer fill.
const DAWN = {
  zenith: new Color(0x45679c),
  horizon: new Color(0xf0c79f),
  fog: new Color(0xe3c4a2),
  hemiSky: new Color(0x9cafcf),
  hemiGround: new Color(0xb9977a),
  sun: new Color(1, 0.78, 0.55),
};
// Night (the sun well below the horizon): the moon is the key light, a dark blue sky with
// stars over the city's warm glow, dark haze, a dim cool fill.
const NIGHT = {
  zenith: new Color(0x02040a),
  horizon: new Color(0x1a1612),
  fog: new Color(0x0d0f14),
  hemiSky: new Color(0x2b3956),
  hemiGround: new Color(0x3b2e22),
  moon: new Color(0.62, 0.72, 1),
  glow: new Color(0.26, 0.13, 0.05), // the city's light on the haze, near the horizon
};
const _c = new Color();
const RAD = Math.PI / 180;

/**
 * Sky, sunlight and haze.
 * - Sky dome: a gradient with the sun disc and slowly drifting clouds (cheap, sharp at any
 *   resolution), matched to the HDRI.
 * - Image-based light and reflections from a CC0 HDRI (PMREM); the HDRI's own sun is clamped
 *   out because the directional sun below casts the real light and shadows.
 * - The sun: placed from the time of day (see ./sun.js); cascaded shadow maps (three's
 *   CSMShadowNode) cover the whole view with sharp shadows near you.
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
    this.sunColor = new Color();
    this.sunIntensity = 1;
    this.dawn = 0; // 0 = day .. 1 = sunrise (the palette)
    this.night = 0; // 0 = day .. 1 = night (the moon is the key light, sunDir points at it)
    this.nightConfig = o.night ?? null;
    // The night's static lights (floodlights, lamps, screens): the level adds them.
    this.lights = new NightLights();
    this.envMaps = {};

    this._dayFog = SKY_HORIZON.clone().lerp(new Color(0xe6dccb), 0.25);
    scene.fog = new FogExp2(this._dayFog.clone(), o.fogDensity ?? 0.0021);

    this.skyU = {
      zenith: uniform(SKY_ZENITH.clone()),
      horizon: uniform(SKY_HORIZON.clone()),
      below: uniform(GROUND_BELOW.clone()),
      sunDir: uniform(this.sunDir),
      sunColor: uniform(new Color(1, 0.97, 0.9)),
      time: uniform(0),
      night: uniform(0),
      hasNightTex: uniform(0),
      nightYaw: uniform(0),
      glow: uniform(new Color()),
    };
    // (the photographed night sky replaces it once it loads)
    this.nightTex = new DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    this.nightTex.needsUpdate = true;
    this.sky = new Mesh(new SphereGeometry(500, 48, 24), this._skyMaterial());
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1;
    scene.add(this.sky);

    // Fill: sky blue from above and, from below, the warm light the sunlit pale plaza
    // bounces onto everything (it's what keeps the shaded wall glowing cream, not grey).
    this.hemi = new HemisphereLight(0xc4d8ee, 0xe9d3a6, 1.35);
    scene.add(this.hemi);
    this._hemiBase = 1.35;
    this._envBase = o.envIntensity ?? 0.55;

    this.csm = null;
    this._sunFromElevation();
    this._keyLight();
    this.setQuality(quality);
    this._applySky();
    this._loadHDRI(o.hdri ?? 'assets/hdri/sky_512.exr', 'day');
    const n = this.nightConfig;
    if (n) {
      if (n.hdri) this._loadHDRI(n.hdri, 'night');
      // The visible night sky (stars; its moon is redrawn as a disc where the moonlight comes from).
      if (n.sky) {
        new TextureLoader().load(n.sky, (t) => {
          t.colorSpace = SRGBColorSpace;
          t.wrapS = RepeatWrapping;
          t.anisotropy = 4;
          this.nightTexNode.value = t;
          this.skyU.hasNightTex.value = 1;
        });
      }
    }
  }

  /** The moon's direction (the night's key light), from the level's night config (degrees). */
  _moonDirection(out) {
    const m = this.nightConfig?.moon ?? { azimuth: 225, elevation: 25 };
    return sunDirection({ azimuth: m.azimuth * RAD, elevation: m.elevation * RAD }, out);
  }

  /**
   * Move the sun to another local clock time ('HH:MM') on the level's day and place: the main
   * menu's sunrise, the mission's 11:40. Light, sky, haze and fill follow.
   */
  setTime(time) {
    if (!this.o.sun || !time) return;
    sunDirection(solarPosition({ ...this.o.sun, time }), this.sunDir);
    this._sunFromElevation();
    this._keyLight();
    this._applyKey();
    this._applySky();
  }

  /** The key light (sun or moon) from sunDir, its color and strength. */
  _applyKey() {
    const light = this.keyLight;
    if (!light) return;
    light.color.copy(this.sunColor);
    light.intensity = this.sunIntensity;
    light.position.copy(this.sunDir).multiplyScalar(200);
    light.target.position.set(0, 0, 0);
    light.updateMatrixWorld();
    light.target.updateMatrixWorld();
  }

  /**
   * After dusk the moon takes over as the key light (and its shadows): sunDir then points at
   * the moon, with its color and strength.
   */
  _keyLight() {
    const el = Math.asin(this.sunDir.y);
    const t = this.nightConfig ? Math.min(1, Math.max(0, (-0.03 - el) / 0.12)) : 0;
    this.night = t * t * (3 - 2 * t);
    this.lights.setLevel(this.night > 0 ? this.night * (this.nightConfig.lights ?? 1) : this.dawn > 0.8 ? 0.15 : 0);
    if (this.night < 0.5) return;
    this._moonDirection(this.sunDir);
    this.sunColor.copy(NIGHT.moon);
    this.sunIntensity = this.nightConfig.moonIntensity ?? 0.35;
  }

  /** Sun color / strength by elevation: warmer and dimmer near the horizon. */
  _sunFromElevation() {
    const el = Math.asin(this.sunDir.y);
    const warm = Math.max(0, 1 - el / 0.6);
    this.sunColor.setRGB(1, 0.96 - warm * 0.12, 0.9 - warm * 0.3);
    this.sunIntensity = (this.o.sunIntensity ?? 3.2) * Math.min(1, 0.35 + Math.max(0, el) * 1.2);
    const t = Math.min(1, Math.max(0, (el - 0.06) / (0.5 - 0.06)));
    this.dawn = 1 - t * t * (3 - 2 * t);
  }

  /** Sky colors, haze, the fill light and the image-based light for the sun's height (or the night). */
  _applySky() {
    const d = this.dawn;
    const n = this.night;
    const N = this.nightConfig ?? {};
    const u = this.skyU;
    if (u) {
      u.zenith.value.copy(SKY_ZENITH).lerp(DAWN.zenith, d).lerp(NIGHT.zenith, n);
      u.horizon.value.copy(SKY_HORIZON).lerp(DAWN.horizon, d).lerp(NIGHT.horizon, n);
      u.sunColor.value.setRGB(1, 0.97, 0.9).lerp(DAWN.sun, d).lerp(NIGHT.moon, n);
      u.night.value = n;
      u.glow.value.copy(NIGHT.glow);
      u.nightYaw.value = (N.skyYaw ?? 0) * RAD;
    }
    this.scene.fog.color.copy(this._dayFog).lerp(DAWN.fog, d).lerp(NIGHT.fog, n);
    if (N.fogDensity && n > 0) this.scene.fog.density = (this.o.fogDensity ?? 0.0021) + (N.fogDensity - (this.o.fogDensity ?? 0.0021)) * n;
    else this.scene.fog.density = this.o.fogDensity ?? 0.0021;
    this.hemi.color.set(0xc4d8ee).lerp(DAWN.hemiSky, d).lerp(NIGHT.hemiSky, n);
    this.hemi.groundColor.set(0xe9d3a6).lerp(_c.copy(DAWN.hemiGround), d).lerp(NIGHT.hemiGround, n);
    this.hemi.intensity = this._hemiBase * (1 - 0.4 * d) * (1 - n) + (N.hemiIntensity ?? 0.35) * n;
    const env = n >= 0.5 ? this.envMaps.night ?? this.envMaps.day : this.envMaps.day;
    if (env) {
      this.scene.environment = env;
      this.scene.environmentIntensity = n >= 0.5 ? N.envIntensity ?? 0.4 : this._envBase * (1 - 0.45 * d);
    }
  }

  /**
   * The sky dome (TSL): a gradient with the sun disc and a soft glow, fair-weather clouds on a
   * flat layer; at night the photographed sky (an equirect upper half: its background darkened
   * so only the stars stay, which a high-pass picks out), the city's glow along the horizon,
   * the moon as a bright disc with a halo.
   */
  _skyMaterial() {
    const U = this.skyU;
    this.nightTexNode = texture(this.nightTex);
    const hash = Fn(([p]) => fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453)));
    const noise = Fn(([p]) => {
      const i = floor(p);
      const f = fract(p);
      const u = f.mul(f).mul(float(3).sub(f.mul(2)));
      return mix(mix(hash(i), hash(i.add(vec2(1, 0))), u.x), mix(hash(i.add(vec2(0, 1))), hash(i.add(vec2(1, 1))), u.x), u.y);
    });
    const fbm = Fn(([p0]) => {
      const p = vec2(p0).toVar();
      const s = float(0).toVar();
      const a = float(0.5).toVar();
      Loop(5, () => {
        s.addAssign(a.mul(noise(p)));
        p.mulAssign(2.03);
        a.mulAssign(0.5);
      });
      return s;
    });
    const nightSky = Fn(([d, cs]) => {
      const h = d.y;
      const col = mix(U.horizon, U.zenith, pow(max(h, 0), 0.45)).toVar();
      col.addAssign(U.glow.mul(pow(float(1).sub(max(h, 0)), 7)));
      If(U.hasNightTex.greaterThan(0.5).and(h.greaterThan(0)), () => {
        const uv = vec2(atan(d.x, d.z.negate()).div(6.2831853).add(0.5).add(U.nightYaw.div(6.2831853)), float(1).sub(asin(clamp(h, 0, 1)).div(1.5707963)));
        // Explicit levels (the wrap-around seam would break automatic mip selection).
        const st = this.nightTexNode.sample(uv).level(0).rgb;
        const bg = this.nightTexNode.sample(uv).level(5).rgb;
        // Only the brighter stars (the city's glow drowns the faint ones), fading at the horizon.
        const star = max(0, dot(st.sub(bg), vec3(0.2126, 0.7152, 0.0722)).sub(0.07));
        col.addAssign(vec3(0.85, 0.9, 1.0).mul(star).mul(0.55).mul(smoothstep(0.05, 0.4, h)));
        col.addAssign(bg.mul(vec3(0.012, 0.016, 0.03)));
      });
      // The moon: a small bright disc with a halo (it blooms).
      col.addAssign(U.sunColor.mul(smoothstep(0.99993, 0.99996, cs).mul(9).add(pow(max(cs, 0), 300).mul(0.25)).add(pow(max(cs, 0), 12).mul(0.03))));
      return col;
    });
    const sky = Fn(() => {
      const d = normalize(positionLocal).toVar();
      const h = d.y;
      const col = vec3(0).toVar();
      If(h.greaterThanEqual(0), () => {
        col.assign(mix(U.horizon, U.zenith, pow(max(h, 0), 0.5)));
      }).Else(() => {
        col.assign(mix(U.horizon, U.below, clamp(h.negate().mul(6), 0, 1)));
      });
      // Sun: a bright disc and a soft glow around it.
      const cs = dot(d, normalize(U.sunDir)).toVar();
      const day = float(1).sub(U.night);
      col.addAssign(U.sunColor.mul(pow(max(cs, 0), 900).mul(40).add(pow(max(cs, 0), 24).mul(0.35))).mul(day));
      // Fair-weather clouds on a flat layer, thinning toward the zenith and horizon.
      If(h.greaterThan(0.02).and(day.greaterThan(0.001)), () => {
        const p = d.xz.div(h.add(0.08)).mul(1.6).add(vec2(U.time.mul(0.004), U.time.mul(0.0015)));
        const c = smoothstep(0.52, 0.78, fbm(p)).mul(smoothstep(0.02, 0.18, h));
        const lit = float(0.85).add(max(cs, 0).mul(0.15));
        col.assign(mix(col, vec3(0.97, 0.97, 0.98).mul(lit), c.mul(0.85).mul(day)));
      });
      If(U.night.greaterThan(0), () => {
        col.assign(mix(col, nightSky(d, cs), U.night));
      });
      return vec4(col, 1);
    });
    const m = new MeshBasicNodeMaterial({ side: BackSide, depthWrite: false, fog: false });
    m.colorNode = sky();
    m.name = 'sky';
    return m;
  }

  /**
   * `urls`: one path or a list tried in order (the full-size sky if fetched, then the bundled
   * small one); `key`: 'day' | 'night' (which env map it becomes).
   */
  _loadHDRI(urls, key = 'day') {
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
        // (the renderer prefilters it into a PMREM the first time it lights something)
        this.envMaps[key] = tex;
        if (key === 'day') this.envMap = this.envMaps.day;
        if (key === 'day') this._hemiBase = this.o.bounce ?? 0.9;
        this._applySky();
      },
      undefined,
      () => this._loadHDRI(list.slice(1), key), // missing or unreadable: try the next one
    );
  }

  /** Graphics preset changed: rebuild the key light's cascaded shadows. */
  setQuality(q) {
    if (this.keyLight) {
      this.keyLight.shadow.shadowNode?.dispose?.();
      this.keyLight.shadow.dispose();
      this.scene.remove(this.keyLight, this.keyLight.target);
    }
    this.quality = q;
    const light = new DirectionalLight(this.sunColor, this.sunIntensity);
    light.castShadow = true;
    light.shadow.mapSize.set(q.shadowMapSize, q.shadowMapSize);
    light.shadow.camera.near = 1;
    light.shadow.camera.far = 600;
    light.shadow.bias = -0.00025;
    light.shadow.normalBias = 0.035;
    light.shadow.radius = 1.5;
    const csm = new CSMShadowNode(light, { cascades: q.cascades, maxFar: q.shadowFar, mode: 'practical', lightMargin: 120 });
    csm.fade = true;
    light.shadow.shadowNode = csm;
    this.csm = csm;
    this.keyLight = light;
    this.scene.add(light, light.target);
    this._applyKey();
  }

  /** (Kept for callers from the WebGL version: node materials need no per-material setup.) */
  prepare() {}

  /** Kept for callers from before CSM; shadows now update every frame. */
  refreshShadows() {}

  /** Per frame: sky follows the camera, shadow cascades follow the view. */
  update(camera, dt = 0) {
    this.sky.position.copy(camera.position);
    this.skyU.time.value += dt;
    camera.updateMatrixWorld();
  }
}

