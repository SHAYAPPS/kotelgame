import { Color, DataTexture, FloatType, Lighting, LightsNode, NearestFilter, RGBAFormat, Vector3 } from 'three/webgpu';
import { Fn, If, Loop, cameraViewMatrix, dot, float, ivec2, positionView, smoothstep, textureLoad, uniform, vec4 } from 'three/tsl';

// The night's static lights: the floodlights washing the wall, the lamp posts, the big
// screens, light spilling from doorways. Far too many for three's own lights (each one is
// compiled into every material, and wants a shadow map), so they live in a small float
// texture that every lit material's lighting loops over (NightLightsNode, installed as the
// renderer's lighting for the main scene): full PBR light (diffuse and specular) from point
// and spot lights, a smooth cut at each light's range, no shadows.

export const MAX_NIGHT_LIGHTS = 64;
const TEXELS = 3; // per light: [position (world), range] [color * intensity, spot cos outer | -2] [direction (world), cos inner]

const _v = new Vector3();

/**
 * The scene's own lights, plus every night light (a loop over the texture, each one through
 * the material's lighting model like a point light, a spot's cone on top).
 */
class NightLightsNode extends LightsNode {
  static get type() {
    return 'NightLightsNode';
  }

  constructor(night) {
    super();
    this.night = night;
  }

  setupLights(builder, lightNodes) {
    super.setupLights(builder, lightNodes);
    const N = this.night;
    const { reflectedLight } = builder.context;
    reflectedLight.directDiffuse.toStack();
    reflectedLight.directSpecular.toStack();
    Fn(() => {
      If(N.levelNode.greaterThan(0), () => {
        Loop(N.countNode, ({ i }) => {
          const a = textureLoad(N.texture, ivec2(0, i));
          const lightVector = cameraViewMatrix.mul(vec4(a.xyz, 1)).xyz.sub(positionView).toVar();
          const d2 = dot(lightVector, lightVector).toVar();
          If(d2.lessThan(a.w.mul(a.w)), () => {
            const b = textureLoad(N.texture, ivec2(1, i));
            const d = d2.sqrt();
            const lightDirection = lightVector.div(d).toVar();
            // A smooth cut at the range, inverse square (held off right at the fixture).
            const cut = float(1).sub(d.div(a.w).pow4()).clamp();
            const color = b.rgb.mul(N.levelNode).mul(cut.mul(cut).div(d2.max(0.5))).toVar();
            If(b.w.greaterThan(-1.5), () => {
              const c = textureLoad(N.texture, ivec2(2, i));
              const axis = cameraViewMatrix.mul(vec4(c.xyz, 0)).xyz;
              color.mulAssign(smoothstep(b.w, c.w, dot(lightDirection.negate(), axis)));
            });
            builder.lightsNode.setupDirectLight(builder, this, { lightDirection, lightColor: color });
          });
        });
      });
    }, 'void')();
  }
}

/** The renderer's lighting: the night lights in `scene` only (not the weapon's own scene). */
export class NightLighting extends Lighting {
  constructor(night, scene) {
    super();
    this.night = night;
    this.scene = scene;
  }

  getNode(scene) {
    if (scene !== this.scene) return super.getNode(scene);
    let node = this._lightsNodeMap.get(scene);
    if (node === undefined) {
      node = new NightLightsNode(this.night);
      this._lightsNodeMap.set(scene, node);
    }
    return node;
  }
}

export class NightLights {
  constructor() {
    this.lights = [];
    this.data = new Float32Array(4 * TEXELS * MAX_NIGHT_LIGHTS);
    this.texture = new DataTexture(this.data, TEXELS, MAX_NIGHT_LIGHTS, RGBAFormat, FloatType);
    this.texture.magFilter = NearestFilter;
    this.texture.minFilter = NearestFilter;
    this.texture.needsUpdate = true;
    // Shared by every lit material.
    this.countNode = uniform(0, 'int');
    this.levelNode = uniform(0);
    this.glows = []; // fixtures' materials: emissiveIntensity = level * material.userData.glow
  }

  /** Glowing fixtures (lanterns, flood heads, screens, lit windows): their glow follows the level. */
  addGlow(material) {
    this.glows.push(material);
    material.emissiveIntensity = this.level * (material.userData.glow ?? 1);
  }

  /**
   * @param {{ position: number[], color: number, intensity: number, range: number,
   *   direction?: number[], cone?: number, soft?: number, volumetric?: boolean }} l cone:
   *   half-angle (rad) of a spot; soft: the share of the cone that fades out; volumetric: its
   *   beam shows in the haze (core/Volumetrics.js)
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
      volumetric: l.volumetric ?? false,
    };
    this.lights.push(light);
    this._write(this.lights.length - 1);
    this.countNode.value = this.lights.length;
    this.version = (this.version ?? 0) + 1;
    return light;
  }

  _write(i) {
    const l = this.lights[i];
    const d = this.data;
    const o = i * TEXELS * 4;
    d[o] = l.position.x;
    d[o + 1] = l.position.y;
    d[o + 2] = l.position.z;
    d[o + 3] = l.range;
    d[o + 4] = l.color.r;
    d[o + 5] = l.color.g;
    d[o + 6] = l.color.b;
    d[o + 7] = l.cosOuter;
    if (l.direction) {
      d[o + 8] = l.direction.x;
      d[o + 9] = l.direction.y;
      d[o + 10] = l.direction.z;
      d[o + 11] = l.cosInner;
    }
    this.texture.needsUpdate = true;
  }

  clear() {
    this.lights.length = 0;
    this.countNode.value = 0;
  }

  /** 0 = off (day) .. 1 = full night. */
  setLevel(v) {
    this.levelNode.value = v;
    for (const m of this.glows) m.emissiveIntensity = v * (m.userData.glow ?? 1);
  }

  get level() {
    return this.levelNode.value;
  }

  /**
   * The light at a point from every night light (no normals, no shadows): `out` gets the
   * color, `dir` the main direction it comes from (unit, toward the lights). For things the
   * lighting loop doesn't reach (the first-person weapon's own scene). Returns `out`.
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

  /** (World-space data: nothing to do per frame.) */
  update() {}
}
