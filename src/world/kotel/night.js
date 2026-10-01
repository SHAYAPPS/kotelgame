import { BoxGeometry, CanvasTexture, CylinderGeometry, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace } from 'three';
import { KOTEL } from './config.js';
import { PropType, placement } from './instancing.js';

// The plaza at night (Mission 1: the night of the final Selichot): floodlights on tall poles
// in the prayer area wash the wall in warm light, small uplights at its foot graze the lower
// courses, the lamp posts light the plaza, two giant screens and their loudspeakers stand
// ready for the midnight service. Returns the lights (world/NightLights.js: drawn in every lit
// material's shader, no shadows) and the glowing fixtures' materials (their glow follows the
// night's level).

const WARM = 0xffc27a; // sodium-ish floodlight
const LAMP = 0xffcf96;
const SCREEN = 0xd8e4ff;

const box = (w, h, d) => new BoxGeometry(w, h, d);
const cyl = (r, h, seg = 8) => new CylinderGeometry(r, r, h, seg);

/** A glowing fixture material: its emissive strength is set by the night's level. */
function glowMaterial(color, strength, base = 0x2a2a2a) {
  const m = new MeshStandardMaterial({ color: base, emissive: color, emissiveIntensity: 0, roughness: 0.5 });
  m.userData.glow = strength;
  return m;
}

/** The giant screen's picture: the service, live (a still), with the night's name. */
function screenTexture() {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 576;
  const g = c.getContext('2d');
  // A warm picture of the wall at night: stone courses, a bright band of worshipers.
  const sky = g.createLinearGradient(0, 0, 0, 576);
  sky.addColorStop(0, '#0b0f1c');
  sky.addColorStop(0.45, '#4a3420');
  sky.addColorStop(1, '#1a120b');
  g.fillStyle = sky;
  g.fillRect(0, 0, 1024, 576);
  g.fillStyle = '#c99a5a';
  g.fillRect(0, 120, 1024, 330);
  for (let y = 120; y < 450; y += 22) {
    g.fillStyle = 'rgba(70, 45, 20, 0.45)';
    g.fillRect(0, y, 1024, 2);
    for (let x = (y / 22) % 2 ? 0 : 60; x < 1024; x += 120) g.fillRect(x, y, 2, 22);
  }
  g.fillStyle = 'rgba(15, 12, 10, 0.9)';
  for (let i = 0; i < 140; i++) {
    const x = (i * 97) % 1024;
    const h = 40 + ((i * 37) % 30);
    g.fillRect(x, 450 - h, 9, h);
    g.beginPath();
    g.arc(x + 4.5, 450 - h - 6, 6, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = 'rgba(0, 0, 0, 0.55)';
  g.fillRect(0, 470, 1024, 106);
  g.fillStyle = '#ffe2a8';
  g.font = 'bold 64px system-ui, Arial, sans-serif';
  g.textAlign = 'center';
  g.direction = 'rtl';
  g.fillText('סליחות · הכותל המערבי', 512, 535);
  g.fillStyle = '#ff5050';
  g.beginPath();
  g.arc(70, 60, 14, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ffffff';
  g.font = 'bold 34px system-ui, Arial, sans-serif';
  g.textAlign = 'left';
  g.direction = 'ltr';
  g.fillText('LIVE', 94, 72);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/**
 * @param {import('three').Group} root
 * @param {(key: string) => import('three').Material} m the level's materials
 * @param {(x: number, z: number) => number} groundY
 * @returns {{ lights: object[], glows: import('three').Material[], props: PropType[] }}
 */
export function buildNight(root, m, groundY) {
  const lights = [];
  const glows = [];
  const metal = m('metalDark');
  const { wall, prayer, plaza } = KOTEL;

  // The lamp posts' lanterns glow; each post lights the plaza around it.
  const lampGlass = m('lampGlass');
  lampGlass.emissive.set(LAMP);
  lampGlass.userData.glow = 5;
  glows.push(lampGlass);
  for (const x of [-42, -67, -94]) {
    for (let z = plaza.northZ + 6; z < plaza.southZ - 3; z += 13) {
      lights.push({ position: [x, groundY(x, z) + 5, z], color: LAMP, intensity: 32, range: 13 });
    }
  }

  // Floodlight poles at the back of the prayer area, two heads each, aimed at the wall.
  const floodHead = glowMaterial(WARM, 9);
  glows.push(floodHead);
  const pole = new PropType('flood-pole', { size: [0.4, 12, 0.4] });
  pole.part(cyl(0.16, 0.6, 8), metal, [0, 0.3, 0]);
  pole.part(cyl(0.09, 11.4, 8), metal, [0, 6.3, 0]);
  pole.part(box(0.2, 0.2, 1.4), metal, [0, 11.8, 0]);
  for (const dz of [-0.5, 0.5]) {
    pole.part(box(0.45, 0.4, 0.42), metal, [0.12, 11.55, dz], [0, 0, -0.3]);
    pole.part(box(0.04, 0.34, 0.36), floodHead, [0.36, 11.48, dz], [0, 0, -0.3]); // the lens, facing the wall
  }
  const poleX = -prayer.depth + 2.5;
  for (const z of [-24, -12, 0, 12, 21.5, 27.5]) {
    pole.add(placement(poleX, 0, z, 0));
    lights.push({ position: [poleX + 0.4, 11.4, z], direction: [-poleX, 10.5 - 11.4, 0], cone: 0.5, soft: 0.85, color: WARM, intensity: 5200, range: 52 });
  }

  // Uplights in the paving at the wall's foot: grazing light on the lower courses.
  const upLens = glowMaterial(WARM, 6);
  glows.push(upLens);
  const up = new PropType('wall-uplight', null);
  up.part(box(0.5, 0.12, 0.3), metal, [0, 0.06, 0]);
  up.part(box(0.44, 0.02, 0.24), upLens, [0, 0.125, 0]);
  for (let z = wall.prayerZ[0] + 2; z <= wall.prayerZ[1] - 2; z += 4.6) {
    up.add(placement(wall.faceX - 1.1, 0, z, 0));
    lights.push({ position: [wall.faceX - 1.0, 0.25, z], direction: [0.3, 1, 0], cone: 0.62, soft: 0.75, color: WARM, intensity: 30, range: 11 });
  }

  // Two giant screens on trusses for the midnight service, facing the plaza, with loudspeakers.
  const screenMat = new MeshStandardMaterial({ color: 0x050505, emissive: 0xffffff, emissiveMap: screenTexture(), emissiveIntensity: 0, roughness: 0.35 });
  screenMat.userData.glow = 2.2;
  glows.push(screenMat);
  const truss = new MeshStandardMaterial({ color: 0x8a8d92, roughness: 0.45, metalness: 0.6 });
  const black = new MeshStandardMaterial({ color: 0x111214, roughness: 0.6 });
  const W = 7.2;
  const H = 4.05;
  const BOTTOM = 3.2;
  const screen = new PropType('giant-screen', { size: [0.8, BOTTOM + H, W + 1], center: [0, (BOTTOM + H) / 2, 0] });
  for (const dz of [-W / 2 - 0.25, W / 2 + 0.25]) screen.part(box(0.35, BOTTOM + H + 0.4, 0.35), truss, [0, (BOTTOM + H + 0.4) / 2, dz]);
  screen.part(box(0.35, 0.35, W + 0.9), truss, [0, BOTTOM + H + 0.25, 0]);
  screen.part(box(0.3, H + 0.2, W + 0.2), black, [0.05, BOTTOM + H / 2, 0]);
  screen.part(new PlaneGeometry(W, H).rotateY(-Math.PI / 2), screenMat, [-0.11, BOTTOM + H / 2, 0]);
  // Speaker columns hanging from the truss ends.
  for (const dz of [-W / 2 - 0.9, W / 2 + 0.9]) screen.part(box(0.6, 2.4, 0.6), black, [0, BOTTOM + H - 1.0, dz]);
  // Ballast at the feet.
  for (const dz of [-W / 2 - 0.25, W / 2 + 0.25]) screen.part(box(1.2, 0.5, 1.2), black, [0, 0.25, dz]);
  for (const z of [-21, 36]) {
    const x = -prayer.depth - 6;
    screen.add(placement(x, groundY(x, z), z, 0));
    lights.push({ position: [x - 1.5, BOTTOM + H / 2, z], direction: [-1, -0.35, 0], cone: 1.05, soft: 0.6, color: SCREEN, intensity: 55, range: 22 });
  }

  // Loudspeaker poles along the plaza (for the service, far from the wall).
  const speaker = new PropType('speaker-pole', { size: [0.3, 6.5, 0.3] });
  speaker.part(cyl(0.08, 6.4, 8), metal, [0, 3.2, 0]);
  speaker.part(box(0.45, 1.1, 0.5), black, [-0.2, 5.7, 0], [0, 0, 0.12]);
  for (const [x, z] of [[-48, -32], [-48, 8], [-48, 48], [-74, -20], [-74, 30], [-99, 4]]) speaker.add(placement(x, groundY(x, z), z, 0));

  return { lights, glows, props: [pole, up, screen, speaker] };
}

/** Lit windows at night: a warm glow from inside (the facades' lit share). */
export function litWindowMaterial() {
  const g = glowMaterial(0xffb46e, 1.6, 0x1b232b);
  g.roughness = 0.2;
  return g;
}

