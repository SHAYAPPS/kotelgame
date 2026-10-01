// The plaza's reverb: a generated stereo impulse response for an open stone square walled
// in on most sides (pure, no Web Audio: tested in tests/audio.test.js).
//
// Out in the open the sound doesn't build up the dense tail of a hall: what you hear are
// discrete slaps off the big flat surfaces (the Western Wall, the buildings around the
// plaza, the terraces), each a little duller than the last, smeared into a short diffuse
// decay. The early taps are spaced like those surfaces (meters / 343 m/s, there and back).

export const PLAZA = {
  duration: 2.4, // s
  // Early reflections: [delay s, gain, pan -1..1 (left / right), dullness 0..1]
  taps: [
    [0.024, 0.42, -0.2, 0.1], // the ground / nearby balustrade
    [0.071, 0.55, 0.55, 0.15], // the Western Wall (~12 m)
    [0.118, 0.38, -0.6, 0.3], // the buildings on the far side
    [0.163, 0.33, 0.25, 0.35],
    [0.214, 0.26, -0.15, 0.45],
    [0.29, 0.2, 0.7, 0.55], // the terraces / the Old City's walls
    [0.37, 0.14, -0.5, 0.65],
    [0.47, 0.09, 0.35, 0.75],
  ],
  tail: 0.22, // diffuse level
  decay: 0.55, // s: time constant of the diffuse tail (RT60 ~ 1.3 s)
  damping: 0.8, // how much duller the tail gets as it decays
};

/** A deterministic noise source (same IR every run). */
function rng(seed) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647 - 0.5;
  };
}

/**
 * @param {number} sampleRate
 * @param {typeof PLAZA} [p]
 * @returns {[Float32Array, Float32Array]} left, right
 */
export function plazaImpulse(sampleRate, p = PLAZA) {
  const len = Math.floor(sampleRate * p.duration);
  const out = [new Float32Array(len), new Float32Array(len)];
  for (let ch = 0; ch < 2; ch++) {
    const d = out[ch];
    const r = rng(ch ? 977 : 131);
    // Diffuse tail: noise, onset ramp, exponential decay, a one-pole lowpass closing down.
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sampleRate;
      const cutoff = 0.65 * Math.exp((-t * p.damping) / p.decay) + 0.04;
      lp += (r() * 2 - lp) * cutoff;
      d[i] = lp * p.tail * Math.exp(-t / p.decay) * Math.min(1, t / 0.035);
    }
    // Early slaps: short dull clicks (a few ms of filtered noise), panned.
    for (const [t, g, pan, dull] of p.taps) {
      const side = ch === 0 ? 0.5 - pan * 0.5 : 0.5 + pan * 0.5;
      const at = Math.floor((t + (ch ? 0.0007 * pan : 0)) * sampleRate);
      let s = 0;
      const n = Math.floor(0.006 * sampleRate);
      for (let k = 0; k < n && at + k < len; k++) {
        s += (r() * 2 - s) * (1 - dull * 0.85);
        d[at + k] += s * g * 1.6 * (0.35 + side) * Math.exp(-k / (n * 0.35));
      }
    }
  }
  return out;
}

/**
 * The slap-back off one flat wall: delay and level for a sound at `source` heard at
 * `listener` (both {x,y,z}), for a wall plane n.p + d = 0 (n unit; either side). Returns
 * null when they are on opposite sides or the echo's path is longer than the wall's `reach`.
 */
export function wallEcho(source, listener, wall) {
  const [nx, ny, nz] = wall.n;
  const ds = nx * source.x + ny * source.y + nz * source.z + wall.d;
  const dl = nx * listener.x + ny * listener.y + nz * listener.z + wall.d;
  if (ds * dl <= 0) return null;
  // Mirror the source through the wall: the echo comes from there.
  const mx = source.x - 2 * ds * nx;
  const my = source.y - 2 * ds * ny;
  const mz = source.z - 2 * ds * nz;
  const path = Math.hypot(mx - listener.x, my - listener.y, mz - listener.z);
  const direct = Math.hypot(source.x - listener.x, source.y - listener.y, source.z - listener.z);
  if (path > (wall.reach ?? 220)) return null;
  // Gain: how much the surface reflects; the distance falls off in the panner (the echo
  // plays from the mirror image, `path` away).
  return { delay: (path - direct) / 343, gain: wall.absorb ?? 0.55, position: { x: mx, y: my, z: mz } };
}
