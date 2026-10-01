import { Color, DataTexture, FloatType, NearestFilter, RGBAFormat, Vector3 } from 'three';

// The night's static lights: the floodlights washing the wall, the lamp posts, the big
// screens, light spilling from doorways. Far too many for three's own lights (every one
// costs every material, and a shadow map each), so they live in a small float texture that
// every lit material reads in its fragment shader (Environment injects the code next to the
// cascaded-shadow setup): diffuse light from point and spot lights, a smooth cut at each
// light's range, no shadows. Positions go into view space on the CPU once a frame.

export const MAX_NIGHT_LIGHTS = 64;
const TEXELS = 3; // per light: [position (view), range] [color * intensity, spot cos outer | -2] [direction (view), cos inner]

/**
 * GLSL added after three's `lights_fragment_end` (view space: `geometryPosition`,
 * `geometryNormal`, `material.diffuseColor` come from three's own chunks).
 */
export const NIGHT_LIGHTS_GLSL = /* glsl */ `
{
  vec3 nlSum = vec3(0.0);
  for (int i = 0; i < ${MAX_NIGHT_LIGHTS}; i++) {
    if (i >= nightLightCount) break;
    vec4 a = texelFetch(nightLightTex, ivec2(0, i), 0);
    vec3 L = a.xyz - geometryPosition;
    float d2 = dot(L, L);
    if (d2 > a.w * a.w) continue;
    vec4 b = texelFetch(nightLightTex, ivec2(1, i), 0);
    float d = sqrt(d2);
    L /= d;
    float ndl = max(dot(geometryNormal, L), 0.0);
    float cut = clamp(1.0 - pow(d / a.w, 4.0), 0.0, 1.0);
    float att = cut * cut / max(d2, 0.5);
    if (b.w > -1.5) {
      vec4 c = texelFetch(nightLightTex, ivec2(2, i), 0);
      att *= smoothstep(b.w, c.w, dot(-L, c.xyz));
    }
    nlSum += b.rgb * (att * ndl);
  }
  reflectedLight.directDiffuse += nlSum * nightLightLevel * BRDF_Lambert(material.diffuseColor);
}
`;

const _v = new Vector3();

export class NightLights {
  constructor() {
    this.lights = [];
    this.data = new Float32Array(4 * TEXELS * MAX_NIGHT_LIGHTS);
    this.texture = new DataTexture(this.data, TEXELS, MAX_NIGHT_LIGHTS, RGBAFormat, FloatType);
    this.texture.magFilter = NearestFilter;
    this.texture.minFilter = NearestFilter;
    this.texture.needsUpdate = true;
    // Shared by every patched material (one upload a frame for all of them).
    this.uniforms = {
      nightLightTex: { value: this.texture },
      nightLightCount: { value: 0 },
      nightLightLevel: { value: 0 },
    };
    this.glows = []; // fixtures' materials: emissiveIntensity = level * material.userData.glow
  }

  /** Glowing fixtures (lanterns, flood heads, screens, lit windows): their glow follows the level. */
  addGlow(material) {
    this.glows.push(material);
    material.emissiveIntensity = this.level * (material.userData.glow ?? 1);
  }

  /**
   * @param {{ position: number[], color: number, intensity: number, range: number,
   *   direction?: number[], cone?: number, soft?: number }} l cone: half-angle (rad) of a spot;
   *   soft: the share of the cone that fades out
   */
  add(l) {
    if (this.lights.length >= MAX_NIGHT_LIGHTS) return null;
    const light = {
      position: new Vector3().fromArray(l.position),
      color: new Color(l.color).multiplyScalar(l.intensity),
      range: l.range,
      direction: l.direction ? new Vector3().fromArray(l.direction).normalize() : null,
      cosOuter: l.cone ? Math.cos(l.cone) : -2,
      cosInner: l.cone ? Math.cos(l.cone * (1 - (l.soft ?? 0.4))) : 1,
    };
    this.lights.push(light);
    this.uniforms.nightLightCount.value = this.lights.length;
    return light;
  }

  clear() {
    this.lights.length = 0;
    this.uniforms.nightLightCount.value = 0;
  }

  /** 0 = off (day) .. 1 = full night. */
  setLevel(v) {
    this.uniforms.nightLightLevel.value = v;
    for (const m of this.glows) m.emissiveIntensity = v * (m.userData.glow ?? 1);
  }

  /**
   * The light at a point from every night light (no normals, no shadows): `out` gets the
   * color, `dir` the main direction it comes from (unit, toward the lights). For things the
   * shader patch doesn't reach (the first-person weapon). Returns `out`.
   */
  sample(point, out, dir) {
    out.setRGB(0, 0, 0);
    dir.set(0, 0, 0);
    if (this.level <= 0) return out;
    for (const l of this.lights) {
      _v.copy(l.position).sub(point);
      const d2 = _v.lengthSq();
      if (d2 > l.range * l.range) continue;
      const d = Math.sqrt(d2);
      const cut = Math.min(1, Math.max(0, 1 - (d / l.range) ** 4));
      let att = (cut * cut) / Math.max(d2, 0.5);
      _v.divideScalar(d || 1);
      if (l.direction) {
        const cs = -_v.dot(l.direction);
        const t = Math.min(1, Math.max(0, (cs - l.cosOuter) / Math.max(1e-4, l.cosInner - l.cosOuter)));
        att *= t * t * (3 - 2 * t);
      }
      if (att <= 0) continue;
      out.r += l.color.r * att;
      out.g += l.color.g * att;
      out.b += l.color.b * att;
      dir.addScaledVector(_v, (l.color.r + l.color.g + l.color.b) * att);
    }
    out.multiplyScalar(this.level);
    if (dir.lengthSq() > 0) dir.normalize();
    else dir.set(0, 1, 0);
    return out;
  }

  get level() {
    return this.uniforms.nightLightLevel.value;
  }

  /** Per frame, after the camera moved: positions and directions into view space. */
  update(camera) {
    if (!this.lights.length || this.level <= 0) return;
    const m = camera.matrixWorldInverse;
    const d = this.data;
    for (let i = 0; i < this.lights.length; i++) {
      const l = this.lights[i];
      const o = i * TEXELS * 4;
      _v.copy(l.position).applyMatrix4(m);
      d[o] = _v.x;
      d[o + 1] = _v.y;
      d[o + 2] = _v.z;
      d[o + 3] = l.range;
      d[o + 4] = l.color.r;
      d[o + 5] = l.color.g;
      d[o + 6] = l.color.b;
      d[o + 7] = l.cosOuter;
      if (l.direction) {
        _v.copy(l.direction).transformDirection(m);
        d[o + 8] = _v.x;
        d[o + 9] = _v.y;
        d[o + 10] = _v.z;
        d[o + 11] = l.cosInner;
      }
    }
    this.texture.needsUpdate = true;
  }

  /** Add the lights to a lit material's shader (an onBeforeCompile step). */
  patch(shader) {
    Object.assign(shader.uniforms, this.uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform highp sampler2D nightLightTex;\nuniform int nightLightCount;\nuniform float nightLightLevel;')
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${NIGHT_LIGHTS_GLSL}`);
  }
}
