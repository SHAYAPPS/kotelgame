// Compact animation library (anims.bin): every clip at a fixed frame rate with every bone,
// so no per-track metadata is needed (a glTF with ~4000 channels is mostly JSON). Per clip
// two meshopt-compressed blocks (the same codec and filters as EXT_meshopt_compression):
//   rot: bones x frames quaternions, track-major (QUATERNION filter, 16 bit)
//   vec: vec3 tracks x frames (EXPONENTIAL filter): hips translation, then the IK targets
// The game decodes it with three's MeshoptDecoder (src/characters/animLibrary.js).
import { MeshoptEncoder } from 'meshoptimizer';

await MeshoptEncoder.ready;

/**
 * @param {string[]} bones rotation track order (all clips)
 * @param {{ name: string, s: object, ik: object|null }[]} clips sampled clips (anim.mjs)
 * @param {Map<string, number[]>} rest rest rotation per bone (fills bones a clip lacks)
 * @returns {{ bin: Uint8Array, index: object }}
 */
export function encodeLibrary(bones, clips, rest) {
  const chunks = [];
  let offset = 0;
  const index = {};
  const push = (bytes) => {
    const at = offset;
    chunks.push(bytes);
    offset += bytes.length;
    // Keep blocks 4-byte aligned.
    const pad = (4 - (offset % 4)) % 4;
    if (pad) {
      chunks.push(new Uint8Array(pad));
      offset += pad;
    }
    return at;
  };
  for (const { name, s, ik } of clips) {
    const F = s.frames;
    const quat = new Float32Array(bones.length * F * 4);
    bones.forEach((b, i) => {
      const arr = s.rot.get(b);
      for (let f = 0; f < F; f++) quat.set(arr ? arr.subarray(f * 4, f * 4 + 4) : rest.get(b), (i * F + f) * 4);
    });
    const rotEnc = MeshoptEncoder.encodeGltfBuffer(MeshoptEncoder.encodeFilterQuat(quat, bones.length * F, 8, 16), bones.length * F, 8, 'ATTRIBUTES');
    const vecs = [s.hips];
    if (ik) vecs.push(ik.R.t, ik.L.t);
    const vec = new Float32Array(vecs.length * F * 3);
    vecs.forEach((v, i) => vec.set(v, i * F * 3));
    const vecEnc = MeshoptEncoder.encodeGltfBuffer(MeshoptEncoder.encodeFilterExp(vec, vecs.length * F, 12, 18), vecs.length * F, 12, 'ATTRIBUTES');
    // IK target rotations (right hand vs Spine2, left hand vs right hand).
    let ikRot = null;
    if (ik) {
      const q = new Float32Array(2 * F * 4);
      q.set(ik.R.q, 0);
      q.set(ik.L.q, F * 4);
      ikRot = MeshoptEncoder.encodeGltfBuffer(MeshoptEncoder.encodeFilterQuat(q, 2 * F, 8, 16), 2 * F, 8, 'ATTRIBUTES');
    }
    index[name] = {
      fps: s.fps,
      frames: F,
      rot: [push(rotEnc), rotEnc.length],
      vec: [push(vecEnc), vecEnc.length, vecs.length],
      ...(ikRot ? { ikRot: [push(ikRot), ikRot.length] } : {}),
    };
  }
  const bin = new Uint8Array(offset);
  let at = 0;
  for (const c of chunks) {
    bin.set(c, at);
    at += c.length;
  }
  return { bin, index };
}
