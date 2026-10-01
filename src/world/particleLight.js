import { Fn, If, Loop, dot, float, ivec2, textureLoad, uniform, vec3 } from 'three/tsl';
import { Color } from 'three/webgpu';

// Light falling on a point in the air (smoke, dust, the haze): no surface, so no normals; the
// sky's fill and the moon, every night light in range (spots by their cone) and the flashes
// of the moment (muzzle flashes, explosions). Shared uniforms, set by the game each frame.

export const airLight = {
  ambient: uniform(new Color(0.5, 0.5, 0.5)),
  night: null, // world/NightLights.js
  flashes: null, // world/FlashLights.js
};

/** TSL: the light (a vec3) at a world position. */
export const lightAt = Fn(([pos]) => {
  const sum = vec3(airLight.ambient).toVar();
  const N = airLight.night;
  if (N) {
    If(N.levelNode.greaterThan(0), () => {
      Loop(N.countNode, ({ i }) => {
        const a = textureLoad(N.texture, ivec2(0, i));
        const L = a.xyz.sub(pos).toVar();
        const d2 = dot(L, L);
        If(d2.lessThan(a.w.mul(a.w)), () => {
          const b = textureLoad(N.texture, ivec2(1, i));
          const d = d2.sqrt();
          const cut = float(1).sub(d.div(a.w).pow4()).clamp();
          const att = cut.mul(cut).div(d2.max(0.5)).toVar();
          If(b.w.greaterThan(-1.5), () => {
            const c = textureLoad(N.texture, ivec2(2, i));
            att.mulAssign(L.div(d).negate().dot(c.xyz).smoothstep(b.w, c.w));
          });
          sum.addAssign(b.rgb.mul(att).mul(N.levelNode).mul(0.25));
        });
      });
    });
  }
  const F = airLight.flashes;
  if (F) {
    Loop(F.countU, ({ i }) => {
      const p = F.posU.element(i);
      const L = p.xyz.sub(pos);
      const d2 = dot(L, L);
      If(d2.lessThan(p.w.mul(p.w)), () => {
        const cut = float(1).sub(d2.sqrt().div(p.w).pow4()).clamp();
        sum.addAssign(F.colU.element(i).rgb.mul(cut.mul(cut).div(d2.max(0.3))).mul(0.25));
      });
    });
  }
  return sum;
});
