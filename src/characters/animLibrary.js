import { AnimationClip, QuaternionKeyframeTrack, VectorKeyframeTrack } from 'three';

/**
 * Decodes anims.bin (scripts/assets/lib/animbin.mjs) into three.js clips. Pure data work:
 * `decoder` is three's MeshoptDecoder (awaited `ready`).
 *
 * Tracks per clip: every animated bone's quaternion, the hips translation, and for rifle
 * clips the IK targets `ikHandR` (right hand in Spine2 space) and `ikHandL` (left hand in
 * right-hand space) as position + quaternion.
 * @param {{ bones: string[], clips: Record<string, object> }} anims manifest.anims
 * @param {ArrayBuffer} buffer anims.bin
 * @returns {Map<string, AnimationClip>}
 */
export function decodeClips(anims, buffer, decoder) {
  const bytes = new Uint8Array(buffer);
  const bones = anims.bones;
  const clips = new Map();
  for (const [name, c] of Object.entries(anims.clips)) {
    const F = c.frames;
    const times = new Float32Array(F);
    for (let f = 0; f < F; f++) times[f] = f / c.fps;
    const quats = decodeQuats(decoder, bytes, c.rot, bones.length * F);
    const tracks = [];
    bones.forEach((b, i) => tracks.push(new QuaternionKeyframeTrack(`${b}.quaternion`, times, quats.slice(i * F * 4, (i + 1) * F * 4))));
    const [vOff, vLen, vCount] = c.vec;
    const vec = new Uint8Array(vCount * F * 12);
    decoder.decodeGltfBuffer(vec, vCount * F, 12, bytes.subarray(vOff, vOff + vLen), 'ATTRIBUTES', 'EXPONENTIAL');
    const v = new Float32Array(vec.buffer);
    tracks.push(new VectorKeyframeTrack('Hips.position', times, v.slice(0, F * 3)));
    if (c.ikRot) {
      const q = decodeQuats(decoder, bytes, c.ikRot, 2 * F);
      tracks.push(new VectorKeyframeTrack('ikHandR.position', times, v.slice(F * 3, F * 6)));
      tracks.push(new VectorKeyframeTrack('ikHandL.position', times, v.slice(F * 6, F * 9)));
      tracks.push(new QuaternionKeyframeTrack('ikHandR.quaternion', times, q.slice(0, F * 4)));
      tracks.push(new QuaternionKeyframeTrack('ikHandL.quaternion', times, q.slice(F * 4, F * 8)));
    }
    clips.set(name, new AnimationClip(name, (F - 1) / c.fps, tracks));
  }
  return clips;
}

function decodeQuats(decoder, bytes, [offset, length], count) {
  const raw = new Uint8Array(count * 8);
  decoder.decodeGltfBuffer(raw, count, 8, bytes.subarray(offset, offset + length), 'ATTRIBUTES', 'QUATERNION');
  const i16 = new Int16Array(raw.buffer);
  const out = new Float32Array(count * 4);
  for (let i = 0; i < out.length; i++) out[i] = i16[i] / 32767;
  return out;
}
