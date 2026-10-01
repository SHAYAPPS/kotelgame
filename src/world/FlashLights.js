import { PointLight } from 'three';

/**
 * A small pool of point lights for brief flashes (enemy / squad muzzle flashes,
 * explosions, rocket launches) so they light up the stone around them. The lights always
 * exist (intensity 0 when idle): changing the number of lights would recompile every
 * material, so the pool size only changes with the graphics setting.
 */
export class FlashLights {
  constructor(scene, count) {
    this.scene = scene;
    this.lights = [];
    // At night a flash lights up much more of the dark around it (Game sets this from the
    // environment: 1 by day).
    this.boost = 1;
    this.setCount(count);
  }

  setCount(count) {
    for (const l of this.lights) l.light.removeFromParent();
    this.lights = [];
    for (let i = 0; i < count; i++) {
      const light = new PointLight(0xffb060, 0, 10, 2);
      light.castShadow = false;
      this.scene.add(light);
      this.lights.push({ light, t: 0, dur: 1, peak: 0 });
    }
  }

  /**
   * @param {import('three').Vector3} position
   * @param {{ color?: number, intensity?: number, distance?: number, duration?: number }} o
   */
  flash(position, { color = 0xffb060, intensity = 30, distance = 10, duration = 0.06 } = {}) {
    if (!this.lights.length) return;
    // Reuse the dimmest (or finished) light; a bigger flash takes over a smaller one.
    let best = this.lights[0];
    let bestLeft = Infinity;
    for (const l of this.lights) {
      const left = l.t > 0 ? l.peak * (l.t / l.dur) : 0;
      if (left < bestLeft) {
        bestLeft = left;
        best = l;
      }
    }
    if (bestLeft > intensity) return;
    best.light.position.copy(position);
    best.light.color.set(color);
    best.light.distance = distance * (1 + (this.boost - 1) * 0.6);
    best.peak = intensity * this.boost;
    best.dur = duration;
    best.t = duration;
  }

  update(dt) {
    for (const l of this.lights) {
      if (l.t <= 0) {
        l.light.intensity = 0;
        continue;
      }
      l.t = Math.max(0, l.t - dt);
      const f = l.t / l.dur;
      l.light.intensity = l.peak * f * f;
    }
  }
}
