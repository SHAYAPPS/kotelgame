import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Group,
  Line,
  LineBasicMaterial,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three';

// Rocket barrage over the city: interceptors climb on thin smoke trails and burst
// into a flash and a smoke puff high in the sky; now and then a distant impact
// flashes on the horizon. Everything is pooled (no allocations per event).
// `onFlash(distance, strength)` fires at each burst so the story can play the boom
// once the sound arrives and shake the camera.

const POOL = 8;
const INTERCEPTOR_SPEED = 320; // m/s, sped up so it reads at this distance

function radialTexture(inner, outer) {
  const size = 64;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.35, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

export class SkyFx {
  /** @param {import('three').Scene} scene @param {{ rand?: () => number }} opts */
  constructor(scene, { rand = Math.random } = {}) {
    this.rand = rand;
    this.barrage = 0;
    this.onFlash = null;
    this._timer = 2;
    this._listener = new Vector3(-60, 2, 0);
    this.root = new Group();
    this.root.name = 'skyfx';
    scene.add(this.root);

    const hasDom = typeof document !== 'undefined';
    const flashTex = hasDom ? radialTexture('rgba(255,244,220,1)', 'rgba(255,170,80,0)') : null;
    const smokeTex = hasDom ? radialTexture('rgba(78,76,72,0.95)', 'rgba(90,88,84,0)') : null;

    this.events = [];
    for (let i = 0; i < POOL; i++) {
      const trailGeo = new BufferGeometry();
      trailGeo.setAttribute('position', new BufferAttribute(new Float32Array(6), 3));
      const trail = new Line(trailGeo, new LineBasicMaterial({ color: 0xe8e4dc, transparent: true, opacity: 0.8, fog: false }));
      trail.frustumCulled = false;
      const flash = new Sprite(new SpriteMaterial({ map: flashTex, color: 0xffffff, transparent: true, blending: AdditiveBlending, depthWrite: false, fog: false }));
      const smoke = new Sprite(new SpriteMaterial({ map: smokeTex, color: 0xffffff, transparent: true, depthWrite: false, fog: false, toneMapped: false }));
      trail.visible = flash.visible = smoke.visible = false;
      this.root.add(trail, flash, smoke);
      this.events.push({
        active: false,
        time: 0,
        from: new Vector3(),
        to: new Vector3(),
        flightTime: 0,
        impact: false,
        burst: false,
        trail,
        flash,
        smoke,
      });
    }
  }

  /** 0 = clear sky, 1 = heavy barrage. */
  setBarrage(level) {
    this.barrage = level;
    if (level <= 0) {
      for (const e of this.events) this._hide(e);
    } else {
      this._timer = Math.min(this._timer, 1.5);
    }
  }

  _hide(e) {
    e.active = false;
    e.trail.visible = e.flash.visible = e.smoke.visible = false;
  }

  _spawn(impact) {
    const e = this.events.find((x) => !x.active);
    if (!e) return;
    const r = this.rand;
    // Over the city: anywhere but straight east (the Temple Mount is right there).
    const az = Math.PI * 0.35 + r() * Math.PI * 1.3; // measured from +X, counter-clockwise
    const l = this._listener;
    e.impact = impact;
    e.active = true;
    e.burst = false;
    e.time = 0;
    if (impact) {
      const d = 600 + r() * 150;
      e.to.set(l.x + Math.cos(az) * d, 8 + r() * 25, l.z - Math.sin(az) * d);
      e.flightTime = 0;
    } else {
      // High enough (30-55 degrees up) to clear the buildings around the plaza.
      const d = 260 + r() * 320;
      e.to.set(l.x + Math.cos(az) * d, d * (0.6 + r() * 0.8), l.z - Math.sin(az) * d);
      // Launched from further out, climbing toward the rocket.
      const laz = az + (r() - 0.5) * 0.8;
      const ld = d + 250 + r() * 300;
      e.from.set(l.x + Math.cos(laz) * ld, 0, l.z - Math.sin(laz) * ld);
      e.flightTime = e.from.distanceTo(e.to) / INTERCEPTOR_SPEED;
    }
    const p = e.trail.geometry.getAttribute('position');
    p.setXYZ(0, e.from.x, e.from.y, e.from.z);
    p.setXYZ(1, e.from.x, e.from.y, e.from.z);
    p.needsUpdate = true;
    e.trail.visible = !impact;
    e.trail.material.opacity = 0.75;
  }

  /** Fixed step: schedules and advances the events. */
  update(dt) {
    if (this.barrage > 0) {
      this._timer -= dt;
      if (this._timer <= 0) {
        this._timer = (2 + this.rand() * 5) / this.barrage;
        const impact = this.rand() < 0.2;
        this._spawn(impact);
        if (!impact && this.rand() < 0.35) this._spawn(false); // a second interceptor
      }
    }
    for (const e of this.events) if (e.active) this._step(e, dt);
  }

  _step(e, dt) {
    e.time += dt;
    const t = e.time;
    if (!e.burst) {
      const f = e.flightTime > 0 ? Math.min(1, t / e.flightTime) : 1;
      const p = e.trail.geometry.getAttribute('position');
      p.setXYZ(1, e.from.x + (e.to.x - e.from.x) * f, e.from.y + (e.to.y - e.from.y) * f, e.from.z + (e.to.z - e.from.z) * f);
      p.needsUpdate = true;
      if (f >= 1) {
        e.burst = true;
        e.time = 0;
        e.flash.position.copy(e.to);
        e.smoke.position.copy(e.to);
        e.flash.visible = true;
        e.smoke.visible = !e.impact;
        e.flash.material.color.setHex(e.impact ? 0xffa050 : 0xffffff);
        if (this.onFlash) this.onFlash(this._listener.distanceTo(e.to), e.impact ? 1.4 : 1);
      }
      return;
    }
    const d = this._listener.distanceTo(e.to);
    // Flash: a quick bloom that fades in ~0.4 s.
    const fl = Math.max(0, 1 - t / 0.4);
    e.flash.material.opacity = fl;
    const size = d * (e.impact ? 0.16 : 0.12) * (0.6 + (1 - fl) * 0.8);
    e.flash.scale.set(size, size, 1);
    e.flash.visible = fl > 0;
    // Smoke puff lingers and drifts; the trail fades.
    const sm = Math.max(0, 1 - t / 9);
    e.smoke.material.opacity = 0.8 * sm;
    const ss = d * 0.085 * (0.7 + Math.min(1, t / 3) * 0.8);
    e.smoke.scale.set(ss, ss, 1);
    e.smoke.position.x += dt * 2;
    e.trail.material.opacity = 0.75 * Math.max(0, 1 - t / 6);
    if (t > 9) this._hide(e);
  }

  /** Per rendered frame: remember where the listener is. */
  frame(camera) {
    this._listener.copy(camera.position);
  }
}
