import { BoxGeometry, Float32BufferAttribute, Group, Matrix4, Mesh, Quaternion, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _m = new Matrix4();
const _q = new Quaternion();
const _p = new Vector3();
const _s = new Vector3(1, 1, 1);
const Y = new Vector3(0, 1, 0);
const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();

/**
 * World-space UVs in meters for a non-indexed geometry: each triangle is projected on the
 * plane it faces most (walls: along the ground and up; floors: x/z), so textures tile at a
 * true scale on every face of the merged level.
 */
export function worldUVs(g) {
  const pos = g.getAttribute('position');
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i += 3) {
    _a.fromBufferAttribute(pos, i);
    _b.fromBufferAttribute(pos, i + 1);
    _c.fromBufferAttribute(pos, i + 2);
    const n = _b.sub(_a).cross(_c.sub(_a)); // face normal (unnormalized)
    const ax = Math.abs(n.x);
    const ay = Math.abs(n.y);
    const az = Math.abs(n.z);
    for (let k = 0; k < 3; k++) {
      const x = pos.getX(i + k);
      const y = pos.getY(i + k);
      const z = pos.getZ(i + k);
      let u;
      let v;
      if (ay >= ax && ay >= az) {
        u = x;
        v = z;
      } else if (ax >= az) {
        u = n.x > 0 ? -z : z;
        v = y;
      } else {
        u = n.z > 0 ? x : -x;
        v = y;
      }
      uv[(i + k) * 2] = u;
      uv[(i + k) * 2 + 1] = v;
    }
  }
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  return g;
}

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
    worldUVs(g);
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
        // What it's made of, for footsteps (CollisionWorld keeps it per triangle).
        if (/wood/i.test(color)) mesh.userData.surface = 'wood';
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        if (!collide) mesh.userData.noCollision = true;
        root.add(mesh);
      }
    }
    return root;
  }
}
