import {
  BufferAttribute,
  BufferGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Points,
  PointsMaterial,
  Vector3,
} from 'three';
import { ENEMY } from './config.js';
import { placeLocal } from './Enemy.js';
import { HE } from '../ui/strings.he.js';

const STATE_COLORS = {
  idle: [0.3, 0.9, 0.4],
  alerted: [1, 0.8, 0.2],
  combat: [1, 0.25, 0.2],
  dead: [0.5, 0.5, 0.5],
};
const CONE_SEGMENTS = 16;
const CONE_DRAW_RANGE = 18; // draw the cone shorter than the real 70 m so it stays readable
const MAX_PATH = 64;
const _v = new Vector3();
const _h = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
const _ax = new Vector3();
const _u = new Vector3();
const _w = new Vector3();
const ZONE_AGENTS = 64;
const ZONE_SEGS = 12; // per circle
const ZONE_FLOATS = (3 * ZONE_SEGS + 2 * ZONE_SEGS + 4) * 6; // per agent: head (3 circles), capsule (2 rings + 4 sides)

/**
 * Dev overlay (F1): the navmesh, cover points, and per enemy the vision cone, the
 * current path and a state label.
 */
export class DebugDraw {
  constructor(scene, camera, manager) {
    this.scene = scene;
    this.camera = camera;
    this.manager = manager;
    this.group = new Group();
    this.group.visible = false;
    scene.add(this.group);
    this.visible = false;
    this.built = false;
    this.cones = new Map(); // enemy -> { lines, label }
  }

  toggle() {
    this.setVisible(!this.visible);
  }

  setVisible(v) {
    this.visible = v;
    if (v && !this.built) this._buildStatic();
    this.group.visible = v;
    for (const { label } of this.cones.values()) label.hidden = !v;
  }

  _buildStatic() {
    this.built = true;
    // Hit zones (head sphere, body capsule) of every combatant with an animated model.
    this.zonePos = new Float32Array(ZONE_AGENTS * ZONE_FLOATS);
    const zg = new BufferGeometry();
    zg.setAttribute('position', new BufferAttribute(this.zonePos, 3));
    this.zones = new LineSegments(zg, new LineBasicMaterial({ color: 0xff40ff, depthTest: false, transparent: true, opacity: 0.85, toneMapped: false }));
    this.zones.frustumCulled = false;
    this.zones.renderOrder = 10;
    this.group.add(this.zones);
    const nav = this.manager.nav;
    // Navmesh: one point per walkable cell (pale near walls, where paths avoid going).
    const pts = [];
    const cols = [];
    for (let i = 0; i < nav.nodeCount; i++) {
      if (!nav.active[i]) continue;
      pts.push(nav.nodeX(i), nav.y[i] + 0.06, nav.nodeZ(i));
      const edge = nav.wallPenalty[i] > 0;
      cols.push(edge ? 0.9 : 0.2, edge ? 0.75 : 0.55, edge ? 0.3 : 1.0);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(pts), 3));
    g.setAttribute('color', new BufferAttribute(new Float32Array(cols), 3));
    this.navPoints = new Points(g, new PointsMaterial({ size: 0.09, vertexColors: true, depthWrite: false, toneMapped: false }));
    this.group.add(this.navPoints);

    // Cover points: a short post plus a tick toward the obstacle.
    const cover = this.manager.cover.points;
    this.coverPos = new Float32Array(cover.length * 12);
    this.coverCol = new Float32Array(cover.length * 12);
    cover.forEach((p, i) => {
      const o = i * 12;
      const y = p.y + 0.05;
      this.coverPos.set([p.x, y, p.z, p.x, y + 0.9, p.z, p.x, y + 0.9, p.z, p.x + p.dx * 0.4, y + 0.9, p.z + p.dz * 0.4], o);
    });
    const cg = new BufferGeometry();
    cg.setAttribute('position', new BufferAttribute(this.coverPos, 3));
    cg.setAttribute('color', new BufferAttribute(this.coverCol, 3));
    this.coverLines = new LineSegments(cg, new LineBasicMaterial({ vertexColors: true, toneMapped: false }));
    this.coverLines.frustumCulled = false;
    this.group.add(this.coverLines);
  }

  _coneFor(enemy) {
    let c = this.cones.get(enemy);
    if (c) return c;
    // Cone: two edges + an arc; path: up to MAX_PATH segments.
    const verts = (2 + CONE_SEGMENTS + MAX_PATH) * 2;
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(verts * 3), 3));
    g.setAttribute('color', new BufferAttribute(new Float32Array(verts * 3), 3));
    const lines = new LineSegments(g, new LineBasicMaterial({ vertexColors: true, toneMapped: false, depthTest: false }));
    lines.frustumCulled = false;
    lines.renderOrder = 10;
    this.group.add(lines);
    const label = document.createElement('div');
    label.className = 'enemy-label';
    label.dir = 'rtl';
    label.hidden = !this.visible;
    document.body.append(label);
    c = { lines, label, text: '' };
    this.cones.set(enemy, c);
    return c;
  }

  /** Hit zones as wireframes (the same shapes modelHitTest uses). */
  _drawZones() {
    const out = this.zonePos;
    let o = 0;
    const seg = (p, q) => {
      out[o++] = p.x; out[o++] = p.y; out[o++] = p.z;
      out[o++] = q.x; out[o++] = q.y; out[o++] = q.z;
    };
    const circle = (c, r, u, w) => {
      for (let i = 0; i < ZONE_SEGS; i++) {
        const t0 = (i / ZONE_SEGS) * Math.PI * 2;
        const t1 = ((i + 1) / ZONE_SEGS) * Math.PI * 2;
        seg(_v.copy(c).addScaledVector(u, Math.cos(t0) * r).addScaledVector(w, Math.sin(t0) * r), _ax.copy(c).addScaledVector(u, Math.cos(t1) * r).addScaledVector(w, Math.sin(t1) * r));
      }
    };
    const X = new Vector3(1, 0, 0), Y = new Vector3(0, 1, 0), Z = new Vector3(0, 0, 1);
    let n = 0;
    for (const e of [...this.manager.enemies, ...this.manager.friendlies]) {
      const hs = e.hitShape;
      if (!hs?.valid || !e.alive || n >= ZONE_AGENTS) continue;
      n++;
      const c = e.cfg;
      placeLocal(_h, hs, e.position, hs.head);
      circle(_h, c.headRadius, X, Y);
      circle(_h, c.headRadius, Y, Z);
      circle(_h, c.headRadius, Z, X);
      placeLocal(_a, hs, e.position, hs.a);
      placeLocal(_b, hs, e.position, hs.b);
      _ax.subVectors(_a, _b);
      const len = _ax.length();
      if (len > 1e-4) _b.addScaledVector(_ax, Math.min(c.radius, len * 0.5) / len);
      _ax.subVectors(_b, _a).normalize();
      _u.crossVectors(_ax, Math.abs(_ax.y) < 0.9 ? Y : X).normalize();
      _w.crossVectors(_ax, _u);
      const u = _u.clone();
      const w = _w.clone();
      circle(_a, c.radius, u, w);
      circle(_b, c.radius, u, w);
      for (const k of [u, w, u.clone().negate(), w.clone().negate()]) seg(_v.copy(_a).addScaledVector(k, c.radius), _h.copy(_b).addScaledVector(k, c.radius));
    }
    out.fill(0, o);
    this.zones.geometry.attributes.position.needsUpdate = true;
    this.zones.geometry.setDrawRange(0, o / 3);
  }

  update() {
    if (this.visible && this.zones) this._drawZones();
    // Drop overlays of enemies that no longer exist.
    const live = new Set(this.manager.enemies);
    for (const [enemy, c] of this.cones) {
      if (live.has(enemy)) continue;
      c.lines.removeFromParent();
      c.label.remove();
      this.cones.delete(enemy);
    }
    if (!this.visible) return;

    const cover = this.manager.cover.points;
    for (let i = 0; i < cover.length; i++) {
      const p = cover[i];
      const col = p.owner ? [1, 1, 1] : p.low ? [0.2, 0.9, 1] : [1, 0.3, 0.9];
      for (let k = 0; k < 4; k++) this.coverCol.set(col, i * 12 + k * 3);
    }
    this.coverLines.geometry.attributes.color.needsUpdate = true;

    const w = window.innerWidth;
    const h = window.innerHeight;
    for (const e of live) {
      const c = this._coneFor(e);
      const pos = c.lines.geometry.attributes.position.array;
      const col = c.lines.geometry.attributes.color.array;
      pos.fill(0);
      col.fill(0);
      const color = STATE_COLORS[e.state];
      let v = 0;
      const push = (x, y, z, rgb) => {
        pos[v * 3] = x;
        pos[v * 3 + 1] = y;
        pos[v * 3 + 2] = z;
        col[v * 3] = rgb[0];
        col[v * 3 + 1] = rgb[1];
        col[v * 3 + 2] = rgb[2];
        v++;
      };
      if (e.alive) {
        const ey = e.eye.y - 0.3;
        const half = ENEMY.visionFov / 2;
        const ray = (a) => [e.eye.x - Math.sin(e.facing + a) * CONE_DRAW_RANGE, ey, e.eye.z - Math.cos(e.facing + a) * CONE_DRAW_RANGE];
        for (const a of [-half, half]) {
          push(e.eye.x, ey, e.eye.z, color);
          push(...ray(a), color);
        }
        for (let s = 0; s < CONE_SEGMENTS; s++) {
          push(...ray(-half + (2 * half * s) / CONE_SEGMENTS), color);
          push(...ray(-half + (2 * half * (s + 1)) / CONE_SEGMENTS), color);
        }
        if (e.moving && e.path) {
          let prev = e.position;
          for (let k = e.pathIndex; k < e.path.length && k - e.pathIndex < MAX_PATH; k++) {
            push(prev.x, prev.y + 0.15, prev.z, [1, 1, 1]);
            push(e.path[k].x, e.path[k].y + 0.15, e.path[k].z, [1, 1, 1]);
            prev = e.path[k];
          }
        }
      }
      c.lines.geometry.attributes.position.needsUpdate = true;
      c.lines.geometry.attributes.color.needsUpdate = true;

      // Label above the head.
      const text = `${HE.enemyState[e.state]}${e.state === 'combat' && HE.enemyMode[e.mode] ? ` · ${HE.enemyMode[e.mode]}` : ''} · ${Math.round(e.health)}`;
      if (text !== c.text) {
        c.text = text;
        c.label.textContent = text;
      }
      _v.set(e.position.x, e.position.y + 2.15, e.position.z).project(this.camera);
      const onScreen = _v.z < 1 && Math.abs(_v.x) < 1.1 && Math.abs(_v.y) < 1.1;
      c.label.hidden = !onScreen;
      if (onScreen) {
        c.label.style.left = `${((_v.x + 1) / 2) * w}px`;
        c.label.style.top = `${((1 - _v.y) / 2) * h}px`;
      }
    }
  }
}
