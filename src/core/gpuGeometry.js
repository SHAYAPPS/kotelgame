import { BufferAttribute } from 'three/webgpu';

// WebGPU vertex formats have no 1- or 3-component 8 / 16-bit types, but our quantized models
// (glTF-Transform: int16 positions, int8 normals, uint8 part ids) use them. After loading, such
// attributes (and morph targets) are expanded to 32-bit floats, denormalized; attributes shared
// between meshes (the LODs share one vertex buffer) stay shared.

const done = new WeakMap();

function convert(a) {
  if (done.has(a)) return done.get(a);
  const arr = a.isInterleavedBufferAttribute ? a.data.array : a.array;
  const narrow = arr.BYTES_PER_ELEMENT < 4 && (a.itemSize === 1 || a.itemSize === 3);
  if (!narrow) {
    done.set(a, a);
    return a;
  }
  const n = a.count;
  const s = a.itemSize;
  const out = new Float32Array(n * s);
  for (let i = 0; i < n; i++) for (let k = 0; k < s; k++) out[i * s + k] = a.getComponent(i, k);
  const res = new BufferAttribute(out, s, false);
  res.name = a.name;
  done.set(a, res);
  return res;
}

/** Make every geometry under `root` drawable with WebGPU (see above). */
export function gpuFriendly(root) {
  root.traverse((o) => {
    const g = o.geometry;
    if (!g || done.has(g)) return;
    done.set(g, g);
    for (const name of Object.keys(g.attributes)) {
      const a = g.attributes[name];
      const c = convert(a);
      if (c !== a) g.setAttribute(name, c);
    }
    for (const [name, list] of Object.entries(g.morphAttributes ?? {})) g.morphAttributes[name] = list.map(convert);
  });
  return root;
}
