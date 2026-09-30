import { BoxGeometry, Group, Matrix4, Mesh, Quaternion, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _m = new Matrix4();
const _q = new Quaternion();
const _p = new Vector3();
const _s = new Vector3(1, 1, 1);
const Y = new Vector3(0, 1, 0);

/**
 * Collects static level geometry and merges it per color into one mesh each, so the
 * whole level is a handful of draw calls. Solid pieces are also collision; decoration
 * pieces are marked noCollision. `blocker()` adds invisible collision-only boxes
 * (out-of-bounds walls).
 */
export class StaticBatch {
  /** @param {(color: string) => import('three').Material} material */
  constructor(material) {
    this.material = material;
    this.solid = new Map();
    this.deco = new Map();
    this.blockers = new Group();
    this.blockers.name = 'blockers';
  }

  /** Adds a geometry (already in world space, or transformed by `matrix`). */
  add(geometry, color, { matrix = null, collide = true } = {}) {
    let g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (g === geometry) g = geometry.clone();
    if (g.getAttribute('uv')) g.deleteAttribute('uv');
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    if (matrix) g.applyMatrix4(matrix);
    const map = collide ? this.solid : this.deco;
    if (!map.has(color)) map.set(color, []);
    map.get(color).push(g);
    return this;
  }

  /** Axis-aligned box by its bounds. */
  box(x0, x1, y0, y1, z0, z1, color, opts) {
    const w = Math.abs(x1 - x0);
    const h = Math.abs(y1 - y0);
    const d = Math.abs(z1 - z0);
    if (w < 1e-4 || h < 1e-4 || d < 1e-4) return this;
    const geo = new BoxGeometry(w, h, d).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    return this.add(geo, color, opts);
  }

  /** Box of size w x h x d whose bottom center is at (x, y, z), turned by yaw. */
  boxAt(x, y, z, w, h, d, color, yaw = 0, opts = {}) {
    _q.setFromAxisAngle(Y, yaw);
    _m.compose(_p.set(x, y + h / 2, z), _q, _s);
    return this.add(new BoxGeometry(w, h, d), color, { ...opts, matrix: _m.clone() });
  }

  /** Invisible collision-only box by its bounds. */
  blocker(x0, x1, y0, y1, z0, z1) {
    const geo = new BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0));
    geo.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    this.blockers.add(new Mesh(geo));
    return this;
  }

  /** Merges everything into meshes under `root`. */
  build(root) {
    for (const [map, collide] of [[this.solid, true], [this.deco, false]]) {
      for (const [color, geos] of map) {
        const mesh = new Mesh(mergeGeometries(geos), this.material(color));
        mesh.name = `${collide ? 'solid' : 'deco'}:${color}`;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        if (!collide) mesh.userData.noCollision = true;
        root.add(mesh);
      }
    }
    return root;
  }
}
