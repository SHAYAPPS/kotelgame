// Which death animation plays: the body falls away from the shot. Each death clip's fall
// direction comes from its root motion (manifest `rootEnd`, model space: x = the body's left,
// z = its front). Pure logic (unit-tested).

export const DEATH_CLIPS = ['death_front', 'death_back', 'death_left', 'death_right', 'death_headshot_front', 'death_headshot_back', 'death_crouch_headshot'];

/**
 * @param {{ facing: number, dir: { x: number, z: number } | null, zone?: string|null, crouched?: boolean,
 *   rand?: () => number, meta: Record<string, { rootEnd?: number[] }>,
 *   free?: ((dir: { x: number, z: number }, dist: number) => number) | null }} o
 *   dir: the killing shot's direction (shooter -> victim, horizontal); free: meters of room
 *   along a world direction (walls: pick a death that doesn't fall into them)
 * @returns {string} clip name
 */
export function pickDeath({ facing, dir, zone = null, crouched = false, rand = Math.random, meta, free = null }) {
  const sin = Math.sin(facing);
  const cos = Math.cos(facing);
  let dx = dir?.x ?? sin; // no direction: fall backward
  let dz = dir?.z ?? cos;
  const len = Math.hypot(dx, dz) || 1;
  dx /= len;
  dz /= len;
  let best = null;
  let bestScore = -Infinity;
  for (const name of DEATH_CLIPS) {
    const end = meta[name]?.rootEnd;
    if (!end) continue;
    const [lx, lz] = end;
    const d = Math.hypot(lx, lz) || 1;
    // Model space -> world: front = (-sin, -cos), left = (-cos, sin).
    const wx = (-sin * lz - cos * lx) / d;
    const wz = (-cos * lz + sin * lx) / d;
    let score = wx * dx + wz * dz; // falling along the shot
    const head = name.includes('headshot');
    if (zone === 'head' && head) score += 0.35;
    if (zone !== 'head' && head && !name.includes('crouch')) score -= 0.2;
    const crouchClip = name.includes('crouch');
    if (crouched && crouchClip) score += 0.4;
    if (!crouched && crouchClip) score -= 0.4;
    score += rand() * 0.15;
    if (free) {
      const need = d + 0.45;
      const room = free({ x: wx, z: wz }, need);
      if (room < need) score -= 2 * (1 - room / need);
    }
    if (score > bestScore) {
      bestScore = score;
      best = name;
    }
  }
  return best ?? 'death_front';
}
