import { BoxGeometry, CanvasTexture, Color, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace } from 'three';
import { LANE } from './Checkpoint.js';

// The security checkpoint's moving parts (story/Checkpoint.js is the logic): the bag on the
// belt and on the inspection table, the little table, the X-ray screen (a canvas: the bag's
// contents in the false colors of a baggage scanner) and the detector's light.

const BAGS = {
  backpack: { size: [0.32, 0.42, 0.2], color: 0x3b5c9a },
  big: { size: [0.52, 0.42, 0.3], color: 0xb0453c },
  shoulder: { size: [0.36, 0.26, 0.12], color: 0x8a5a32 },
};

// X-ray colors: organic orange, mixed green, metal blue (dense: darker).
const ORG = '#e6902e';
const ORG_D = '#b0601a';
const MIX = '#58b058';
const MET = '#2f5ec8';
const MET_D = '#1a2f80';

/** Draws each item's X-ray silhouette (in a w x h box centered at 0, 0). */
const SHAPES = {
  siddur(g) {
    g.fillStyle = ORG_D;
    g.fillRect(-26, -36, 52, 72);
    g.fillStyle = ORG;
    g.fillRect(-22, -32, 44, 64);
  },
  tallit(g) {
    g.fillStyle = 'rgba(230,144,46,0.55)';
    g.beginPath();
    g.ellipse(0, 0, 48, 30, 0.2, 0, Math.PI * 2);
    g.fill();
  },
  bottle(g) {
    g.strokeStyle = MIX;
    g.lineWidth = 3;
    g.strokeRect(-11, -40, 22, 70);
    g.fillStyle = 'rgba(88,176,88,0.35)';
    g.fillRect(-11, -20, 22, 50);
    g.fillRect(-5, -48, 10, 8);
  },
  phone(g) {
    g.fillStyle = MIX;
    g.fillRect(-14, -26, 28, 52);
    g.fillStyle = MET_D;
    g.fillRect(-9, -10, 18, 26);
  },
  charger(g) {
    g.fillStyle = MET;
    g.fillRect(-10, -10, 20, 20);
    g.strokeStyle = MIX;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(10, 0);
    g.bezierCurveTo(40, -30, 50, 30, 20, 34);
    g.stroke();
  },
  camera(g) {
    g.fillStyle = MIX;
    g.fillRect(-28, -18, 56, 36);
    g.fillStyle = MET_D;
    g.beginPath();
    g.arc(4, 0, 13, 0, Math.PI * 2);
    g.fill();
  },
  map(g) {
    g.fillStyle = 'rgba(230,144,46,0.4)';
    g.fillRect(-30, -20, 60, 40);
  },
  pot(g) {
    g.fillStyle = ORG_D;
    g.beginPath();
    g.ellipse(0, 0, 46, 34, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = MET;
    g.lineWidth = 5;
    g.stroke();
  },
  box(g) {
    g.fillStyle = ORG;
    g.fillRect(-28, -18, 56, 36);
    g.strokeStyle = MIX;
    g.lineWidth = 2;
    g.strokeRect(-28, -18, 56, 36);
  },
  pitas(g) {
    g.fillStyle = 'rgba(230,144,46,0.7)';
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.ellipse(i * 6 - 6, i * 3 - 3, 30, 26, 0, 0, Math.PI * 2);
      g.fill();
    }
  },
  thermos(g) {
    g.fillStyle = MET;
    g.fillRect(-14, -44, 28, 88);
    g.fillStyle = MET_D;
    g.fillRect(-14, -50, 28, 10);
  },
  cake(g) {
    g.fillStyle = ORG_D;
    g.fillRect(-34, -16, 68, 32);
  },
  knife(g) {
    // A folding knife: the handle and the blade, unmistakable.
    g.fillStyle = MET_D;
    g.fillRect(-36, -6, 34, 12);
    g.fillStyle = MET;
    g.beginPath();
    g.moveTo(-2, -5);
    g.lineTo(40, -2);
    g.lineTo(46, 4);
    g.lineTo(-2, 5);
    g.closePath();
    g.fill();
  },
  wallet(g) {
    g.fillStyle = ORG;
    g.fillRect(-20, -14, 40, 28);
    g.fillStyle = MET;
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.arc(-10 + i * 7, 4, 4, 0, Math.PI * 2);
      g.fill();
    }
  },
  snacks(g) {
    g.fillStyle = 'rgba(230,144,46,0.5)';
    g.beginPath();
    g.moveTo(-30, -24);
    g.lineTo(28, -28);
    g.lineTo(32, 26);
    g.lineTo(-26, 30);
    g.closePath();
    g.fill();
  },
  toy(g) {
    g.fillStyle = MIX;
    g.fillRect(-24, -10, 48, 18);
    g.fillStyle = MET;
    for (const x of [-14, 14]) {
      g.beginPath();
      g.arc(x, 10, 7, 0, Math.PI * 2);
      g.fill();
    }
  },
};

/** The scanner's picture of a bag: its outline and contents (seeded layout). */
export function drawXray(canvas, bag) {
  const g = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  g.fillStyle = '#e9eef2';
  g.fillRect(0, 0, w, h);
  if (!bag) {
    g.fillStyle = '#9aa6b0';
    g.font = `${Math.round(h * 0.1)}px sans-serif`;
    g.textAlign = 'center';
    g.fillText('X-RAY · READY', w / 2, h / 2);
    return;
  }
  let seed = Math.floor((bag.seed ?? 0.5) * 1e6) || 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // The bag: a soft outline, zips and straps (mixed).
  g.save();
  g.translate(w / 2, h / 2);
  g.fillStyle = 'rgba(230,144,46,0.18)';
  g.strokeStyle = 'rgba(88,176,88,0.8)';
  g.lineWidth = 3;
  const bw = w * 0.82;
  const bh = h * 0.78;
  g.beginPath();
  g.roundRect(-bw / 2, -bh / 2, bw, bh, 18);
  g.fill();
  g.stroke();
  g.restore();
  const items = bag.items ?? [];
  const n = items.length;
  items.forEach((it, i) => {
    const draw = SHAPES[it];
    if (!draw) return;
    g.save();
    const col = (i + 0.5) / n;
    g.translate(w * (0.16 + 0.68 * col) + (rnd() - 0.5) * 18, h * (0.5 + (rnd() - 0.5) * 0.35));
    g.rotate((rnd() - 0.5) * 0.9);
    const s = (h / 200) * (0.9 + rnd() * 0.25);
    g.scale(s, s);
    draw(g);
    g.restore();
  });
  // The scan lines of a monitor.
  g.fillStyle = 'rgba(0,0,0,0.05)';
  for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1);
}

export class CheckpointView {
  /** @param {import('three').Scene} scene */
  constructor(scene) {
    this.root = new Group();
    this.root.name = 'checkpoint';
    scene.add(this.root);
    const mat = (color, o = {}) => new MeshStandardMaterial({ color, roughness: 0.8, ...o });
    // The inspection table, with the screen on it facing the player.
    const [tx, ty, tz] = LANE.table;
    const table = new Mesh(new BoxGeometry(0.6, 0.04, 0.8), mat(0x6b6f74, { metalness: 0.3, roughness: 0.5 }));
    table.position.set(tx, ty - 0.02, tz);
    const legs = new Mesh(new BoxGeometry(0.56, ty - 1.2 - 0.04, 0.76), mat(0x3a3d40));
    legs.position.set(tx, 1.2 + (ty - 1.2 - 0.04) / 2, tz);
    legs.scale.set(1, 1, 1);
    this.root.add(table, legs);
    const [mx, my, mz] = LANE.monitor;
    const body = new Mesh(new BoxGeometry(0.5, 0.34, 0.06), mat(0x1c1d20));
    body.position.set(mx, my, mz + 0.035);
    const stand = new Mesh(new BoxGeometry(0.06, my - ty - 0.17, 0.06), mat(0x1c1d20));
    stand.position.set(mx, ty + (my - ty - 0.17) / 2, mz + 0.06);
    this.canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    if (this.canvas) {
      this.canvas.width = 320;
      this.canvas.height = 208;
      drawXray(this.canvas, null);
      this.texture = new CanvasTexture(this.canvas);
      this.texture.colorSpace = SRGBColorSpace;
    }
    // The screen glows (lit at night, never shaded).
    this.screen = new Mesh(new PlaneGeometry(0.46, 0.3), new MeshBasicMaterial({ map: this.texture ?? null, color: new Color(1.15, 1.15, 1.15), toneMapped: true }));
    this.screen.position.set(mx, my, mz);
    this.screen.rotation.y = Math.PI; // facing north (-Z), toward the player
    this.screen.userData.noCSM = true;
    this.root.add(body, stand, this.screen);
    // The detector's light: green, red while it beeps.
    const [lx, ly, lz] = LANE.detector;
    this.lightMat = new MeshBasicMaterial({ color: new Color(0.2, 2.2, 0.5), toneMapped: false });
    this.light = new Mesh(new BoxGeometry(0.5, 0.06, 0.08), this.lightMat);
    this.light.position.set(lx, ly, lz - 0.32);
    this.light.userData.noCSM = true;
    this.root.add(this.light);
    // The bag (one mesh per kind, the one in play shown).
    this.bags = {};
    for (const [k, b] of Object.entries(BAGS)) {
      const m = new Mesh(new BoxGeometry(...b.size), mat(b.color, { roughness: 0.85 }));
      m.castShadow = true;
      m.visible = false;
      this.bags[k] = m;
      this.root.add(m);
    }
    this._drawn = null;
  }

  /** @param {import('./Checkpoint.js').Checkpoint} cp */
  update(cp) {
    this.root.visible = !!cp;
    if (!cp) return;
    const b = cp.bag;
    for (const [k, m] of Object.entries(this.bags)) {
      const on = b.visible && b.kind === k;
      m.visible = on;
      if (!on) continue;
      const h = BAGS[k].size[1];
      m.position.set(b.at[0], b.at[1] + h / 2, b.at[2]);
      // Lying on the belt, standing on the table, the top flopped open once opened.
      m.rotation.set(b.onTable ? 0 : Math.PI / 2, b.onTable ? 0.4 : 0, b.open ? 0.25 : 0);
      if (!b.onTable) m.position.y = b.at[1] + BAGS[k].size[2] / 2;
    }
    // The screen: the bag's picture once it went through the machine.
    const key = b.visible && b.scanned ? `${b.seed}:${b.items.join(',')}` : null;
    if (key !== this._drawn && this.canvas) {
      this._drawn = key;
      drawXray(this.canvas, key ? b : null);
      this.texture.needsUpdate = true;
    }
    const red = cp.gate.beep > 0 && Math.floor(cp.gate.beep * 6) % 2 === 0;
    this.lightMat.color.setRGB(red ? 3 : 0.2, red ? 0.2 : 2.2, red ? 0.15 : 0.5);
  }

  /** The table's footprint (the player is kept out of it): [x0, x1, z0, z1]. */
  get tableBox() {
    const [tx, , tz] = LANE.table;
    return [tx - 0.3, tx + 0.3, tz - 0.4, tz + 0.4];
  }
}
