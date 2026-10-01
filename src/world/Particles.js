import { AdditiveBlending, DynamicDrawUsage, InstancedBufferAttribute, NormalBlending, Sprite, SpriteNodeMaterial } from 'three/webgpu';
import {
  cameraFar,
  materialOpacity,
  modelWorldMatrix,
  uniform,
  cameraNear,
  float,
  instancedBufferAttribute,
  length,
  perspectiveDepthToViewZ,
  positionView,
  positionWorld,
  smoothstep,
  texture,
  uv,
  vec4,
  viewportDepthTexture,
} from 'three/tsl';
import { lightAt } from './particleLight.js';

/**
 * A pool of camera-facing particles in one draw call (instanced sprites): per particle a
 * position, a size in meters and a color with alpha, written by the owner into `pos`,
 * `size`, `color` (then `commit()`). Optional: a texture (else a soft round dot), additive
 * blending (sparks, flashes), lit by the scene (smoke and dust take the floodlights, the moon,
 * muzzle flashes and explosions: world/particleLight.js), soft edges where they meet a
 * surface (no hard line where a puff cuts into the ground).
 */
export class Particles {
  /**
   * @param {import('three/webgpu').Object3D} parent
   * @param {{ max: number, map?: import('three/webgpu').Texture | null, additive?: boolean,
   *   lit?: boolean, soft?: number, name?: string }} o soft: meters over which a particle
   *   fades into what's behind it (0: off)
   */
  constructor(parent, { max, map = null, additive = false, lit = false, soft = 0, name = 'particles' }) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.color = new Float32Array(max * 4);
    const attr = (a, n) => new InstancedBufferAttribute(a, n).setUsage(DynamicDrawUsage);
    this.aPos = attr(this.pos, 3);
    this.aSize = attr(this.size, 1);
    this.aColor = attr(this.color, 4);
    const m = new SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: additive ? AdditiveBlending : NormalBlending });
    m.positionNode = instancedBufferAttribute(this.aPos);
    m.scaleNode = instancedBufferAttribute(this.aSize);
    const col = instancedBufferAttribute(this.aColor);
    const shape = map ? texture(map, uv()) : vec4(1, 1, 1, smoothstep(1, 0.15, length(uv().mul(2).sub(1))));
    let rgb = col.rgb.mul(shape.rgb);
    let a = col.a.mul(shape.a);
    if (lit) rgb = rgb.mul(lightAt(positionWorld));
    if (soft > 0) {
      const sceneZ = perspectiveDepthToViewZ(viewportDepthTexture(), cameraNear, cameraFar);
      a = a.mul(positionView.z.sub(sceneZ).div(float(soft)).clamp());
    }
    m.colorNode = vec4(rgb, a);
    m.fog = !additive;
    this.material = m;
    this.sprite = new Sprite(m);
    this.sprite.count = max;
    this.sprite.frustumCulled = false;
    this.sprite.name = name;
    this.sprite.renderOrder = 2;
    parent.add(this.sprite);
  }

  /** The arrays changed: upload them. */
  commit() {
    this.aPos.needsUpdate = true;
    this.aSize.needsUpdate = true;
    this.aColor.needsUpdate = true;
  }

  /** Everything gone (alpha 0, size 0). */
  clear() {
    this.size.fill(0);
    this.color.fill(0);
    this.commit();
  }
}

/**
 * A smoke sprite's material: its texture lit by what lights the air there (the floodlights,
 * the moon, explosions and muzzle flashes nearby), soft against surfaces. `color` and
 * `opacity` work as on a SpriteMaterial (the owners animate them).
 */
export function litSmokeMaterial(map, { soft = 0.6 } = {}) {
  const m = new SpriteNodeMaterial({ transparent: true, depthWrite: false });
  if (!map) return m; // (no canvas: tests)
  const tint = uniform(m.color);
  const center = modelWorldMatrix.mul(vec4(0, 0, 0, 1)).xyz;
  const tex = texture(map, uv());
  let a = tex.a.mul(materialOpacity);
  if (soft > 0) {
    const sceneZ = perspectiveDepthToViewZ(viewportDepthTexture(), cameraNear, cameraFar);
    a = a.mul(positionView.z.sub(sceneZ).div(float(soft)).clamp());
  }
  m.colorNode = vec4(tex.rgb.mul(tint).mul(lightAt(center)), a);
  m.opacityNode = float(1); // (in the alpha above)
  return m;
}
