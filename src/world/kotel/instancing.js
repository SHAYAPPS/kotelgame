import { BoxGeometry, Euler, InstancedMesh, Matrix4, Mesh, Quaternion, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _q = new Quaternion();
const _e = new Euler();
const _p = new Vector3();
const _s = new Vector3();

/** Matrix for a prop placed at (x, y, z) turned by `yaw` around +Y. */
export function placement(x, y, z, yaw = 0, scale = 1) {
  _q.setFromEuler(_e.set(0, yaw, 0));
  return new Matrix4().compose(_p.set(x, y, z), _q, _s.setScalar(scale));
}

/**
 * A prop made of parts (geometry + material + local offset) that is drawn with one
 * InstancedMesh per material, so hundreds of chairs cost a handful of draw calls.
 * Collision uses one simple box per placed prop (not the detailed parts).
 */
export class PropType {
  /**
   * @param {string} name
   * @param {{ size: [number, number, number], center?: [number, number, number] } | null} collider
   *   local-space collision box (null = no collision)
   */
  constructor(name, collider) {
    this.name = name;
    this.collider = collider;
    this.parts = [];
    this.placements = [];
  }

  /** Adds a part: `geometry` positioned at `offset` (and rotated by `rot`) in prop space. */
  part(geometry, material, offset = [0, 0, 0], rot = [0, 0, 0]) {
    _q.setFromEuler(_e.set(rot[0], rot[1], rot[2]));
    const local = new Matrix4().compose(_p.set(offset[0], offset[1], offset[2]), _q, _s.set(1, 1, 1));
    this.parts.push({ geometry, material, local });
    return this;
  }

  /** Places one copy of the prop. */
  add(matrix) {
    this.placements.push(matrix);
    return this;
  }

  /**
   * Builds the instanced meshes into `visualRoot` and the collision boxes into
   * `collisionRoot` (a group that is never rendered).
   */
  build(visualRoot, collisionRoot, { castShadow = true } = {}) {
    const n = this.placements.length;
    if (n === 0) return;
    // Merge all parts that share a material: one InstancedMesh (one draw call) per material.
    const byMaterial = new Map();
    for (const { geometry, material, local } of this.parts) {
      const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
      g.deleteAttribute('uv');
      g.applyMatrix4(local);
      if (!byMaterial.has(material)) byMaterial.set(material, []);
      byMaterial.get(material).push(g);
    }
    for (const [material, geos] of byMaterial) {
      const merged = mergeGeometries(geos);
      const mesh = new InstancedMesh(merged, material, n);
      mesh.name = this.name;
      mesh.castShadow = castShadow;
      mesh.receiveShadow = true;
      mesh.userData.noCollision = true; // collision comes from the simple boxes below
      for (let i = 0; i < n; i++) mesh.setMatrixAt(i, this.placements[i]);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      visualRoot.add(mesh);
    }
    if (this.collider && collisionRoot) {
      const [w, h, d] = this.collider.size;
      const [cx, cy, cz] = this.collider.center ?? [0, h / 2, 0];
      const geo = new BoxGeometry(w, h, d).translate(cx, cy, cz);
      for (let i = 0; i < n; i++) {
        const box = new Mesh(geo);
        box.matrixAutoUpdate = false;
        box.matrix.copy(this.placements[i]);
        collisionRoot.add(box);
      }
    }
  }
}
