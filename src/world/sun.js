// Where the sun is for a place, date and local clock time (NOAA's simplified solar
// position equations; good to a fraction of a degree). Pure, unit-tested.

const RAD = Math.PI / 180;

/**
 * @param {{ lat: number, lon: number, date: string, time: string, utcOffset: number }} o
 *   lat/lon in degrees (east positive), date 'YYYY-MM-DD', time 'HH:MM' local, utcOffset hours
 * @returns {{ elevation: number, azimuth: number }} radians; azimuth clockwise from north
 */
export function solarPosition({ lat, lon, date, time, utcOffset }) {
  const [Y, M, D] = date.split('-').map(Number);
  const [h, m] = time.split(':').map(Number);
  const start = Date.UTC(Y, 0, 1);
  const day = Math.floor((Date.UTC(Y, M - 1, D) - start) / 86400000) + 1;
  const hourUTC = h + m / 60 - utcOffset;
  const g = ((2 * Math.PI) / 365) * (day - 1 + (hourUTC - 12) / 24); // fractional year
  const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl =
    0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const trueSolarMin = (hourUTC * 60 + eqTime + 4 * lon + 1440) % 1440;
  const ha = (trueSolarMin / 4 - 180) * RAD; // hour angle
  const phi = lat * RAD;
  const cosZen = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(ha);
  const zen = Math.acos(Math.max(-1, Math.min(1, cosZen)));
  const elevation = Math.PI / 2 - zen;
  // Azimuth clockwise from north.
  let az = Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(phi) - Math.tan(decl) * Math.cos(phi)) + Math.PI;
  az = ((az % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return { elevation, azimuth: az };
}

/**
 * Unit vector toward the sun in level space (+X east, +Y up, +Z south).
 * @param {{ elevation: number, azimuth: number }} p
 */
export function sunDirection({ elevation, azimuth }, out) {
  const c = Math.cos(elevation);
  return out.set(Math.sin(azimuth) * c, Math.sin(elevation), -Math.cos(azimuth) * c);
}
