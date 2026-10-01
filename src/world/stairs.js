// Stair flights as zones: rectangles on the ground (x0..x1, z0..z1) with the uphill direction
// (unit, XZ). The level lists its flights (KotelLevel `stairZones`); Game hangs them on the
// collision world (`world.stairZones`) so NPCs and views can ask "on stairs, going up or down?".

/**
 * Where a body is relative to the flights. `out.on` 0/1 (inside a flight, moving across it),
 * `out.dir` +1 up / -1 down, `out.zone` the flight (or null).
 * @param {object[]} zones
 * @param {number} x @param {number} z position
 * @param {number} vx @param {number} vz horizontal velocity (or facing direction)
 * @param {number} margin m added at the bottom and top of each flight (start / stop early)
 */
export function stairsAt(zones, x, z, vx, vz, out, margin = 0) {
  out.on = 0;
  out.zone = null;
  if (!zones) return out;
  const v = Math.hypot(vx, vz);
  for (const s of zones) {
    // Margin only along the climb (the flight's bottom and top edges).
    const mx = Math.abs(s.up[0]) * margin;
    const mz = Math.abs(s.up[1]) * margin;
    if (x < s.x0 - mx || x > s.x1 + mx || z < s.z0 - mz || z > s.z1 + mz) continue;
    out.zone = s;
    if (v < 1e-3) return out;
    const along = (vx * s.up[0] + vz * s.up[1]) / v;
    if (Math.abs(along) < 0.4) return out; // walking along a step: level
    out.on = 1;
    out.dir = along > 0 ? 1 : -1;
    return out;
  }
  return out;
}
