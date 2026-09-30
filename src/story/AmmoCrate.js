import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';

const W = 1.0; // along its local X
const D = 0.6;
const H = 0.55;

let shared = null;
function assets() {
  if (shared) return shared;
  shared = {
    box: new BoxGeometry(W, H, D).translate(0, H / 2, 0),
    lid: new BoxGeometry(W + 0.04, 0.06, D + 0.04).translate(0, H + 0.03, 0),
    band: new BoxGeometry(0.06, H + 0.02, D + 0.02).translate(0, H / 2, 0),
    ammo: new BoxGeometry(0.28, 0.12, 0.2).translate(0, 0.06, 0),
    wood: new MeshStandardMaterial({ color: 0x5c6636, roughness: 0.85 }),
    dark: new MeshStandardMaterial({ color: 0x3a4122, roughness: 0.8 }),
    can: new MeshStandardMaterial({ color: 0x4d5a2e, roughness: 0.6, metalness: 0.1 }),
  };
  return shared;
}

const _t = new Vector3();

/**
 * An ammo crate: E next to it refills your ammo and grenades. It has no entry in the
 * static collision world (that is built once); the player is pushed out of its box.
 */
export class AmmoCrate {
  /** @param {{ id: string, position: Vector3, yaw?: number }} opts */
  constructor({ id, position, yaw = 0 }) {
    this.id = id;
    this.position = position.clone();
    this.yaw = yaw;
    this.root = null;
  }

  /** The three.js object (built on demand, so tests never need it). */
  view() {
    if (this.root) return this.root;
    const a = assets();
    const g = new Group();
    const box = new Mesh(a.box, a.wood);
    const lid = new Mesh(a.lid, a.dark);
    lid.position.x = -0.06;
    lid.rotation.z = 0.08; // lid ajar
    g.add(box, lid);
    for (const x of [-0.35, 0.35]) {
      const band = new Mesh(a.band, a.dark);
      band.position.x = x;
      g.add(band);
    }
    // Ammo cans stacked beside it.
    for (let i = 0; i < 3; i++) {
      const can = new Mesh(a.ammo, a.can);
      can.position.set(0.75, i * 0.12, (i % 2) * 0.05);
      can.rotation.y = i * 0.3;
      g.add(can);
    }
    g.traverse((m) => {
      m.castShadow = true;
      m.receiveShadow = true;
    });
    g.position.copy(this.position);
    g.rotation.y = this.yaw;
    this.root = g;
    return g;
  }

  /** Is the eye close enough and looking at it? */
  inReach(eye, dir, range = 2.4, angle = 0.6) {
    _t.set(this.position.x, this.position.y + H * 0.6, this.position.z).sub(eye);
    const d = _t.length();
    if (d > range) return false;
    if (d < 0.9) return true;
    return Math.acos(Math.min(1, _t.dot(dir) / d)) < angle;
  }

  /** Push a body (feet position, radius) out of the crate's footprint (with its cans). */
  pushOut(pos, radius) {
    if (Math.abs(pos.y - this.position.y) > 1.2) return;
    // Into the crate's local frame.
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    const dx = pos.x - this.position.x;
    const dz = pos.z - this.position.z;
    const lx = dx * c - dz * s;
    const lz = dx * s + dz * c;
    const hx = W / 2 + 0.3 + radius; // + the cans on the +X side (approximate)
    const hz = D / 2 + radius;
    const cx = 0.15; // box center shifted toward the cans
    const ox = lx - cx;
    if (Math.abs(ox) >= hx || Math.abs(lz) >= hz) return;
    // Out along the shallower axis.
    let nx = ox;
    let nz = lz;
    if (hx - Math.abs(ox) < hz - Math.abs(lz)) nx = Math.sign(ox || 1) * hx;
    else nz = Math.sign(lz || 1) * hz;
    const wx = nx + cx;
    pos.x = this.position.x + wx * c + nz * s;
    pos.z = this.position.z - wx * s + nz * c;
  }

  dispose() {
    this.root?.removeFromParent();
  }
}
